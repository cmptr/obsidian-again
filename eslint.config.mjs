import json from '@eslint/json';
import obsidianmd from 'eslint-plugin-obsidianmd';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';

export default defineConfig(
  globalIgnores([
    '.direnv',
    '.worktrees',
    'node_modules',
    'coverage',
    'main.js',
    'pnpm-lock.yaml',
    'flake.lock',
  ]),
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.mjs', 'esbuild.config.mjs', 'manifest.json'],
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.json'],
      },
    },
  },
  ...obsidianmd.configs.recommended,
  {
    files: ['src/main.ts'],
    rules: {
      // Again's public command identity intentionally uses the required product terminology.
      'obsidianmd/commands/no-command-in-command-id': 'off',
      'obsidianmd/commands/no-command-in-command-name': 'off',
    },
  },
  {
    files: ['esbuild.config.mjs', 'scripts/release.ts', 'src/main.test.ts'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'obsidianmd/no-nodejs-modules': 'off',
    },
  },
  {
    files: ['scripts/release.ts'],
    rules: {
      'no-console': 'off',
      'obsidianmd/rule-custom-message': 'off',
    },
  },
  {
    files: ['manifest.json'],
    language: 'json/json',
    plugins: {
      json,
      obsidianmd,
    },
    rules: {
      'no-irregular-whitespace': 'off',
      'obsidianmd/validate-manifest': 'error',
    },
  },
);
