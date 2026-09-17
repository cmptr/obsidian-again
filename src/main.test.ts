import type { Command } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandManager } from './command-execution-patch';

const obsidianMock = vi.hoisted(() => {
  const notices: string[] = [];
  const savedData: unknown[] = [];
  const settingTabs: PluginSettingTab[] = [];
  const settings: Setting[] = [];
  const statusItems: FakeElement[] = [];
  let data: unknown;

  class FakeElement {
    readonly attributes = new Map<string, string>();
    readonly children: FakeElement[] = [];
    readonly classes = new Set<string>();
    readonly listeners: string[] = [];
    hidden = false;
    icon: string | undefined;
    text = '';
    tooltip = '';

    addClass(className: string): void {
      this.classes.add(className);
    }

    addEventListener(type: string): void {
      this.listeners.push(type);
    }

    createSpan(options: { cls?: string; text?: string } = {}): FakeElement {
      const span = new FakeElement();
      if (options.cls !== undefined) {
        span.addClass(options.cls);
      }
      span.text = options.text ?? '';
      this.children.push(span);
      this.text += span.text;
      return span;
    }

    empty(): void {
      this.children.length = 0;
      this.icon = undefined;
      this.text = '';
    }

    getAttribute(name: string): string | null {
      return this.attributes.get(name) ?? null;
    }

    removeAttribute(name: string): void {
      this.attributes.delete(name);
    }

    setAttribute(name: string, value: string): void {
      this.attributes.set(name, value);
    }
  }

  class Dropdown {
    readonly options = new Map<string, string>();
    value = '';
    private changeCallback: ((value: string) => unknown) | undefined;

    addOption(value: string, label: string): this {
      this.options.set(value, label);
      return this;
    }

    onChange(callback: (value: string) => unknown): this {
      this.changeCallback = callback;
      return this;
    }

    setValue(value: string): this {
      this.value = value;
      return this;
    }

    async choose(value: string): Promise<void> {
      await this.changeCallback?.(value);
      this.value = value;
    }
  }

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

    addSettingTab(settingTab: PluginSettingTab): void {
      settingTabs.push(settingTab);
    }

    addStatusBarItem(): FakeElement {
      const statusItem = new FakeElement();
      statusItems.push(statusItem);
      return statusItem;
    }

    async loadData(): Promise<unknown> {
      return data;
    }

    register(cleanup: () => void): void {
      this.cleanups.push(cleanup);
    }

    async saveData(value: unknown): Promise<void> {
      data = structuredClone(value);
      savedData.push(structuredClone(value));
    }

    unload(): void {
      for (const cleanup of this.cleanups.reverse()) {
        cleanup();
      }
    }
  }

  class PluginSettingTab {
    readonly containerEl = new FakeElement();

    constructor(
      readonly app: unknown,
      readonly plugin: Plugin,
    ) {}

    display(): void {}

    getControlValue(_key: string): unknown {
      return undefined;
    }

    getSettingDefinitions(): unknown[] {
      return [];
    }

    async setControlValue(_key: string, _value: unknown): Promise<void> {}
  }

  class Setting {
    description = '';
    dropdown: Dropdown | undefined;
    name = '';

    constructor(readonly containerEl: FakeElement) {
      settings.push(this);
    }

    addDropdown(callback: (dropdown: Dropdown) => unknown): this {
      const dropdown = new Dropdown();
      this.dropdown = dropdown;
      callback(dropdown);
      return this;
    }

    setDesc(description: string): this {
      this.description = description;
      return this;
    }

    setName(name: string): this {
      this.name = name;
      return this;
    }
  }

  const Platform = { isMobile: false };

  function setIcon(element: FakeElement, icon: string): void {
    element.icon = icon;
  }

  function setTooltip(element: FakeElement, tooltip: string): void {
    element.tooltip = tooltip;
  }

  return {
    FakeElement,
    Notice,
    Platform,
    Plugin,
    PluginSettingTab,
    Setting,
    get data(): unknown {
      return data;
    },
    set data(value: unknown) {
      data = value;
    },
    notices,
    savedData,
    setIcon,
    setTooltip,
    settingTabs,
    settings,
    statusItems,
  };
});

vi.mock('obsidian', () => ({
  Notice: obsidianMock.Notice,
  Platform: obsidianMock.Platform,
  Plugin: obsidianMock.Plugin,
  PluginSettingTab: obsidianMock.PluginSettingTab,
  Setting: obsidianMock.Setting,
  setIcon: obsidianMock.setIcon,
  setTooltip: obsidianMock.setTooltip,
}));

import RepeatPreviousActionPlugin from './main';

const PLUGIN_ID = 'repeat-previous-action';
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

type PluginInstance = RepeatPreviousActionPlugin & { unload(): void };

interface LoadOptions {
  data?: unknown;
  mobile?: boolean;
}

async function loadPluginWithApp(
  app: unknown,
  options: LoadOptions = {},
): Promise<PluginInstance> {
  obsidianMock.data = options.data;
  obsidianMock.Platform.isMobile = options.mobile ?? false;
  const plugin = new RepeatPreviousActionPlugin(
    app as never,
    { id: PLUGIN_ID } as never,
  ) as PluginInstance;
  await plugin.onload();
  return plugin;
}

async function loadPlugin(
  manager = new FakeCommandManager(),
  commandPalette = new FakeCommandPalette(),
  options: LoadOptions = {},
): Promise<{
  manager: FakeCommandManager;
  commandPalette: FakeCommandPalette;
  plugin: PluginInstance;
  statusItem: InstanceType<typeof obsidianMock.FakeElement> | undefined;
}> {
  const previousStatusItemCount = obsidianMock.statusItems.length;
  const plugin = await loadPluginWithApp(
    {
      commands: manager,
      internalPlugins: {
        plugins: {
          'command-palette': { instance: { modal: commandPalette } },
        },
      },
    },
    options,
  );
  return {
    manager,
    commandPalette,
    plugin,
    statusItem: obsidianMock.statusItems[previousStatusItemCount],
  };
}

async function loadDesktopPlugin(
  manager = new FakeCommandManager(),
  commandPalette = new FakeCommandPalette(),
  options: LoadOptions = {},
): Promise<{
  manager: FakeCommandManager;
  commandPalette: FakeCommandPalette;
  plugin: PluginInstance;
  statusItem: InstanceType<typeof obsidianMock.FakeElement>;
}> {
  const result = await loadPlugin(manager, commandPalette, options);
  if (result.statusItem === undefined) {
    throw new Error('Expected a desktop status item');
  }
  return { ...result, statusItem: result.statusItem };
}

function addCommand(
  manager: FakeCommandManager,
  id: string,
  callback: () => void,
  name = id,
): Command {
  const command: Command = { id, name, callback };
  manager.add(command);
  return command;
}

function getOnlySettingTab(): InstanceType<typeof obsidianMock.PluginSettingTab> {
  const settingTab = obsidianMock.settingTabs[0];
  if (settingTab === undefined) {
    throw new Error('Expected a settings tab');
  }
  return settingTab;
}

function getOnlyDropdown(): NonNullable<
  InstanceType<typeof obsidianMock.Setting>['dropdown']
> {
  getOnlySettingTab().display();

  const setting = obsidianMock.settings[0];
  if (setting?.dropdown === undefined) {
    throw new Error('Expected a dropdown setting');
  }
  return setting.dropdown;
}

beforeEach(() => {
  obsidianMock.data = undefined;
  obsidianMock.Platform.isMobile = false;
  obsidianMock.notices.length = 0;
  obsidianMock.savedData.length = 0;
  obsidianMock.settingTabs.length = 0;
  obsidianMock.settings.length = 0;
  obsidianMock.statusItems.length = 0;
});

describe('Repeat Previous Action', () => {
  it('registers exactly one command without a default hotkey', async () => {
    const { manager } = await loadPlugin();

    const commands = manager.registeredCommands();
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      id: REPEAT_ID,
      name: 'Repeat previous',
    });
    expect(commands[0]).not.toHaveProperty('hotkeys');
  });

  it('starts with the desktop status item hidden', async () => {
    const { statusItem } = await loadDesktopPlugin();

    expect(statusItem.classes).toContain('again-status-bar-item');
    expect(statusItem.hidden).toBe(true);
    expect(statusItem.icon).toBeUndefined();
    expect(statusItem.text).toBe('');
  });

  it('shows the previous command with rotate-ccw in the default status mode', async () => {
    const { manager, statusItem } = await loadDesktopPlugin();
    const target = addCommand(
      manager,
      'example:format',
      vi.fn(),
      'Format document',
    );

    manager.executeCommandById(target.id);

    expect(statusItem.icon).toBe('rotate-ccw');
    expect(statusItem.text).toBe('Format document');
    expect(statusItem.tooltip).toBe('Previous command: Format document');
    expect(statusItem.getAttribute('aria-label')).toBe(
      'Previous command: Format document',
    );
    expect(statusItem.hidden).toBe(false);
    expect(statusItem.getAttribute('tabindex')).toBeNull();
    expect(statusItem.listeners).toEqual([]);
    expect(statusItem.children[0]?.classes).toContain(
      'again-status-bar-command',
    );
  });

  it('shows only the icon in icon-only status mode', async () => {
    const { manager, statusItem } = await loadDesktopPlugin(
      undefined,
      undefined,
      { data: { statusBarMode: 'icon' } },
    );
    const target = addCommand(
      manager,
      'example:format',
      vi.fn(),
      'Format document',
    );

    manager.executeCommandById(target.id);

    expect(statusItem.icon).toBe('rotate-ccw');
    expect(statusItem.text).toBe('');
    expect(statusItem.tooltip).toBe('Previous command: Format document');
    expect(statusItem.hidden).toBe(false);
  });

  it('keeps the status item hidden in hidden mode', async () => {
    const { manager, statusItem } = await loadDesktopPlugin(
      undefined,
      undefined,
      { data: { statusBarMode: 'hidden' } },
    );
    const target = addCommand(
      manager,
      'example:format',
      vi.fn(),
      'Format document',
    );

    manager.executeCommandById(target.id);

    expect(statusItem.hidden).toBe(true);
    expect(statusItem.icon).toBeUndefined();
    expect(statusItem.text).toBe('');
  });

  it('falls back to icon and command for invalid persisted data', async () => {
    const { manager, statusItem } = await loadDesktopPlugin(
      undefined,
      undefined,
      { data: { statusBarMode: 'compact', previousCommand: 'do-not-load' } },
    );
    const target = addCommand(
      manager,
      'example:format',
      vi.fn(),
      'Format document',
    );

    manager.executeCommandById(target.id);

    expect(statusItem.icon).toBe('rotate-ccw');
    expect(statusItem.text).toBe('Format document');
    expect(statusItem.hidden).toBe(false);
    expect(obsidianMock.savedData).toEqual([]);
  });

  it('saves a dropdown change and refreshes the status immediately', async () => {
    const { manager, statusItem } = await loadDesktopPlugin();
    const target = addCommand(
      manager,
      'example:format',
      vi.fn(),
      'Format document',
    );
    manager.executeCommandById(target.id);

    const dropdown = getOnlyDropdown();
    const setting = obsidianMock.settings[0];
    expect(setting).toMatchObject({
      name: 'Status bar',
      description: 'Choose how the previous command appears in the desktop status bar.',
    });
    expect([...dropdown.options]).toEqual([
      ['hidden', 'Hidden'],
      ['icon', 'Icon only'],
      ['icon-and-command', 'Icon and command name'],
    ]);
    expect(dropdown.value).toBe('icon-and-command');

    await dropdown.choose('icon');

    expect(obsidianMock.savedData).toEqual([{ statusBarMode: 'icon' }]);
    expect(statusItem.icon).toBe('rotate-ccw');
    expect(statusItem.text).toBe('');
    expect(statusItem.tooltip).toBe('Previous command: Format document');
    expect(statusItem.hidden).toBe(false);
  });

  it('exposes the same status setting through setting definitions', async () => {
    const { manager, statusItem } = await loadDesktopPlugin();
    const target = addCommand(
      manager,
      'example:format',
      vi.fn(),
      'Format document',
    );
    manager.executeCommandById(target.id);

    const settingTab = getOnlySettingTab();
    expect(settingTab.getControlValue('statusBarMode')).toBe(
      'icon-and-command',
    );
    expect(settingTab.getControlValue('unknown')).toBeUndefined();
    expect(settingTab.getSettingDefinitions()).toEqual([
      {
        name: 'Status bar',
        desc: 'Choose how the previous command appears in the desktop status bar.',
        control: {
          type: 'dropdown',
          key: 'statusBarMode',
          options: {
            hidden: 'Hidden',
            icon: 'Icon only',
            'icon-and-command': 'Icon and command name',
          },
        },
      },
    ]);

    await settingTab.setControlValue('statusBarMode', 'hidden');

    expect(obsidianMock.savedData).toEqual([{ statusBarMode: 'hidden' }]);
    expect(statusItem.hidden).toBe(true);

    await settingTab.setControlValue('unknown', 'icon');
    await settingTab.setControlValue('statusBarMode', 'compact');
    expect(obsidianMock.savedData).toEqual([{ statusBarMode: 'hidden' }]);
  });

  it('ignores a dropdown value outside the available modes', async () => {
    const { manager, statusItem } = await loadDesktopPlugin();
    const target = addCommand(
      manager,
      'example:format',
      vi.fn(),
      'Format document',
    );
    manager.executeCommandById(target.id);

    await getOnlyDropdown().choose('compact');

    expect(obsidianMock.savedData).toEqual([]);
    expect(statusItem.text).toBe('Format document');
    expect(statusItem.hidden).toBe(false);
  });

  it('does not register a status item on mobile', async () => {
    const { manager, statusItem } = await loadPlugin(
      undefined,
      undefined,
      { mobile: true },
    );
    const target = addCommand(manager, 'example:format', vi.fn());

    manager.executeCommandById(target.id);
    manager.executeCommandById(REPEAT_ID);

    expect(statusItem).toBeUndefined();
    expect(obsidianMock.statusItems).toEqual([]);
    expect(target.callback).toHaveBeenCalledTimes(2);
  });

  it('shows a notice when no previous action exists', async () => {
    const { manager } = await loadPlugin();

    manager.executeCommandById(REPEAT_ID);
    manager.executeCommandById(REPEAT_ID);

    expect(obsidianMock.notices).toEqual([
      'No previous action.',
      'No previous action.',
    ]);
  });

  it('repeats a command selected directly by the command palette', async () => {
    const { commandPalette, manager } = await loadPlugin();
    const target = addCommand(manager, 'example:palette-target', vi.fn());
    addCommand(manager, 'command-palette:open', vi.fn());

    manager.executeCommandById('command-palette:open');
    commandPalette.onChooseItem(target);
    manager.executeCommandById(REPEAT_ID);

    expect(target.callback).toHaveBeenCalledTimes(2);
  });

  it('repeats the selected command when Repeat previous is chosen from the palette', async () => {
    const { commandPalette, manager } = await loadPlugin();
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
    async (launcherId) => {
      const { manager, statusItem } = await loadDesktopPlugin();
      const target = addCommand(
        manager,
        'example:target',
        vi.fn(),
        'Target command',
      );
      const launcher = addCommand(manager, launcherId, vi.fn());

      manager.executeCommandById(target.id);
      manager.executeCommandById(launcher.id);
      manager.executeCommandById(REPEAT_ID);

      expect(target.callback).toHaveBeenCalledTimes(2);
      expect(launcher.callback).toHaveBeenCalledOnce();
      expect(statusItem.text).toBe('Target command');
      expect(statusItem.tooltip).toBe('Previous command: Target command');
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
  ])(
    'skips an unavailable command palette with %s',
    async (_name, internalPlugins) => {
      const manager = new FakeCommandManager();
      const before = structuredClone(internalPlugins);
      let plugin: PluginInstance | undefined;

      plugin = await loadPluginWithApp({ commands: manager, internalPlugins });
      expect(internalPlugins).toEqual(before);

      plugin?.unload();
    },
  );

  it('repeats the last attempted command even when it returned false', async () => {
    const { manager, statusItem } = await loadDesktopPlugin();
    const callback = vi.fn();
    addCommand(manager, 'example:format', callback, 'Format document');
    manager.setResult('example:format', false);

    expect(manager.executeCommandById('example:format')).toBe(false);
    expect(statusItem.text).toBe('Format document');
    manager.executeCommandById(REPEAT_ID);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(statusItem.text).toBe('Format document');
  });

  it('records a throwing command and propagates its error', async () => {
    const { manager, statusItem } = await loadDesktopPlugin();
    const target = addCommand(
      manager,
      'example:throw',
      () => {
        throw new Error('target failed');
      },
      'Throw target',
    );

    expect(() => manager.executeCommandById(target.id)).toThrow('target failed');
    expect(statusItem.text).toBe('Throw target');
    target.callback = vi.fn();
    manager.executeCommandById(REPEAT_ID);

    expect(target.callback).toHaveBeenCalledOnce();
    expect(statusItem.text).toBe('Throw target');
  });

  it('keeps the same target across replay and nested commands', async () => {
    const { manager, statusItem } = await loadDesktopPlugin();
    const nested = vi.fn();
    const targetCallback = vi.fn();
    addCommand(manager, 'example:nested', nested, 'Nested command');
    const target = addCommand(
      manager,
      'example:target',
      targetCallback,
      'Target command',
    );

    manager.executeCommandById(target.id);
    target.callback = () => {
      targetCallback();
      manager.executeCommandById('example:nested');
    };
    manager.executeCommandById(REPEAT_ID);
    manager.executeCommandById(REPEAT_ID);

    expect(targetCallback).toHaveBeenCalledTimes(3);
    expect(nested).toHaveBeenCalledTimes(2);
    expect(statusItem.text).toBe('Target command');
  });

  it('keeps tracking suspended after a reentrant repeat returns', async () => {
    const { manager } = await loadPlugin();
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

  it('reports an unavailable target and retains its ID and name', async () => {
    const { manager, statusItem } = await loadDesktopPlugin();
    const callback = vi.fn();
    addCommand(
      manager,
      'example:temporary',
      callback,
      'Temporary command',
    );
    manager.executeCommandById('example:temporary');
    manager.remove('example:temporary');

    manager.executeCommandById(REPEAT_ID);
    expect(obsidianMock.notices).toEqual([
      'Previous action is unavailable.',
    ]);
    expect(statusItem.text).toBe('Temporary command');
    expect(statusItem.tooltip).toBe('Previous command: Temporary command');

    addCommand(
      manager,
      'example:temporary',
      callback,
      'Renamed command',
    );
    manager.executeCommandById(REPEAT_ID);
    expect(callback).toHaveBeenCalledTimes(2);
    expect(statusItem.text).toBe('Temporary command');
  });

  it('clears the replay guard after the repeated command throws', async () => {
    const { manager } = await loadPlugin();
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

  it('restores a reused command palette across unload and reload', async () => {
    const manager = new FakeCommandManager();
    const commandPalette = new FakeCommandPalette();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Method identity is the behavior under test.
    const original = commandPalette.onChooseItem;
    const target = addCommand(manager, 'example:palette-target', vi.fn());
    const first = await loadPlugin(manager, commandPalette);

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
    const second = await loadPlugin(manager, commandPalette);
    manager.executeCommandById(REPEAT_ID);
    expect(obsidianMock.notices).toEqual(['No previous action.']);

    commandPalette.onChooseItem(target);
    manager.executeCommandById(REPEAT_ID);
    expect(target.callback).toHaveBeenCalledTimes(3);

    second.plugin.unload();
    expect(
      Object.prototype.hasOwnProperty.call(commandPalette, 'onChooseItem'),
    ).toBe(false);
  });

  it('detaches the palette observer after a later wrapper is removed', async () => {
    const { commandPalette, manager, plugin } = await loadPlugin();
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

  it('starts with empty history after unload and reload', async () => {
    const manager = new FakeCommandManager();
    const first = await loadPlugin(manager);
    addCommand(manager, 'example:format', vi.fn());
    manager.executeCommandById('example:format');
    first.plugin.unload();

    await loadPlugin(manager);
    manager.executeCommandById(REPEAT_ID);

    expect(obsidianMock.notices).toEqual(['No previous action.']);
  });
});
