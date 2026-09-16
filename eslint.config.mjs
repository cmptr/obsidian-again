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
          allowDefaultProject: [
            'eslint.config.mjs',
            'esbuild.config.mjs',
            'manifest.json',
            'version-bump.mjs',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.json'],
      },
    },
  },
  ...obsidianmd.configs.recommended,
  {
    files: ['esbuild.config.mjs', 'version-bump.mjs'],
    rules: {
      'obsidianmd/no-nodejs-modules': 'off',
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
