import { describe, expect, it } from 'vitest';
import {
  incrementStableVersion,
  localReleaseGitCommands,
  prepareReleaseFiles,
  type ReleaseFiles,
  validateReleaseFiles,
} from './release';

const files = (overrides: Partial<ReleaseFiles> = {}): ReleaseFiles => ({
  packageJson: `${JSON.stringify({ name: 'obsidian-again', version: '1.0.0' }, null, 2)}\n`,
  manifestJson: `${
    JSON.stringify(
      { id: 'again', version: '1.0.0', minAppVersion: '1.12.7' },
      null,
      2,
    )
  }\n`,
  versionsJson: `${JSON.stringify({ '1.0.0': '1.12.7' }, null, 2)}\n`,
  changelog:
    '# Changelog\n\n## [Unreleased]\n\n- Added release automation.\n\n## [1.0.0] - 2026-04-28\n\n- Initial release.\n',
  ...overrides,
});

describe('incrementStableVersion', () => {
  it.each(
    [
      ['patch', '1.2.4'],
      ['minor', '1.3.0'],
      ['major', '2.0.0'],
    ] as const,
  )('increments %s versions', (bump, expected) => {
    expect(incrementStableVersion('1.2.3', bump)).toBe(expected);
  });

  it.each(['1.2', 'v1.2.3', '1.2.3-beta.1', '01.2.3'])(
    'rejects unstable or malformed version %s',
    (version) => {
      expect(() => incrementStableVersion(version, 'patch')).toThrow(
        `Invalid stable semantic version: ${version}`,
      );
    },
  );

  it('rejects an unknown bump', () => {
    expect(() => incrementStableVersion('1.2.3', 'calendar')).toThrow(
      'Invalid release bump: calendar. Expected patch, minor, or major.',
    );
  });
});

describe('prepareReleaseFiles', () => {
  it('synchronizes versions and moves Unreleased notes', () => {
    const prepared = prepareReleaseFiles(files(), '1.1.0', '2026-05-01');

    expect(JSON.parse(prepared.packageJson)).toMatchObject({
      name: 'obsidian-again',
      version: '1.1.0',
    });
    expect(JSON.parse(prepared.manifestJson)).toMatchObject({
      id: 'again',
      version: '1.1.0',
    });
    expect(JSON.parse(prepared.versionsJson)).toEqual({
      '1.0.0': '1.12.7',
      '1.1.0': '1.12.7',
    });
    expect(prepared.changelog).toContain('## [Unreleased]\n\n## [1.1.0] - 2026-05-01');
    expect(prepared.changelog).toContain('## [1.1.0] - 2026-05-01\n\n- Added release automation.');
  });

  it('rejects an empty Unreleased section', () => {
    const changelog =
      '# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-04-28\n\n- Initial release.\n';

    expect(() => prepareReleaseFiles(files({ changelog }), '1.1.0', '2026-05-01')).toThrow(
      'The Unreleased changelog section is empty.',
    );
  });

  it('rejects a duplicate release version', () => {
    expect(() => prepareReleaseFiles(files(), '1.0.0', '2026-05-01')).toThrow(
      'Changelog already contains version 1.0.0.',
    );
  });
});

describe('validateReleaseFiles', () => {
  it('accepts synchronized release files', () => {
    const prepared = prepareReleaseFiles(files(), '1.1.0', '2026-05-01');

    expect(() => validateReleaseFiles(prepared, '1.1.0')).not.toThrow();
  });

  it('rejects mismatched package and manifest versions', () => {
    expect(() => validateReleaseFiles(files(), '1.1.0')).toThrow(
      'package.json version is 1.0.0; expected 1.1.0.',
    );
  });

  it('rejects a missing versions entry', () => {
    const prepared = prepareReleaseFiles(files(), '1.1.0', '2026-05-01');
    const withoutVersion = { ...prepared, versionsJson: '{}\n' };

    expect(() => validateReleaseFiles(withoutVersion, '1.1.0')).toThrow(
      'versions.json does not map 1.1.0 to Obsidian 1.12.7.',
    );
  });
});

describe('localReleaseGitCommands', () => {
  it('creates only local commit and annotated tag commands', () => {
    const commands = localReleaseGitCommands('1.1.0');

    expect(commands).toEqual([
      ['add', 'package.json', 'manifest.json', 'versions.json', 'CHANGELOG.md'],
      ['commit', '-m', 'release: 1.1.0'],
      ['tag', '-a', '1.1.0', '-m', 'Again 1.1.0'],
    ]);
    expect(commands.flat()).not.toContain('push');
  });
});
