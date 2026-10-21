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
  type Node,
} from '../utils.js';

const DEFAULT_VERIFY = /verif|signature|constructEvent|timingSafeEqual|unwrap/i;

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
      walk(fn, (n) => {
        if (found || (n.type !== 'CallExpression' && n.type !== 'NewExpression')) return;
        const name = calleeName(n);
        if (name && (extra.has(name) || DEFAULT_VERIFY.test(name))) found = true;
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
