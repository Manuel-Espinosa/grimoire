import { build } from 'esbuild';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const UUID = 'grimoire@iammanu.dev';
const SCHEMA = 'org.gnome.shell.extensions.grimoire.gschema.xml';

// GJS imports must NOT be bundled — they are provided by the runtime.
const external = ['gi://*', 'resource://*', 'system', 'gettext', 'cairo'];

const common = {
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  conditions: ['import', 'require', 'default'],
  target: 'es2022',
  external,
  logLevel: 'info',
};

await rm('dist', { recursive: true, force: true });
await mkdir('dist/schemas', { recursive: true });
await mkdir('dist/icons', { recursive: true });

await build({ ...common, entryPoints: ['src/extension.ts'], outfile: 'dist/extension.js' });
await build({ ...common, entryPoints: ['src/prefs.ts'], outfile: 'dist/prefs.js' });

await copyFile('metadata.json', 'dist/metadata.json');
await copyFile('src/stylesheet.css', 'dist/stylesheet.css');
await copyFile('src/icons/grimoire-symbolic.svg', 'dist/icons/grimoire-symbolic.svg');
await copyFile(`schemas/${SCHEMA}`, `dist/schemas/${SCHEMA}`);
execSync('glib-compile-schemas dist/schemas', { stdio: 'inherit' });

console.log(`\n✔ Build complete -> dist/  (uuid: ${UUID})`);
