import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const version = process.env.npm_package_version;
if (version === undefined) {
  throw new Error('npm_package_version is required');
}

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
manifest.version = version;
writeFileSync('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);

const versions = JSON.parse(readFileSync('versions.json', 'utf8'));
versions[version] = manifest.minAppVersion;
writeFileSync('versions.json', `${JSON.stringify(versions, null, 2)}\n`);
