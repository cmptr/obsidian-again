# Again

Repeat the most recently attempted Obsidian command with a shortcut of your choice.

## Usage

1. Enable Again.
2. Open **Settings → Hotkeys**.
3. Assign a shortcut to **Again: Previous command**.
4. Run any repeatable Obsidian command, then use your shortcut to run it again.

Again remembers one command for the current session. Repeated presses keep running the same command. The **Previous command** command, transient UI launchers, and commands invoked internally during replay do not replace the remembered command.

On desktop, the status bar shows the remembered command using the `rotate-ccw` icon and command name. Choose **Hidden**, **Icon only**, or **Icon and command name** under **Settings → Again**. The status bar remains hidden until a command is remembered. Mobile remains fully supported without the desktop status item.

## Limitations

Obsidian does not expose complete command history through its public plugin API. Again narrowly instruments the internal command manager and command palette selection handler, so an Obsidian update could require a compatibility update.

Commands that bypass both internal execution paths cannot be repeated.

## Development

Requirements:

- Node.js 24
- pnpm 10.20.0 through Corepack

The Makefile is the main development entry point:

```sh
corepack pnpm install
make help
make check
```

`make dev` builds the plugin, symlinks `main.js`, `manifest.json`, and `styles.css` into
`$HOME/Obsidian/SELF`, and starts the TypeScript watcher. Override the vault for any vault
target:

```sh
make link VAULT=/path/to/vault
make reload VAULT=/path/to/vault
make unlink VAULT=/path/to/vault
```

`reload` requires the Hot Reload community plugin.

The production bundle remains at `main.js` in the repository root. `make check` verifies formatting,
lint, types, 90% coverage thresholds, tests, and the production build.

### Releases

Add release notes under `Unreleased` in `CHANGELOG.md`, commit them, and cut a local release from a
clean `main` branch:

```sh
make release-patch # or release-minor / release-major
```

The release target synchronizes version files, runs the full quality gate, creates a local commit and
annotated tag, then prints the explicit push command. It never pushes or publishes automatically.
After the tag is deliberately pushed, the GitHub workflow creates the draft release with root-level
`main.js`, `manifest.json`, and `styles.css` artifacts.

## License

[MIT](LICENSE)
