# Repeat Previous Action

Repeat the most recently attempted Obsidian action with a shortcut of your choice.

## Usage

1. Enable Repeat Previous Action.
2. Open **Settings → Hotkeys**.
3. Assign a shortcut to **Repeat Previous Action: Repeat previous**.
4. Run any repeatable Obsidian action, then use your shortcut to run it again.

The plugin remembers one action for the current session. Repeated presses keep running the same action. The repeat action itself, transient UI launchers, and commands invoked internally during replay do not replace the remembered action.

## Limitations

Obsidian does not expose complete action history through its public plugin API. This plugin narrowly instruments the internal command manager and command palette selection handler, so an Obsidian update could require a compatibility update.

Actions that bypass both internal execution paths cannot be repeated.

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

`make dev` builds the plugin, symlinks `main.js` and `manifest.json` into
`$HOME/Obsidian/SELF`, and starts the TypeScript watcher. Override the vault for any vault
target:

```sh
make link VAULT=/path/to/vault
make reload VAULT=/path/to/vault
make unlink VAULT=/path/to/vault
```

`reload` requires the Hot Reload community plugin. Vault targets remove a stale `styles.css`, but
this plugin does not create or ship one.

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
`main.js` and `manifest.json` artifacts.

## License

[MIT](LICENSE)
