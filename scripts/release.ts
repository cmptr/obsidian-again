import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const RELEASE_FILES = ['package.json', 'manifest.json', 'versions.json', 'CHANGELOG.md'] as const;
const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export type ReleaseFiles = {
  packageJson: string;
  manifestJson: string;
  versionsJson: string;
  changelog: string;
};

type JsonObject = Record<string, unknown>;
type GitCommand = readonly [command: string, ...arguments_: string[]];

function parseObject(source: string, filename: string): JsonObject {
  const value: unknown = JSON.parse(source);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${filename} must contain a JSON object.`);
  }
  return value as JsonObject;
}

function stableVersionParts(version: string): [number, number, number] {
  const match = STABLE_VERSION.exec(version);
  if (!match) {
    throw new Error(`Invalid stable semantic version: ${version}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function incrementStableVersion(version: string, bump: string): string {
  const [major, minor, patch] = stableVersionParts(version);
  switch (bump) {
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'major':
      return `${major + 1}.0.0`;
    default:
      throw new Error(`Invalid release bump: ${bump}. Expected patch, minor, or major.`);
  }
}

function stringifyJson(value: JsonObject): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function releaseDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function prepareReleaseFiles(
  files: ReleaseFiles,
  version: string,
  date = releaseDate(),
): ReleaseFiles {
  stableVersionParts(version);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid release date: ${date}`);
  }
  if (files.changelog.includes(`## [${version}]`)) {
    throw new Error(`Changelog already contains version ${version}.`);
  }

  const heading = '## [Unreleased]';
  const headingIndex = files.changelog.indexOf(heading);
  if (headingIndex === -1) {
    throw new Error('CHANGELOG.md is missing an Unreleased section.');
  }
  const contentStart = headingIndex + heading.length;
  const nextHeading = files.changelog.indexOf('\n## [', contentStart);
  if (nextHeading === -1) {
    throw new Error('CHANGELOG.md has no release section after Unreleased.');
  }
  const notes = files.changelog.slice(contentStart, nextHeading).trim();
  if (notes.length === 0) {
    throw new Error('The Unreleased changelog section is empty.');
  }

  const packageJson = parseObject(files.packageJson, 'package.json');
  const manifestJson = parseObject(files.manifestJson, 'manifest.json');
  const versionsJson = parseObject(files.versionsJson, 'versions.json');
  const minAppVersion = manifestJson.minAppVersion;
  if (typeof minAppVersion !== 'string' || minAppVersion.length === 0) {
    throw new Error('manifest.json must define minAppVersion.');
  }

  packageJson.version = version;
  manifestJson.version = version;
  versionsJson[version] = minAppVersion;

  const changelog = `${
    files.changelog.slice(0, contentStart)
  }\n\n## [${version}] - ${date}\n\n${notes}\n${files.changelog.slice(nextHeading)}`;

  return {
    packageJson: stringifyJson(packageJson),
    manifestJson: stringifyJson(manifestJson),
    versionsJson: stringifyJson(versionsJson),
    changelog,
  };
}

export function validateReleaseFiles(files: ReleaseFiles, expectedVersion: string): void {
  stableVersionParts(expectedVersion);
  const packageJson = parseObject(files.packageJson, 'package.json');
  const manifestJson = parseObject(files.manifestJson, 'manifest.json');
  const versionsJson = parseObject(files.versionsJson, 'versions.json');

  if (packageJson.version !== expectedVersion) {
    throw new Error(
      `package.json version is ${String(packageJson.version)}; expected ${expectedVersion}.`,
    );
  }
  if (manifestJson.version !== expectedVersion) {
    throw new Error(
      `manifest.json version is ${String(manifestJson.version)}; expected ${expectedVersion}.`,
    );
  }
  const minAppVersion = manifestJson.minAppVersion;
  if (typeof minAppVersion !== 'string' || versionsJson[expectedVersion] !== minAppVersion) {
    throw new Error(
      `versions.json does not map ${expectedVersion} to Obsidian ${String(minAppVersion)}.`,
    );
  }
  if (!files.changelog.includes(`## [${expectedVersion}] - `)) {
    throw new Error(`CHANGELOG.md does not contain version ${expectedVersion}.`);
  }
}

export function localReleaseGitCommands(version: string): readonly GitCommand[] {
  stableVersionParts(version);
  return [
    ['add', ...RELEASE_FILES],
    ['commit', '-m', `release: ${version}`],
    ['tag', '-a', version, '-m', `Again ${version}`],
  ];
}

function readReleaseFiles(): ReleaseFiles {
  return {
    packageJson: readFileSync('package.json', 'utf8'),
    manifestJson: readFileSync('manifest.json', 'utf8'),
    versionsJson: readFileSync('versions.json', 'utf8'),
    changelog: readFileSync('CHANGELOG.md', 'utf8'),
  };
}

function writeReleaseFiles(files: ReleaseFiles): void {
  writeFileSync('package.json', files.packageJson);
  writeFileSync('manifest.json', files.manifestJson);
  writeFileSync('versions.json', files.versionsJson);
  writeFileSync('CHANGELOG.md', files.changelog);
}

function gitOutput(...arguments_: string[]): string {
  return execFileSync('git', arguments_, { encoding: 'utf8' }).trim();
}

function run(command: string, ...arguments_: string[]): void {
  const result = spawnSync(command, arguments_, { stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${arguments_.join(' ')} failed with status ${String(result.status)}.`,
    );
  }
}

function assertCleanMain(): void {
  if (gitOutput('branch', '--show-current') !== 'main') {
    throw new Error('Releases must be created from the main branch.');
  }
  if (gitOutput('status', '--porcelain').length > 0) {
    throw new Error('Release commits and tags require a clean worktree.');
  }
}

function assertTagMissing(version: string): void {
  const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${version}`], {
    stdio: 'ignore',
  });
  if (result.status === 0) {
    throw new Error(`Tag ${version} already exists.`);
  }
  if (result.status !== 1) {
    throw new Error(`Could not inspect tag ${version}.`);
  }
}

function printPushCommand(version: string): void {
  console.log(`Release created locally. Push when ready: git push origin main ${version}`);
}

function prepare(version: string): void {
  writeReleaseFiles(prepareReleaseFiles(readReleaseFiles(), version));
  console.log(`Prepared release ${version}. Review the changed release files.`);
}

function validate(version: string): void {
  validateReleaseFiles(readReleaseFiles(), version);
  console.log(`Release files are synchronized at ${version}.`);
}

function pretag(version: string): void {
  stableVersionParts(version);
  assertCleanMain();
  assertTagMissing(version);
  validate(version);
  run('git', 'tag', '-a', version, '-m', `Again ${version}`);
  printPushCommand(version);
}

function cut(bump: string): void {
  assertCleanMain();
  const currentPackage = parseObject(readFileSync('package.json', 'utf8'), 'package.json');
  if (typeof currentPackage.version !== 'string') {
    throw new Error('package.json must define a version.');
  }
  const version = incrementStableVersion(currentPackage.version, bump);
  assertTagMissing(version);
  writeReleaseFiles(prepareReleaseFiles(readReleaseFiles(), version));
  run('make', 'release', `VERSION=${version}`);
  for (const [command, ...arguments_] of localReleaseGitCommands(version)) {
    run('git', command, ...arguments_);
  }
  printPushCommand(version);
}

function requiredArgument(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

function main(): void {
  const command = requiredArgument(process.argv[2], 'release command');
  const argument = process.argv[3];
  switch (command) {
    case 'prepare':
      prepare(requiredArgument(argument, 'version'));
      break;
    case 'validate':
      validate(requiredArgument(argument, 'version'));
      break;
    case 'pretag':
      pretag(requiredArgument(argument, 'version'));
      break;
    case 'cut':
      cut(requiredArgument(argument, 'bump'));
      break;
    default:
      throw new Error(`Unknown release command: ${command}.`);
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
