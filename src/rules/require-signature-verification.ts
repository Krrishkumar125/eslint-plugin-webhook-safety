import type { Rule } from 'eslint';
import {
  asRoute,
  calleeName,
  docsUrl,
  isBodyParser,
  isNextPostHandler,
  isWebhookFile,
  walk,
  WEBHOOK_PATH,
  type FunctionNode,
  type Node,
} from '../utils.js';

const DEFAULT_VERIFY = /verif|signature|constructEvent|timingSafeEqual|unwrap/i;
/** Authenticated endpoints (e.g. a CRUD API for managing webhook subscriptions) are not receivers. */
const AUTH_CALL = /auth|session|apiKey|permission|currentUser|requireUser/i;

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require webhook handlers to verify the request signature',
      recommended: true,
      url: docsUrl('require-signature-verification'),
    },
    schema: [
      {
        type: 'object',
        properties: { verifyFunctions: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      missing:
        'This webhook handler never verifies the request signature, so anyone can forge events. Call stripe.webhooks.constructEvent() (or your provider’s verify function) before trusting the body.',
    },
  },
  create(context) {
    const extra = new Set<string>(
      (context.options[0] as { verifyFunctions?: string[] } | undefined)?.verifyFunctions ?? [],
    );
    const webhookFile = isWebhookFile(context);

    function verifies(fn: Node): boolean {
      let found = false;
      const params = new Set(
        (fn as FunctionNode).params.flatMap((p) => (p.type === 'Identifier' ? [p.name] : [])),
      );
      const isRequest = (a: Node): boolean =>
        (a.type === 'Identifier' && params.has(a.name)) ||
        (a.type === 'MemberExpression' &&
          a.object.type === 'Identifier' &&
          params.has(a.object.name) &&
          !a.computed &&
          a.property.type === 'Identifier' &&
          a.property.name === 'req');
      walk(fn, (n) => {
        if (found || (n.type !== 'CallExpression' && n.type !== 'NewExpression')) return;
        // The whole request handed to a helper (often in another file) that may verify it.
        const root = n.callee.type === 'MemberExpression' ? n.callee.object : undefined;
        const builtin =
          root?.type === 'Identifier' &&
          ['console', 'JSON', 'Response', 'NextResponse', 'res', 'Object'].includes(root.name);
        if (!builtin && (n.arguments as Node[]).some(isRequest)) {
          found = true;
          return;
        }
        const name = calleeName(n);
        if (name && (extra.has(name) || DEFAULT_VERIFY.test(name) || AUTH_CALL.test(name)))
          found = true;
      });
      return found;
    }

    function check(fn: Node): void {
      if (!verifies(fn)) context.report({ node: fn, messageId: 'missing' });
    }

    return {
      CallExpression(node) {
        const route = asRoute(node as Node);
        if (!route || !WEBHOOK_PATH.test(route.path)) return;
        // Any non-body-parser middleware may be doing the verification.
        if (route.middlewares.some((m) => !isBodyParser(m))) return;
        check(route.handler);
      },
      'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'(node: Rule.Node) {
        if (webhookFile && isNextPostHandler(node as Node)) check(node as Node);
      },
    };
  },
};

export default rule;
