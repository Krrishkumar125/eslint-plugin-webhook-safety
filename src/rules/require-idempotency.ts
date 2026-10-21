import type { Rule } from 'eslint';
import type * as ESTree from 'estree';
import {
  calleeName,
  docsUrl,
  enclosingFunction,
  eventBinding,
  isConstructEvent,
  walk,
  type Node,
} from '../utils.js';

const DEFAULT_HELPERS = /idempot|dedup|processed|alreadyHandled|seenEvent/i;

/**
 * Methods that write somewhere when called on an object: ORM/DB writes, queue adds, emails and
 * payment API calls (`db.user.update`, `queue.add`, `resend.emails.send`, `stripe.refunds.create`).
 */
const SIDE_EFFECT_METHODS = new Set([
  'create',
  'createMany',
  'insert',
  'insertOne',
  'insertMany',
  'update',
  'updateOne',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'increment',
  'decrement',
  'save',
  'add',
  'addBulk',
  'enqueue',
  'publish',
  'send',
  'sendMail',
  'sendEmail',
  'charge',
  'capture',
  'refund',
  'transfer',
]);
const NON_EFFECT_OBJECTS = new Set([
  'console',
  'Response',
  'NextResponse',
  'JSON',
  'res',
  'Math',
  'Object',
  'Array',
]);

function rootObject(node: Node): Node {
  let cur = node;
  while (cur.type === 'MemberExpression' || cur.type === 'CallExpression') {
    cur = (cur.type === 'MemberExpression' ? cur.object : cur.callee) as Node;
  }
  return cur;
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Suggest a duplicate-event check (using event.id) before a webhook handler performs side effects directly',
      recommended: true,
      url: docsUrl('require-idempotency'),
    },
    schema: [
      {
        type: 'object',
        properties: {
          idempotencyFunctions: { type: 'array', items: { type: 'string' } },
          strict: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missing:
        'Consider a duplicate-event check: Stripe can deliver `{{name}}` more than once, and this write runs without any use of `{{name}}.id`. Record processed event ids (unique insert) before side effects, or ignore if this write is idempotent. See {{url}}',
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as {
      idempotencyFunctions?: string[];
      strict?: boolean;
    };
    const helpers = new Set<string>(options.idempotencyFunctions ?? []);
    const url = docsUrl('require-idempotency');

    function isSideEffect(call: ESTree.CallExpression): boolean {
      const callee = call.callee as Node;
      if (callee.type === 'MemberExpression') {
        const root = rootObject(callee);
        if (root.type === 'Identifier' && NON_EFFECT_OBJECTS.has(root.name)) return false;
        const name = calleeName(call);
        if (name && SIDE_EFFECT_METHODS.has(name)) return true;
      }
      // Helper calls (local or imported) may dedupe internally, so only count them in strict mode.
      return !!options.strict && !isConstructEvent(call as Node) && call.arguments.length > 0;
    }

    return {
      CallExpression(node) {
        if (!isConstructEvent(node as Node)) return;
        const binding = eventBinding(node);
        if (!binding) return;
        if (binding.kind === 'pattern' && binding.hasId) return;
        const name = binding.kind === 'identifier' ? binding.name : 'event';
        const fn = enclosingFunction(node as Node);
        if (!fn) return;
        const after = node.range?.[1] ?? 0;
        let handled = false;
        let firstEffect: ESTree.CallExpression | undefined;
        walk(fn as Node, (n) => {
          if (handled) return;
          if (
            n.type === 'MemberExpression' &&
            n.object.type === 'Identifier' &&
            n.object.name === name &&
            !n.computed &&
            n.property.type === 'Identifier' &&
            n.property.name === 'id'
          ) {
            handled = true;
          } else if (
            (n.type === 'ReturnStatement' &&
              n.argument?.type === 'Identifier' &&
              n.argument.name === name) ||
            (n.type === 'ArrowFunctionExpression' &&
              n.body.type === 'Identifier' &&
              n.body.name === name)
          ) {
            // A wrapper that only verifies and returns the event; the caller handles duplicates.
            handled = true;
          } else if (n.type === 'CallExpression') {
            const callee = calleeName(n);
            if (callee && (helpers.has(callee) || DEFAULT_HELPERS.test(callee))) handled = true;
            const isConsole =
              n.callee.type === 'MemberExpression' &&
              n.callee.object.type === 'Identifier' &&
              n.callee.object.name === 'console';
            // Whole event handed to another function: assume it may dedupe there.
            if (!isConsole && n.arguments.some((a) => a.type === 'Identifier' && a.name === name)) {
              handled = true;
            }
            if (
              (n.range?.[0] ?? 0) >= after &&
              isSideEffect(n) &&
              (!firstEffect || (n.range?.[0] ?? 0) < (firstEffect.range?.[0] ?? 0))
            ) {
              firstEffect = n;
            }
          }
        });
        if (!handled && firstEffect) {
          context.report({ node: firstEffect, messageId: 'missing', data: { name, url } });
        }
      },
    };
  },
};

export default rule;
