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

export interface CommandPalette {
  onChooseItem(
    this: CommandPalette,
    command: Command,
    ...args: unknown[]
  ): void;
}

type ExecuteCommand = CommandManager['executeCommand'];
type ChooseCommand = CommandPalette['onChooseItem'];

export function observeCommandExecutions(
  manager: CommandManager,
  observer: (command: Command) => void,
): () => void {
  return observeMethodCall<CommandManager, Parameters<ExecuteCommand>, boolean>(
    manager,
    'executeCommand',
    ([command]) => observer(command),
  );
}

export function observeCommandPaletteSelections(
  commandPalette: CommandPalette,
  observer: (command: Command) => void,
): () => void {
  return observeMethodCall<CommandPalette, Parameters<ChooseCommand>, void>(
    commandPalette,
    'onChooseItem',
    ([command]) => observer(command),
  );
}

function observeMethodCall<
  Target extends object,
  Args extends unknown[],
  Result,
>(
  target: Target,
  methodName: keyof Target,
  observer: (args: Args) => void,
): () => void {
  type Method = (this: Target, ...args: Args) => Result;
  const methodTarget = target as Record<PropertyKey, Method>;
  const hadOwnMethod = Object.prototype.hasOwnProperty.call(target, methodName);
  const inheritedMethod = methodTarget[methodName];
  const next: Method = hadOwnMethod
    ? inheritedMethod
    : function (...args) {
        const prototype = Object.getPrototypeOf(target) as Record<
          PropertyKey,
          Method
        >;
        return prototype[methodName].apply(this, args);
      };
  let active = true;

  const wrapper: Method = function (...args) {
    if (!active && methodTarget[methodName] === wrapper) {
      restore();
      return methodTarget[methodName].apply(this, args);
    }

    if (active) {
      observer(args);
    }
    return next.apply(this, args);
  };

  methodTarget[methodName] = wrapper;

  return () => {
    if (!active) {
      return;
    }
    active = false;
    restore();
  };

  function restore(): void {
    if (methodTarget[methodName] !== wrapper) {
      return;
    }
    if (hadOwnMethod) {
      methodTarget[methodName] = inheritedMethod;
    } else {
      Reflect.deleteProperty(target, methodName);
    }
  }
}
