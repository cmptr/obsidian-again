import { Notice, Plugin, type App, type Command } from 'obsidian';
import {
  observeCommandExecutions,
  type CommandManager,
} from './command-execution-patch';

const REPEAT_COMMAND_ID = 'repeat-previous-command:repeat-previous';

function getCommandManager(app: App): CommandManager {
  return (app as App & { commands: CommandManager }).commands;
}

export default class RepeatPreviousCommandPlugin extends Plugin {
  private previousCommandId: string | undefined;
  private replaying = false;

  onload(): void {
    const commandManager = getCommandManager(this.app);

    this.register(
      observeCommandExecutions(commandManager, (command) => {
        this.rememberCommand(command);
      }),
    );

    this.addCommand({
      id: 'repeat-previous',
      name: 'Repeat previous',
      callback: () => this.repeatPrevious(commandManager),
    });
  }

  private rememberCommand(command: Command): void {
    if (!this.replaying && command.id !== REPEAT_COMMAND_ID) {
      this.previousCommandId = command.id;
    }
  }

  private repeatPrevious(commandManager: CommandManager): boolean | undefined {
    const commandId = this.previousCommandId;
    if (commandId === undefined) {
      new Notice('No previous command.');
      return undefined;
    }
    if (commandManager.findCommand(commandId) === undefined) {
      new Notice('Previous command is unavailable.');
      return undefined;
    }

    this.replaying = true;
    try {
      return commandManager.executeCommandById(commandId);
    } finally {
      this.replaying = false;
    }
  }
}
