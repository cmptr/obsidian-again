import type { Command } from 'obsidian';

export interface CommandManager {
  executeCommand(
    this: CommandManager,
    command: Command,
    ...args: unknown[]
  ): boolean;
  executeCommandById(commandId: string): boolean;
  findCommand(commandId: string): Command | undefined;
}

type ExecuteCommand = CommandManager['executeCommand'];

export function observeCommandExecutions(
  manager: CommandManager,
  observer: (command: Command) => void,
): () => void {
  const hadOwnMethod = Object.prototype.hasOwnProperty.call(
    manager,
    'executeCommand',
  );
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Every invocation below preserves the receiver with apply.
  const inheritedMethod = manager.executeCommand;
  const next: ExecuteCommand = hadOwnMethod
    ? inheritedMethod
    : function (...args) {
        const prototype = Object.getPrototypeOf(manager) as Pick<
          CommandManager,
          'executeCommand'
        >;
        return prototype.executeCommand.apply(this, args);
      };
  let active = true;

  const wrapper: ExecuteCommand = function (...args) {
    if (!active && manager.executeCommand === wrapper) {
      restore();
      return manager.executeCommand.apply(this, args);
    }

    if (active) {
      observer(args[0]);
    }
    return next.apply(this, args);
  };

  manager.executeCommand = wrapper;

  return () => {
    if (!active) {
      return;
    }
    active = false;
    restore();
  };

  function restore(): void {
    if (manager.executeCommand !== wrapper) {
      return;
    }
    if (hadOwnMethod) {
      manager.executeCommand = inheritedMethod;
    } else {
      Reflect.deleteProperty(manager, 'executeCommand');
    }
  }
}
