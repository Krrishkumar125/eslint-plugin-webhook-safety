import type { Rule } from 'eslint';
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

const rule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require a duplicate-event check (using event.id) before a webhook handler performs side effects',
      recommended: true,
      url: docsUrl('require-idempotency'),
    },
    schema: [
      {
        type: 'object',
        properties: { idempotencyFunctions: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      missing:
        'Stripe retries and duplicates webhook deliveries, but this handler never uses `{{name}}.id`. Record processed event ids (unique insert) and skip duplicates before side effects.',
    },
  },
  create(context) {
    const helpers = new Set<string>(
      (context.options[0] as { idempotencyFunctions?: string[] } | undefined)
        ?.idempotencyFunctions ?? [],
    );
    return {
      CallExpression(node) {
        if (!isConstructEvent(node as Node)) return;
        const binding = eventBinding(node);
        if (!binding) return;
        if (binding.kind === 'pattern') {
          if (!binding.hasId)
            context.report({ node, messageId: 'missing', data: { name: 'event' } });
          return;
        }
        const fn = enclosingFunction(node as Node);
        if (!fn) return;
        const name = binding.name;
        let handled = false;
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
          }
        });
        if (!handled) context.report({ node, messageId: 'missing', data: { name } });
      },
    };
  },
};

export default rule;
