# Contributing to Again

Thanks for helping improve Again. Bug reports, focused fixes, tests, and documentation updates are welcome.

## Report an issue

Search the existing issues before opening a new one. For bugs, include:

- Your Obsidian and Again versions
- Your operating system
- Steps that reproduce the problem
- The command you expected Again to repeat
- What you expected and what happened instead
- Relevant console errors, if any

Do not include private vault content. Reduce examples to the smallest setup that still reproduces the problem.

## Set up the project

You need Node.js 24, pnpm 10.20.0, and Make.

```sh
git clone https://github.com/cmptr/obsidian-again.git
cd obsidian-again
pnpm install --frozen-lockfile
make check
```

The repository also includes a Nix flake and `.envrc` for direnv users.

## Develop locally

Use the Makefile for common tasks:

```sh
make build       # Build the production plugin
make test        # Run the test suite once
make test-watch  # Run tests while editing
make format      # Format supported files
make check       # Run formatting, lint, types, coverage, and the build
```

To run the development watcher against a vault:

```sh
make dev VAULT=/path/to/vault
```

You can use `make link` or `make symlink` with the same `VAULT` argument to install the current build. `make reload` requires the Hot Reload community plugin.

## Make a change

Keep each change focused. Add or update tests for behavior changes, and update user documentation when commands or workflows change. Do not commit generated `main.js`, coverage output, local environment files, or release archives.

Run the full check before opening a pull request:

```sh
make check
```

## Check compatibility

Automated tests cover command observation, replay protection, status-bar behavior, settings persistence, cleanup, and mobile-specific initialization. They are not a substitute for running Obsidian on desktop and mobile.

Before a release, complete this manual smoke test. CI does not run it.

1. Run `make link VAULT=/absolute/path/to/test-vault`, or copy `main.js`, `manifest.json`, and `styles.css` into the vault's `.obsidian/plugins/again/` directory.
2. Load and enable Again on current desktop Obsidian.
3. Assign a hotkey to **Again: Previous** and verify it repeats commands invoked by hotkey and through the command palette.
4. Verify transient launchers such as Quick switcher, Settings, and the command palette do not replace the remembered command.
5. Check the Hidden, Icon only, and Icon and command name status-bar modes in light and dark themes.
6. Verify a long command name truncates visually while its complete accessible label remains available.
7. Disable and re-enable the plugin and verify command history does not persist.
8. Load Again on current Android or iOS Obsidian and verify replay works without a status-bar item or startup console error.
9. Record the platform, OS, and Obsidian versions in the release review.

## Open a pull request

Describe the problem, the approach you took, and how you tested it. Link any related issue and call out user-visible changes. Keep unrelated cleanup in a separate pull request.

Maintainers handle version changes, release tags, attestations, and GitHub release assets.

By submitting a contribution, you agree that it may be distributed under the project's MIT license.
