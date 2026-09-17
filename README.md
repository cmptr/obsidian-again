# Again

Repeat the most recently executed command.

## Installation

### Community plugins

1. Open **Settings → Community plugins** in Obsidian.
2. Select **Browse** and search for **Again**.
3. Select **Install**, then **Enable**.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub release.
2. Create `<vault>/.obsidian/plugins/again/`.
3. Copy the downloaded files into that directory.
4. Reload Obsidian.
5. Open **Settings → Community plugins** and enable **Again**.

## Usage

1. Enable Again.
2. Open **Settings → Hotkeys**.
3. Assign a shortcut to **Again: Previous**.
4. Run any repeatable Obsidian command, then use your shortcut to run it again.

Again remembers one command for the current session. Repeated presses keep running the same command. The **Previous** command, transient UI launchers, and commands invoked internally during replay do not replace the remembered command.

On desktop, the status bar shows the remembered command using the `rotate-ccw` icon and command name. Choose **Hidden**, **Icon only**, or **Icon and command name** under **Settings → Again**. The status bar remains hidden until a command is remembered. Mobile remains fully supported without the desktop status item.

## Limitations

Obsidian does not expose complete command history through its public plugin API. Again narrowly instruments the internal command manager and command palette selection handler, so an Obsidian update could require a compatibility update.

Commands that bypass both internal execution paths cannot be repeated.

## License

[MIT](LICENSE)
