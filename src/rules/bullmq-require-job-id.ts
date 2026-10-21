import type { Rule } from 'eslint';
import type * as ESTree from 'estree';
import {
  asRoute,
  docsUrl,
  eventBinding,
  enclosingFunction,
  findAll,
  isConstructEvent,
  isNextPostHandler,
  isWebhookFile,
  WEBHOOK_PATH,
  type FunctionNode,
  type Node,
} from '../utils.js';

const QUEUE_NAME = /queue$/i;

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    hasSuggestions: true,
    docs: {
      description:
        'Require a jobId (or deduplication id) when a webhook handler adds a BullMQ job, so retried deliveries do not enqueue duplicates',
      recommended: true,
      url: docsUrl('bullmq-require-job-id'),
    },
    schema: [],
    messages: {
      missing:
        'Webhook deliveries are retried, so this queue.add() will enqueue the same work twice. Pass a stable jobId such as the event id.',
      addJobId: 'Add { jobId: {{name}}.id }',
    },
  },
  create(context) {
    const webhookFile = isWebhookFile(context);
    const queues = new Set<string>();

    function isWebhookFunction(fn: FunctionNode): boolean {
      const parent = (fn as Node).parent;
      if (parent) {
        const route = asRoute(parent);
        if (route && route.handler === fn && WEBHOOK_PATH.test(route.path)) return true;
      }
      if (webhookFile && isNextPostHandler(fn as Node)) return true;
      return findAll(fn as Node, isConstructEvent).some((c) => enclosingFunction(c) === fn);
    }

    function eventName(fn: FunctionNode): string | undefined {
      for (const c of findAll(fn as Node, isConstructEvent)) {
        const b = eventBinding(c);
        if (b?.kind === 'identifier') return b.name;
      }
      return undefined;
    }

    function isQueue(obj: Node): boolean {
      if (obj.type === 'Identifier') return queues.has(obj.name) || QUEUE_NAME.test(obj.name);
      return (
        obj.type === 'MemberExpression' &&
        !obj.computed &&
        obj.property.type === 'Identifier' &&
        QUEUE_NAME.test(obj.property.name)
      );
    }

    return {
      VariableDeclarator(node) {
        if (
          node.id.type === 'Identifier' &&
          node.init?.type === 'NewExpression' &&
          node.init.callee.type === 'Identifier' &&
          node.init.callee.name === 'Queue'
        ) {
          queues.add(node.id.name);
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== 'MemberExpression' ||
          callee.computed ||
          callee.property.type !== 'Identifier' ||
          callee.property.name !== 'add' ||
          node.arguments.length < 2 ||
          node.arguments.length > 3 ||
          !isQueue(callee.object as Node)
        ) {
          return;
        }
        const opts = node.arguments[2] as Node | undefined;
        if (opts && opts.type !== 'ObjectExpression') return;
        if (
          opts?.type === 'ObjectExpression' &&
          opts.properties.some(
            (p) =>
              p.type === 'SpreadElement' ||
              (p.key.type === 'Identifier' && ['jobId', 'deduplication'].includes(p.key.name)),
          )
        ) {
          return;
        }
        let fn = enclosingFunction(node as Node);
        let webhookFn: FunctionNode | undefined;
        while (fn) {
          if (isWebhookFunction(fn)) {
            webhookFn = fn;
            break;
          }
          fn = enclosingFunction(fn as Node);
        }
        if (!webhookFn) return;
        const name = eventName(webhookFn);
        const suggest: Rule.SuggestionReportDescriptor[] = [];
        if (name) {
          const prop = `jobId: ${name}.id`;
          suggest.push({
            messageId: 'addJobId',
            data: { name },
            fix: (fixer) => {
              if (!opts)
                return fixer.insertTextAfter(node.arguments[1] as ESTree.Node, `, { ${prop} }`);
              const obj = opts as ESTree.ObjectExpression;
              const last = obj.properties[obj.properties.length - 1];
              return last
                ? fixer.insertTextAfter(last, `, ${prop}`)
                : fixer.replaceText(obj, `{ ${prop} }`);
            },
          });
        }
        context.report({ node, messageId: 'missing', suggest });
      },
    };
  },
};

export default rule;
