import { type App, type Command, Notice, Plugin } from 'obsidian';
import {
  type CommandManager,
  type CommandPalette,
  observeCommandExecutions,
  observeCommandPaletteSelections,
} from './command-execution-patch';

const REPEAT_COMMAND_ID = 'repeat-previous-command:repeat-previous';
const NON_REPEATABLE_COMMAND_IDS = new Set([
  'app:open-another-vault',
  'app:open-help',
  'app:open-sandbox-vault',
  'app:open-settings',
  'app:open-vault',
  'app:show-debug-info',
  'app:show-release-notes',
  'app:switch-vault',
  'command-palette:open',
  REPEAT_COMMAND_ID,
  'switcher:open',
]);

function getCommandManager(app: App): CommandManager {
  return (app as App & { commands: CommandManager }).commands;
}

function getCommandPalette(app: App): CommandPalette | undefined {
  const appWithInternalPlugins = app as App & {
    internalPlugins?: {
      plugins?: Record<string, { instance?: { modal?: unknown } }>;
    };
  };
  const commandPalette = appWithInternalPlugins.internalPlugins?.plugins?.['command-palette']
    ?.instance?.modal;
  if (
    typeof commandPalette !== 'object'
    || commandPalette === null
    || !('onChooseItem' in commandPalette)
    || typeof commandPalette.onChooseItem !== 'function'
  ) {
    return undefined;
  }
  return commandPalette as CommandPalette;
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

    const commandPalette = getCommandPalette(this.app);
    if (commandPalette !== undefined) {
      this.register(
        observeCommandPaletteSelections(commandPalette, (command) => {
          this.rememberCommand(command);
        }),
      );
    }

    this.addCommand({
      id: 'repeat-previous',
      name: 'Repeat previous',
      callback: () => this.repeatPrevious(commandManager),
    });
  }

  private rememberCommand(command: Command): void {
    if (!this.replaying && !NON_REPEATABLE_COMMAND_IDS.has(command.id)) {
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

    const wasReplaying = this.replaying;
    this.replaying = true;
    try {
      return commandManager.executeCommandById(commandId);
    } finally {
      this.replaying = wasReplaying;
    }
  }
}
