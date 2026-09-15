import type { Command } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import {
  observeCommandExecutions,
  type CommandManager,
} from './command-execution-patch';

const command = (id: string): Command => ({ id, name: id });

function createManager(): CommandManager {
  return {
    executeCommand(commandToRun: Command, ...args: unknown[]): boolean {
      if (commandToRun.id === 'throw') {
        throw new Error('command failed');
      }
      return args[0] !== 'fail';
    },
    executeCommandById: vi.fn(() => true),
    findCommand: vi.fn(() => undefined),
  };
}

function wrap(
  manager: CommandManager,
  label: string,
  calls: string[],
): () => void {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- The helper forwards the original receiver with apply.
  const next = manager.executeCommand;
  const wrapper: CommandManager['executeCommand'] = function (...args) {
    calls.push(label);
    return next.apply(this, args);
  };
  manager.executeCommand = wrapper;

  return () => {
    if (manager.executeCommand === wrapper) {
      manager.executeCommand = next;
    }
  };
}

describe('observeCommandExecutions', () => {
  it('observes before forwarding and preserves receiver, arguments, and result', () => {
    const events: string[] = [];
    const manager = createManager();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- The test verifies receiver forwarding with apply.
    const original = manager.executeCommand;
    manager.executeCommand = function (
      this: CommandManager,
      commandToRun: Command,
      ...args: unknown[]
    ): boolean {
      expect(this).toBe(manager);
      events.push(`execute:${commandToRun.id}:${String(args[0])}`);
      return original.apply(this, [commandToRun, ...args]);
    };

    observeCommandExecutions(manager, (executed) => {
      events.push(`observe:${executed.id}`);
    });

    expect(manager.executeCommand(command('format'), 'context')).toBe(true);
    expect(events).toEqual(['observe:format', 'execute:format:context']);
  });

  it('observes failed and throwing attempts without changing their behavior', () => {
    const manager = createManager();
    const observed: string[] = [];
    observeCommandExecutions(manager, ({ id }) => observed.push(id));

    expect(manager.executeCommand(command('format'), 'fail')).toBe(false);
    expect(() => manager.executeCommand(command('throw'))).toThrow(
      'command failed',
    );
    expect(observed).toEqual(['format', 'throw']);
  });

  it('restores immediately when it is the outermost wrapper', () => {
    const manager = createManager();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Method identity is the behavior under test.
    const original = manager.executeCommand;
    const remove = observeCommandExecutions(manager, vi.fn());

    remove();

    // eslint-disable-next-line @typescript-eslint/unbound-method -- Method identity is the behavior under test.
    expect(manager.executeCommand).toBe(original);
  });

  it('becomes an inactive pass-through when a later wrapper remains', () => {
    const calls: string[] = [];
    const manager = createManager();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Method identity is the behavior under test.
    const original = manager.executeCommand;
    const observer = vi.fn();
    const removeObserved = observeCommandExecutions(manager, observer);
    const removeLater = wrap(manager, 'later', calls);

    removeObserved();
    manager.executeCommand(command('format'));

    expect(calls).toEqual(['later']);
    expect(observer).not.toHaveBeenCalled();

    removeLater();
    manager.executeCommand(command('format'));
    expect(observer).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Method identity is the behavior under test.
    expect(manager.executeCommand).toBe(original);
  });

  it('coexists with wrappers installed before and after it', () => {
    const calls: string[] = [];
    const manager = createManager();
    const removeEarlier = wrap(manager, 'earlier', calls);
    const removeObserved = observeCommandExecutions(manager, ({ id }) => {
      calls.push(`observed:${id}`);
    });
    const removeLater = wrap(manager, 'later', calls);

    manager.executeCommand(command('format'));
    expect(calls).toEqual(['later', 'observed:format', 'earlier']);

    removeLater();
    removeObserved();
    calls.length = 0;
    manager.executeCommand(command('format'));
    expect(calls).toEqual(['earlier']);
    removeEarlier();
  });

  it('removes an inherited method without leaving an own property', () => {
    const prototype = createManager();
    const manager = Object.create(prototype) as CommandManager;
    const remove = observeCommandExecutions(manager, vi.fn());

    expect(
      Object.prototype.hasOwnProperty.call(manager, 'executeCommand'),
    ).toBe(true);
    remove();

    expect(
      Object.prototype.hasOwnProperty.call(manager, 'executeCommand'),
    ).toBe(false);
    expect(manager.executeCommand(command('format'))).toBe(true);
  });
});
