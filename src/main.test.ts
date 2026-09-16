import type { Command } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandManager } from './command-execution-patch';

const obsidianMock = vi.hoisted(() => {
  const notices: string[] = [];

  class Notice {
    constructor(message: string) {
      notices.push(message);
    }
  }

  class Plugin {
    readonly app: {
      commands: CommandManager & {
        add(command: Command): void;
        remove(commandId: string): void;
      };
      internalPlugins: {
        plugins: {
          'command-palette': {
            instance: {
              modal: { onChooseItem(command: Command): void };
            };
          };
        };
      };
    };
    readonly manifest: { id: string };
    private readonly cleanups: Array<() => void> = [];

    constructor(app: Plugin['app'], manifest: Plugin['manifest']) {
      this.app = app;
      this.manifest = manifest;
    }

    addCommand(commandToAdd: Command): Command {
      const command = {
        ...commandToAdd,
        id: `${this.manifest.id}:${commandToAdd.id}`,
      };
      this.app.commands.add(command);
      this.register(() => this.app.commands.remove(command.id));
      return command;
    }

    register(cleanup: () => void): void {
      this.cleanups.push(cleanup);
    }

    unload(): void {
      for (const cleanup of this.cleanups.reverse()) {
        cleanup();
      }
    }
  }

  return { Notice, Plugin, notices };
});

vi.mock('obsidian', () => ({
  Notice: obsidianMock.Notice,
  Plugin: obsidianMock.Plugin,
}));

import RepeatPreviousCommandPlugin from './main';

const PLUGIN_ID = 'repeat-previous-command';
const REPEAT_ID = `${PLUGIN_ID}:repeat-previous`;
const TRANSIENT_LAUNCHER_IDS = [
  'app:open-another-vault',
  'app:open-help',
  'app:open-sandbox-vault',
  'app:open-settings',
  'app:open-vault',
  'app:show-debug-info',
  'app:show-release-notes',
  'app:switch-vault',
  'command-palette:open',
  'switcher:open',
] as const;

class FakeCommandManager implements CommandManager {
  private readonly commands = new Map<string, Command>();
  private readonly results = new Map<string, boolean>();

  add(command: Command): void {
    this.commands.set(command.id, command);
  }

  remove(commandId: string): void {
    this.commands.delete(commandId);
  }

  setResult(commandId: string, result: boolean): void {
    this.results.set(commandId, result);
  }

  registeredCommands(): Command[] {
    return [...this.commands.values()];
  }

  executeCommand(command: Command): boolean {
    command.callback?.();
    return this.results.get(command.id) ?? true;
  }

  executeCommandById(commandId: string): boolean {
    const command = this.findCommand(commandId);
    return command ? this.executeCommand(command) : false;
  }

  findCommand(commandId: string): Command | undefined {
    return this.commands.get(commandId);
  }
}

class FakeCommandPalette {
  onChooseItem(command: Command): void {
    command.callback?.();
  }
}

type PluginInstance = RepeatPreviousCommandPlugin & { unload(): void };

function loadPluginWithApp(app: unknown): PluginInstance {
  const plugin = new RepeatPreviousCommandPlugin(
    app as never,
    { id: PLUGIN_ID } as never,
  ) as PluginInstance;
  plugin.onload();
  return plugin;
}

function loadPlugin(
  manager = new FakeCommandManager(),
  commandPalette = new FakeCommandPalette(),
): {
  manager: FakeCommandManager;
  commandPalette: FakeCommandPalette;
  plugin: PluginInstance;
} {
  const plugin = loadPluginWithApp({
    commands: manager,
    internalPlugins: {
      plugins: {
        'command-palette': { instance: { modal: commandPalette } },
      },
    },
  });
  return { manager, commandPalette, plugin };
}

function addCommand(
  manager: FakeCommandManager,
  id: string,
  callback: () => void,
): Command {
  const command: Command = { id, name: id, callback };
  manager.add(command);
  return command;
}

beforeEach(() => {
  obsidianMock.notices.length = 0;
});

describe('Repeat Previous Command', () => {
  it('registers exactly one command without a default hotkey', () => {
    const { manager } = loadPlugin();

    const commands = manager.registeredCommands();
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      id: REPEAT_ID,
      name: 'Repeat previous',
    });
    expect(commands[0]).not.toHaveProperty('hotkeys');
  });

  it('shows a notice when no previous command exists', () => {
    const { manager } = loadPlugin();

    manager.executeCommandById(REPEAT_ID);
    manager.executeCommandById(REPEAT_ID);

    expect(obsidianMock.notices).toEqual([
      'No previous command.',
      'No previous command.',
    ]);
  });

  it('repeats a command selected directly by the command palette', () => {
    const { commandPalette, manager } = loadPlugin();
    const target = addCommand(manager, 'example:palette-target', vi.fn());
    addCommand(manager, 'command-palette:open', vi.fn());

    manager.executeCommandById('command-palette:open');
    commandPalette.onChooseItem(target);
    manager.executeCommandById(REPEAT_ID);

    expect(target.callback).toHaveBeenCalledTimes(2);
  });

  it('repeats the selected command when Repeat previous is chosen from the palette', () => {
    const { commandPalette, manager } = loadPlugin();
    const target = addCommand(manager, 'example:palette-target', vi.fn());
    const openPalette = vi.fn();
    addCommand(manager, 'command-palette:open', openPalette);
    const repeat = manager.findCommand(REPEAT_ID);
    expect(repeat).toBeDefined();

    manager.executeCommandById('command-palette:open');
    commandPalette.onChooseItem(target);
    manager.executeCommandById('command-palette:open');
    commandPalette.onChooseItem(repeat!);

    expect(target.callback).toHaveBeenCalledTimes(2);
    expect(openPalette).toHaveBeenCalledTimes(2);
  });

  it.each(TRANSIENT_LAUNCHER_IDS)(
    'keeps the previous target after transient launcher %s',
    (launcherId) => {
      const { manager } = loadPlugin();
      const target = addCommand(manager, 'example:target', vi.fn());
      const launcher = addCommand(manager, launcherId, vi.fn());

      manager.executeCommandById(target.id);
      manager.executeCommandById(launcher.id);
      manager.executeCommandById(REPEAT_ID);

      expect(target.callback).toHaveBeenCalledTimes(2);
      expect(launcher.callback).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ['absent internal plugins', undefined],
    ['absent modal', { plugins: { 'command-palette': { instance: {} } } }],
    [
      'null modal',
      { plugins: { 'command-palette': { instance: { modal: null } } } },
    ],
    [
      'absent selection handler',
      { plugins: { 'command-palette': { instance: { modal: {} } } } },
    ],
    [
      'non-callable selection handler',
      {
        plugins: {
          'command-palette': {
            instance: { modal: { onChooseItem: 'not callable' } },
          },
        },
      },
    ],
  ])('skips an unavailable command palette with %s', (_name, internalPlugins) => {
    const manager = new FakeCommandManager();
    const before = structuredClone(internalPlugins);
    let plugin: PluginInstance | undefined;

    expect(() => {
      plugin = loadPluginWithApp({ commands: manager, internalPlugins });
    }).not.toThrow();
    expect(internalPlugins).toEqual(before);

    plugin?.unload();
  });

  it('repeats the last attempted command even when it returned false', () => {
    const { manager } = loadPlugin();
    const callback = vi.fn();
    addCommand(manager, 'example:format', callback);
    manager.setResult('example:format', false);

    expect(manager.executeCommandById('example:format')).toBe(false);
    manager.executeCommandById(REPEAT_ID);

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('records a throwing command and propagates its error', () => {
    const { manager } = loadPlugin();
    const target = addCommand(manager, 'example:throw', () => {
      throw new Error('target failed');
    });

    expect(() => manager.executeCommandById(target.id)).toThrow('target failed');
    target.callback = vi.fn();
    manager.executeCommandById(REPEAT_ID);

    expect(target.callback).toHaveBeenCalledOnce();
  });

  it('keeps the same target across replay and nested commands', () => {
    const { manager } = loadPlugin();
    const nested = vi.fn();
    const targetCallback = vi.fn();
    addCommand(manager, 'example:nested', nested);
    const target = addCommand(manager, 'example:target', targetCallback);

    manager.executeCommandById(target.id);
    target.callback = () => {
      targetCallback();
      manager.executeCommandById('example:nested');
    };
    manager.executeCommandById(REPEAT_ID);
    manager.executeCommandById(REPEAT_ID);

    expect(targetCallback).toHaveBeenCalledTimes(3);
    expect(nested).toHaveBeenCalledTimes(2);
  });

  it('keeps tracking suspended after a reentrant repeat returns', () => {
    const { manager } = loadPlugin();
    const events: string[] = [];
    addCommand(manager, 'example:nested', () => events.push('nested'));
    const target = addCommand(manager, 'example:target', vi.fn());

    manager.executeCommandById(target.id);
    let replayInvocations = 0;
    target.callback = () => {
      events.push('target');
      replayInvocations += 1;
      if (replayInvocations === 1) {
        manager.executeCommandById(REPEAT_ID);
        manager.executeCommandById('example:nested');
      }
    };

    manager.executeCommandById(REPEAT_ID);
    manager.executeCommandById(REPEAT_ID);

    expect(events).toEqual(['target', 'target', 'nested', 'target']);
  });

  it('reports an unavailable target and retains its ID', () => {
    const { manager } = loadPlugin();
    const callback = vi.fn();
    addCommand(manager, 'example:temporary', callback);
    manager.executeCommandById('example:temporary');
    manager.remove('example:temporary');

    manager.executeCommandById(REPEAT_ID);
    expect(obsidianMock.notices).toEqual([
      'Previous command is unavailable.',
    ]);

    addCommand(manager, 'example:temporary', callback);
    manager.executeCommandById(REPEAT_ID);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('clears the replay guard after the repeated command throws', () => {
    const { manager } = loadPlugin();
    const target = addCommand(manager, 'example:target', vi.fn());
    manager.executeCommandById(target.id);
    target.callback = () => {
      throw new Error('replay failed');
    };

    expect(() => manager.executeCommandById(REPEAT_ID)).toThrow('replay failed');

    const next = vi.fn();
    addCommand(manager, 'example:next', next);
    manager.executeCommandById('example:next');
    manager.executeCommandById(REPEAT_ID);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('restores a reused command palette across unload and reload', () => {
    const manager = new FakeCommandManager();
    const commandPalette = new FakeCommandPalette();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Method identity is the behavior under test.
    const original = commandPalette.onChooseItem;
    const target = addCommand(manager, 'example:palette-target', vi.fn());
    const first = loadPlugin(manager, commandPalette);

    expect(
      Object.prototype.hasOwnProperty.call(commandPalette, 'onChooseItem'),
    ).toBe(true);
    first.plugin.unload();
    expect(
      Object.prototype.hasOwnProperty.call(commandPalette, 'onChooseItem'),
    ).toBe(false);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Method identity is the behavior under test.
    expect(commandPalette.onChooseItem).toBe(original);

    commandPalette.onChooseItem(target);
    const second = loadPlugin(manager, commandPalette);
    manager.executeCommandById(REPEAT_ID);
    expect(obsidianMock.notices).toEqual(['No previous command.']);

    commandPalette.onChooseItem(target);
    manager.executeCommandById(REPEAT_ID);
    expect(target.callback).toHaveBeenCalledTimes(3);

    second.plugin.unload();
    expect(
      Object.prototype.hasOwnProperty.call(commandPalette, 'onChooseItem'),
    ).toBe(false);
  });

  it('detaches the palette observer after a later wrapper is removed', () => {
    const { commandPalette, manager, plugin } = loadPlugin();
    const target = addCommand(manager, 'example:palette-target', vi.fn());
    let laterCalls = 0;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- The test wrapper forwards the original receiver with apply.
    const observed = commandPalette.onChooseItem;
    const later: FakeCommandPalette['onChooseItem'] = function(
      this: FakeCommandPalette,
      ...args
    ) {
      laterCalls += 1;
      return observed.apply(this, args);
    };
    commandPalette.onChooseItem = later;

    plugin.unload();
    commandPalette.onChooseItem(target);
    expect(laterCalls).toBe(1);
    expect(target.callback).toHaveBeenCalledOnce();

    if (commandPalette.onChooseItem === later) {
      commandPalette.onChooseItem = observed;
    }
    commandPalette.onChooseItem(target);

    expect(target.callback).toHaveBeenCalledTimes(2);
    expect(
      Object.prototype.hasOwnProperty.call(commandPalette, 'onChooseItem'),
    ).toBe(false);
  });

  it('starts with empty history after unload and reload', () => {
    const manager = new FakeCommandManager();
    const first = loadPlugin(manager);
    addCommand(manager, 'example:format', vi.fn());
    manager.executeCommandById('example:format');
    first.plugin.unload();

    loadPlugin(manager);
    manager.executeCommandById(REPEAT_ID);

    expect(obsidianMock.notices).toEqual(['No previous command.']);
  });
});
