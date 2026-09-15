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

function loadPlugin(manager = new FakeCommandManager()): {
  manager: FakeCommandManager;
  plugin: RepeatPreviousCommandPlugin & { unload(): void };
} {
  const plugin = new RepeatPreviousCommandPlugin(
    { commands: manager } as never,
    { id: PLUGIN_ID } as never,
  ) as RepeatPreviousCommandPlugin & { unload(): void };
  plugin.onload();
  return { manager, plugin };
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
  it('shows a notice when no previous command exists', () => {
    const { manager } = loadPlugin();

    manager.executeCommandById(REPEAT_ID);
    manager.executeCommandById(REPEAT_ID);

    expect(obsidianMock.notices).toEqual([
      'No previous command.',
      'No previous command.',
    ]);
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
