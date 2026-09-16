import { type App, type Command, Notice, Plugin } from 'obsidian';
import {
  type CommandManager,
  type CommandPalette,
  observeCommandExecutions,
  observeCommandPaletteSelections,
} from './command-execution-patch';

const REPEAT_ACTION_COMMAND_ID = 'repeat-previous-action:repeat-previous';
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
  REPEAT_ACTION_COMMAND_ID,
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

export default class RepeatPreviousActionPlugin extends Plugin {
  private previousActionId: string | undefined;
  private replaying = false;

  onload(): void {
    const commandManager = getCommandManager(this.app);

    this.register(
      observeCommandExecutions(commandManager, (command) => {
        this.rememberAction(command);
      }),
    );

    const commandPalette = getCommandPalette(this.app);
    if (commandPalette !== undefined) {
      this.register(
        observeCommandPaletteSelections(commandPalette, (command) => {
          this.rememberAction(command);
        }),
      );
    }

    this.addCommand({
      id: 'repeat-previous',
      name: 'Repeat previous',
      callback: () => this.repeatPreviousAction(commandManager),
    });
  }

  private rememberAction(command: Command): void {
    if (!this.replaying && !NON_REPEATABLE_COMMAND_IDS.has(command.id)) {
      this.previousActionId = command.id;
    }
  }

  private repeatPreviousAction(commandManager: CommandManager): boolean | undefined {
    const actionId = this.previousActionId;
    if (actionId === undefined) {
      new Notice('No previous action.');
      return undefined;
    }
    if (commandManager.findCommand(actionId) === undefined) {
      new Notice('Previous action is unavailable.');
      return undefined;
    }

    const wasReplaying = this.replaying;
    this.replaying = true;
    try {
      return commandManager.executeCommandById(actionId);
    } finally {
      this.replaying = wasReplaying;
    }
  }
}
