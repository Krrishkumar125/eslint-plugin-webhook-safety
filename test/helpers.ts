import tsParser from '@typescript-eslint/parser';
import { RuleTester } from 'eslint';

export const ruleTester = new RuleTester({
  languageOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module' },
});
