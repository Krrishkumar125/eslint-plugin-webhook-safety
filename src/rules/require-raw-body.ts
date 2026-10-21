import type { Rule } from 'eslint';
import type * as ESTree from 'estree';
import {
  asRoute,
  docsUrl,
  enclosingFunction,
  findAll,
  isConstructEvent,
  isFunction,
  isJsonParser,
  isRawParser,
  type Node,
} from '../utils.js';

/** `express.json({ verify })` keeps the raw bytes (usually on `req.rawBody`), so it is fine. */
function parsesAway(node: Node): boolean {
  if (!isJsonParser(node)) return false;
  const opts = (node as ESTree.CallExpression).arguments[0];
  return !(
    opts?.type === 'ObjectExpression' &&
    opts.properties.some(
      (p) => p.type === 'Property' && p.key.type === 'Identifier' && p.key.name === 'verify',
    )
  );
}

/** constructEvent(req.body, ...) somewhere in the handler: the payload is whatever the parser left. */
function usesParsedBody(fn: Node): boolean {
  return findAll(fn, isConstructEvent).some((c) => {
    const payload = c.arguments[0];
    return (
      payload?.type === 'MemberExpression' &&
      !payload.computed &&
      payload.property.type === 'Identifier' &&
      payload.property.name === 'body'
    );
  });
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    hasSuggestions: true,
    docs: {
      description:
        'Require the raw request body for Stripe signature verification (no JSON parsing before constructEvent)',
      recommended: true,
      url: docsUrl('require-raw-body'),
    },
    schema: [],
    messages: {
      jsonMiddleware:
        'express.json() parses the body before the Stripe signature check, so constructEvent will always fail. Use express.raw() on this route.',
      globalJson:
        '`{{owner}}.use(express.json())` on line {{line}} runs before this webhook route and parses the body, so constructEvent will fail. Register the webhook route first or give it express.raw().',
      parsedJson:
        'The body is parsed with .json() before the Stripe signature check. Read the raw body with .text() and pass it to constructEvent.',
      stringified:
        'JSON.stringify() of a parsed body is not byte-identical to what Stripe signed. Pass the raw body string or Buffer.',
      useRaw: "Replace with express.raw({ type: 'application/json' })",
      useText: 'Read the body with .text() instead',
    },
  },
  create(context) {
    const globalParsers: { owner: string; node: ESTree.CallExpression }[] = [];

    function handlerVerifies(fn: Node): boolean {
      return findAll(fn, isConstructEvent).length > 0;
    }

    return {
      CallExpression(node) {
        const n = node as Node & ESTree.CallExpression;
        const callee = n.callee;
        // app.use(express.json()) / app.use('/', express.json())
        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'use' &&
          callee.object.type === 'Identifier'
        ) {
          const args = n.arguments as Node[];
          const first = args[0];
          const pathless = !(first?.type === 'Literal' && first.value !== '/');
          if (pathless && args.some(parsesAway)) {
            globalParsers.push({ owner: callee.object.name, node: n });
          }
        }

        const route = asRoute(n);
        if (route && handlerVerifies(route.handler) && usesParsedBody(route.handler)) {
          const inlineJson = route.middlewares.filter(parsesAway);
          for (const mw of inlineJson) {
            context.report({
              node: mw,
              messageId: 'jsonMiddleware',
              suggest: [
                {
                  messageId: 'useRaw',
                  fix: (fixer) =>
                    fixer.replaceText(mw, "express.raw({ type: 'application/json' })"),
                },
              ],
            });
          }
          if (!inlineJson.length && !route.middlewares.some(isRawParser)) {
            const earlier = globalParsers.find(
              (p) => p.owner === route.owner && (p.node.range?.[0] ?? 0) < (n.range?.[0] ?? 0),
            );
            if (earlier) {
              context.report({
                node: n,
                messageId: 'globalJson',
                data: { owner: earlier.owner, line: String(earlier.node.loc?.start.line) },
              });
            }
          }
        }

        if (isConstructEvent(n)) {
          const payload = n.arguments[0] as Node | undefined;
          if (
            payload?.type === 'CallExpression' &&
            payload.callee.type === 'MemberExpression' &&
            payload.callee.object.type === 'Identifier' &&
            payload.callee.object.name === 'JSON' &&
            payload.callee.property.type === 'Identifier' &&
            payload.callee.property.name === 'stringify'
          ) {
            context.report({ node: payload, messageId: 'stringified' });
          }
          const fn = enclosingFunction(n);
          if (!fn) return;
          const params = new Set(
            fn.params.flatMap((p) => (p.type === 'Identifier' ? [p.name] : [])),
          );
          const isRequest = (obj: Node): boolean =>
            (obj.type === 'Identifier' && params.has(obj.name)) ||
            (obj.type === 'MemberExpression' &&
              obj.object.type === 'Identifier' &&
              params.has(obj.object.name) &&
              obj.property.type === 'Identifier' &&
              obj.property.name === 'req');
          walkSameFunction(fn, (c) => {
            if (
              c.type === 'CallExpression' &&
              c.arguments.length === 0 &&
              c.callee.type === 'MemberExpression' &&
              !c.callee.computed &&
              c.callee.property.type === 'Identifier' &&
              c.callee.property.name === 'json' &&
              isRequest(c.callee.object as Node) &&
              (c.range?.[0] ?? 0) < (n.range?.[0] ?? 0)
            ) {
              const prop = c.callee.property;
              context.report({
                node: c,
                messageId: 'parsedJson',
                suggest: [
                  { messageId: 'useText', fix: (fixer) => fixer.replaceText(prop, 'text') },
                ],
              });
            }
          });
        }
      },
    };
  },
};

function walkSameFunction(fn: Node, visit: (n: Node) => void): void {
  const body = (fn as ESTree.Function).body as Node;
  const stack: Node[] = [body];
  while (stack.length) {
    const node = stack.pop() as Node;
    visit(node);
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const value = (node as unknown as Record<string, unknown>)[key];
      for (const child of Array.isArray(value) ? value : [value]) {
        if (child && typeof child === 'object' && typeof (child as Node).type === 'string') {
          if (!isFunction(child as Node)) stack.push(child as Node);
        }
      }
    }
  }
}

export default rule;
