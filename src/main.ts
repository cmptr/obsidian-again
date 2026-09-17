import {
  type App,
  type Command,
  Notice,
  Platform,
  Plugin,
  PluginSettingTab,
  setIcon,
  Setting,
  type SettingDefinitionItem,
  setTooltip,
} from 'obsidian';
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
const STATUS_BAR_MODES = ['hidden', 'icon', 'icon-and-command'] as const;
type StatusBarMode = (typeof STATUS_BAR_MODES)[number];

interface AgainSettings {
  statusBarMode: StatusBarMode;
}

interface PreviousCommand {
  id: string;
  name: string;
}

const DEFAULT_SETTINGS: AgainSettings = {
  statusBarMode: 'icon-and-command',
};
const STATUS_BAR_DESCRIPTION = 'Choose how the previous command appears in the desktop status bar.';
const STATUS_BAR_OPTIONS: Record<StatusBarMode, string> = {
  hidden: 'Hidden',
  icon: 'Icon only',
  'icon-and-command': 'Icon and command name',
};

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

function isStatusBarMode(value: unknown): value is StatusBarMode {
  return STATUS_BAR_MODES.some((mode) => mode === value);
}

class AgainSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly getStatusBarMode: () => StatusBarMode,
    private readonly updateStatusBarMode: (mode: StatusBarMode) => Promise<void>,
  ) {
    super(app, plugin);
  }

  display(): void {
    this.containerEl.empty();

    new Setting(this.containerEl)
      .setName('Status bar')
      .setDesc(STATUS_BAR_DESCRIPTION)
      .addDropdown((dropdown) => {
        for (const mode of STATUS_BAR_MODES) {
          dropdown.addOption(mode, STATUS_BAR_OPTIONS[mode]);
        }
        dropdown
          .setValue(this.getStatusBarMode())
          .onChange(async (value) => {
            if (isStatusBarMode(value)) {
              await this.updateStatusBarMode(value);
            }
          });
      });
  }

  getControlValue(key: string): unknown {
    return key === 'statusBarMode' ? this.getStatusBarMode() : undefined;
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: 'Status bar',
        desc: STATUS_BAR_DESCRIPTION,
        control: {
          type: 'dropdown',
          key: 'statusBarMode',
          options: STATUS_BAR_OPTIONS,
        },
      },
    ];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === 'statusBarMode' && isStatusBarMode(value)) {
      await this.updateStatusBarMode(value);
    }
  }
}

export default class RepeatPreviousActionPlugin extends Plugin {
  private previousCommand: PreviousCommand | undefined;
  private replaying = false;
  private pluginSettings: AgainSettings = DEFAULT_SETTINGS;
  private statusBarItem: HTMLElement | undefined;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(
      new AgainSettingTab(
        this.app,
        this,
        () => this.pluginSettings.statusBarMode,
        async (mode) => this.updateStatusBarMode(mode),
      ),
    );

    if (!Platform.isMobile) {
      this.statusBarItem = this.addStatusBarItem();
      this.statusBarItem.addClass('again-status-bar-item');
      this.renderStatusBar();
    }

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

  private async loadSettings(): Promise<void> {
    const data: unknown = await this.loadData();
    if (
      typeof data === 'object'
      && data !== null
      && 'statusBarMode' in data
      && isStatusBarMode(data.statusBarMode)
    ) {
      this.pluginSettings = { statusBarMode: data.statusBarMode };
      return;
    }

    this.pluginSettings = { statusBarMode: DEFAULT_SETTINGS.statusBarMode };
  }

  private rememberAction(command: Command): void {
    if (!this.replaying && !NON_REPEATABLE_COMMAND_IDS.has(command.id)) {
      this.previousCommand = { id: command.id, name: command.name };
      this.renderStatusBar();
    }
  }

  private renderStatusBar(): void {
    const statusBarItem = this.statusBarItem;
    if (statusBarItem === undefined) {
      return;
    }

    statusBarItem.empty();
    statusBarItem.hidden = true;
    setTooltip(statusBarItem, '');
    statusBarItem.removeAttribute('aria-label');

    const previousCommand = this.previousCommand;
    if (
      previousCommand === undefined
      || this.pluginSettings.statusBarMode === 'hidden'
    ) {
      return;
    }

    statusBarItem.hidden = false;
    setIcon(statusBarItem, 'rotate-ccw');
    if (this.pluginSettings.statusBarMode === 'icon-and-command') {
      statusBarItem.createSpan({
        cls: 'again-status-bar-command',
        text: previousCommand.name,
      });
    }

    const tooltip = `Previous command: ${previousCommand.name}`;
    setTooltip(statusBarItem, tooltip);
    statusBarItem.setAttribute('aria-label', tooltip);
  }

  private repeatPreviousAction(commandManager: CommandManager): boolean | undefined {
    const actionId = this.previousCommand?.id;
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

  private async updateStatusBarMode(mode: StatusBarMode): Promise<void> {
    this.pluginSettings = { statusBarMode: mode };
    this.renderStatusBar();
    await this.saveData({ statusBarMode: mode });
  }
}
