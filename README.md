# Repeat Previous Command

Repeat the most recently attempted Obsidian command with a shortcut of your choice.

## Usage

1. Enable Repeat Previous Command.
2. Open **Settings → Hotkeys**.
3. Assign a shortcut to **Repeat Previous Command: Repeat previous**.
4. Run any Obsidian command, then use your shortcut to run it again.

The plugin remembers one command for the current session. Repeated presses keep running the same command. The repeat action itself and commands invoked internally during replay do not replace the remembered command.

## Limitations

Obsidian does not expose complete command history through its public plugin API. This plugin narrowly instruments the internal command manager, so an Obsidian update could require a compatibility update.

Actions that do not pass through Obsidian's command manager cannot be repeated.

## Development

Requirements:

- Node.js 24
- pnpm 10.20.0 through Corepack

```sh
corepack pnpm install
corepack pnpm check
```

`pnpm dev` watches the TypeScript source and writes `main.js`. The production bundle and `manifest.json` are attached to tagged GitHub releases.

## License

[MIT](LICENSE)
