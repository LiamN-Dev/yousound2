import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { unzipSync } from 'fflate';

const repositoryRoot = process.cwd();
const partsDirectory = resolve(repositoryRoot, 'games/crossy-road/source');
const outputDirectory = resolve(repositoryRoot, 'public/games/crossy-road');
const parts = readdirSync(partsDirectory)
  .filter(name => /^source-\d{2}\.b64part$/.test(name))
  .sort();

if (!parts.length) {
  throw new Error('The bundled Crossy Road source archive is missing.');
}

const base64Archive = parts.map(name => readFileSync(join(partsDirectory, name), 'utf8').trim()).join('');
if (!base64Archive || base64Archive.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64Archive)) {
  throw new Error('The bundled Crossy Road source archive is incomplete or malformed.');
}

const zipBytes = Buffer.from(base64Archive, 'base64');
const entries = unzipSync(new Uint8Array(zipBytes));
const stagingDirectory = mkdtempSync(join(tmpdir(), 'yousound-crossy-road-'));

function writeArchiveEntry(name, bytes) {
  const normalized = name.replaceAll('\\\\', '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some(part => part === '..')) {
    throw new Error('Unsafe path in Crossy Road source archive: ' + name);
  }
  const target = resolve(stagingDirectory, normalized);
  if (!target.startsWith(stagingDirectory + sep)) {
    throw new Error('Crossy Road source archive attempted to write outside its staging directory.');
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
}

try {
  for (const [name, bytes] of Object.entries(entries)) {
    if (name.endsWith('/')) continue;
    writeArchiveEntry(name, bytes);
  }

  const packageFile = join(stagingDirectory, 'package.json');
  const expoConfigFile = join(stagingDirectory, 'app.json');
  if (!existsSync(packageFile) || !existsSync(expoConfigFile)) {
    throw new Error('The Crossy Road source archive is missing its Expo configuration.');
  }

  rmSync(outputDirectory, { recursive: true, force: true });
  mkdirSync(dirname(outputDirectory), { recursive: true });

  console.log('[Crossy Road] Installing the isolated Expo web-build dependencies…');
  execFileSync('npm', ['install', '--no-audit', '--no-fund'], {
    cwd: stagingDirectory,
    env: { ...process.env, CI: '1' },
    stdio: 'inherit',
  });

  console.log('[Crossy Road] Exporting the original 3D game for the YouSound subpath…');
  execFileSync('npx', ['expo', 'export', '-p', 'web', '--output-dir', outputDirectory], {
    cwd: stagingDirectory,
    env: { ...process.env, CI: '1' },
    stdio: 'inherit',
  });

  if (!existsSync(join(outputDirectory, 'index.html'))) {
    throw new Error('Expo export completed without producing public/games/crossy-road/index.html.');
  }
  console.log('[Crossy Road] Static 3D game bundle created at public/games/crossy-road/.');
} finally {
  rmSync(stagingDirectory, { recursive: true, force: true });
}
