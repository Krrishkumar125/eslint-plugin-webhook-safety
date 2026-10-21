import type { Rule } from 'eslint';
import type * as ESTree from 'estree';

export type Node = ESTree.Node & { parent?: Node };
export type FunctionNode =
  ESTree.FunctionDeclaration | ESTree.FunctionExpression | ESTree.ArrowFunctionExpression;

const REPO = 'https://github.com/Krrishkumar125/eslint-plugin-webhook-safety';
export const docsUrl = (name: string): string => `${REPO}/blob/main/docs/rules/${name}.md`;

export const WEBHOOK_PATH = /webhook|\/hooks?(?:\/|$)/i;
const CONSTRUCT_EVENT = new Set(['constructEvent', 'constructEventAsync']);
const ROUTE_METHODS = new Set(['post', 'put', 'all']);

export function isFunction(
  node: Node | null | undefined,
): node is FunctionNode & { parent?: Node } {
  return (
    !!node &&
    (node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression')
  );
}

/** Depth-first walk over every descendant node (including the root). */
export function walk(root: Node, visit: (node: Node) => void): void {
  const stack: Node[] = [root];
  while (stack.length) {
    const node = stack.pop() as Node;
    visit(node);
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const value = (node as unknown as Record<string, unknown>)[key];
      const children = Array.isArray(value) ? value : [value];
      for (const child of children) {
        if (child && typeof child === 'object' && typeof (child as Node).type === 'string') {
          stack.push(child as Node);
        }
      }
    }
  }
}

/** The name of the called function: `a.b.c()` -> "c", `fn()` -> "fn". */
export function calleeName(node: ESTree.CallExpression | ESTree.NewExpression): string | undefined {
  const callee = node.callee;
  if (callee.type === 'Identifier') return callee.name;
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier'
  ) {
    return callee.property.name;
  }
  return undefined;
}

/** `express.json()` -> ["express", "json"] for a simple `object.method()` call. */
export function memberCall(node: Node): [string, string] | undefined {
  if (node.type !== 'CallExpression') return undefined;
  const callee = node.callee;
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.property.type === 'Identifier'
  ) {
    return [callee.object.name, callee.property.name];
  }
  return undefined;
}

const PARSER_OWNERS = new Set(['express', 'bodyParser', 'bodyparser']);
export function isJsonParser(node: Node): boolean {
  const m = memberCall(node);
  return !!m && PARSER_OWNERS.has(m[0]) && m[1] === 'json';
}
export function isRawParser(node: Node): boolean {
  const m = memberCall(node);
  return !!m && PARSER_OWNERS.has(m[0]) && (m[1] === 'raw' || m[1] === 'text');
}
export function isBodyParser(node: Node): boolean {
  const m = memberCall(node);
  return !!m && PARSER_OWNERS.has(m[0]) && ['json', 'raw', 'text', 'urlencoded'].includes(m[1]);
}

export function isConstructEvent(node: Node): node is ESTree.CallExpression {
  if (node.type !== 'CallExpression') return false;
  const name = calleeName(node);
  return !!name && CONSTRUCT_EVENT.has(name);
}

export function findAll<T extends Node>(root: Node, test: (n: Node) => n is T): T[] {
  const out: T[] = [];
  walk(root, (n) => {
    if (test(n)) out.push(n);
  });
  return out;
}

export function enclosingFunction(node: Node): FunctionNode | undefined {
  let cur = node.parent;
  while (cur) {
    if (isFunction(cur)) return cur;
    cur = cur.parent;
  }
  return undefined;
}

function literalString(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

export interface Route {
  call: ESTree.CallExpression;
  /** `app` in `app.post(...)`, when it is a plain identifier. */
  owner?: string;
  path: string;
  middlewares: Node[];
  handler: FunctionNode;
}

/** `app.post('/webhook', ...middlewares, handler)` (Express, Hono, Fastify-style routers). */
export function asRoute(node: Node): Route | undefined {
  if (node.type !== 'CallExpression') return undefined;
  const callee = node.callee;
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    callee.property.type !== 'Identifier'
  ) {
    return undefined;
  }
  if (!ROUTE_METHODS.has(callee.property.name)) return undefined;
  const args = node.arguments as Node[];
  const path = literalString(args[0]);
  const handler = args[args.length - 1];
  if (path === undefined || args.length < 2 || !isFunction(handler)) return undefined;
  return {
    call: node,
    owner: callee.object.type === 'Identifier' ? callee.object.name : undefined,
    path,
    middlewares: args.slice(1, -1),
    handler,
  };
}

/** Exported Next.js App Router `POST` handler, e.g. `export async function POST(req)`. */
export function isNextPostHandler(fn: Node): boolean {
  const parent = (fn as Node).parent;
  if (fn.type === 'FunctionDeclaration') {
    return fn.id?.name === 'POST' && parent?.type === 'ExportNamedDeclaration';
  }
  if (parent?.type === 'VariableDeclarator') {
    return (
      parent.id.type === 'Identifier' &&
      parent.id.name === 'POST' &&
      parent.parent?.parent?.type === 'ExportNamedDeclaration'
    );
  }
  return false;
}

export function isWebhookFile(context: Rule.RuleContext): boolean {
  return WEBHOOK_PATH.test(context.filename.replace(/\\/g, '/'));
}

/** Name bound to the result of a constructEvent call, or destructured `id` presence. */
export function eventBinding(
  call: ESTree.CallExpression,
): { kind: 'identifier'; name: string } | { kind: 'pattern'; hasId: boolean } | undefined {
  let cur = (call as Node).parent;
  if (cur?.type === 'AwaitExpression') cur = cur.parent;
  let target: Node | undefined;
  if (cur?.type === 'VariableDeclarator') target = cur.id as Node;
  else if (cur?.type === 'AssignmentExpression') target = cur.left as Node;
  if (!target) return undefined;
  if (target.type === 'Identifier') return { kind: 'identifier', name: target.name };
  if (target.type === 'ObjectPattern') {
    const hasId = target.properties.some(
      (p) =>
        p.type === 'RestElement' ||
        (p.key.type === 'Identifier' && p.key.name === 'id') ||
        (p.key.type === 'Literal' && p.key.value === 'id'),
    );
    return { kind: 'pattern', hasId };
  }
  return undefined;
}
