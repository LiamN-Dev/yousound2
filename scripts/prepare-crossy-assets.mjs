import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_COMMIT = '6f2e84e580c9c8f2b432aa365f706d45d96d8bc9';
const ARCHIVE_URL = 'https://codeload.github.com/evanbacon/expo-crossy-road/zip/' + SOURCE_COMMIT;
const MODEL_OUT = path.join(ROOT, 'public', 'crossy-source', 'models');
const AUDIO_OUT = path.join(ROOT, 'public', 'crossy-audio');
const SOURCE_MARKER = path.join(ROOT, 'public', 'crossy-source', '.source-commit');
const AUDIO_MARKER = path.join(AUDIO_OUT, '.source-commit');

const AUDIO_FILES = {
  'move-01.wav': 'buck1.wav',
  'move-02.wav': 'buck2.wav',
  'move-03.wav': 'buck3.wav',
  'move-04.wav': 'buck4.wav',
  'move-05.wav': 'buck5.wav',
  'move-06.wav': 'buck6.wav',
  'move-07.wav': 'buck7.wav',
  'move-08.wav': 'buck8.wav',
  'move-09.wav': 'buck9.wav',
  'move-10.wav': 'buck10.wav',
  'move-11.wav': 'buck11.wav',
  'move-12.wav': 'buck12.wav',
  'death-01.wav': 'chickendeath.wav',
  'death-02.wav': 'chickendeath2.wav',
  'car-hit-01.mp3': 'carhit.mp3',
  'car-hit-02.wav': 'carsquish3.wav',
  'water-splash.mp3': 'watersplashlow.mp3',
  'train-alarm.wav': 'Train_Alarm.wav',
  'train-pass-01.wav': 'train_pass_no_horn.wav',
  'train-pass-02.wav': 'train_pass_shorter.wav',
  'train-crash.wav': 'trainsplat.wav',
  'button-in.wav': 'Pop_1.wav',
  'button-out.wav': 'Pop_2.wav',
  'coin.mp3': 'Get Coin 73 wav.mp3',
  'points.mp3': 'Earn Points #010699.mp3',
  'car-horn.wav': 'car-horn.wav',
};

async function isPrepared(marker) {
  try {
    return (await readFile(marker, 'utf8')).trim() === SOURCE_COMMIT;
  } catch {
    return false;
  }
}

async function prepare() {
  if (await isPrepared(SOURCE_MARKER) && await isPrepared(AUDIO_MARKER)) {
    console.log('[Crossy Road assets] Source models and audio are already prepared.');
    return;
  }

  console.log('[Crossy Road assets] Downloading pinned Expo source archive ' + SOURCE_COMMIT + '…');
  const response = await fetch(ARCHIVE_URL, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error('Crossy Road source download failed with HTTP ' + response.status + '.');
  const archiveBytes = new Uint8Array(await response.arrayBuffer());
  const entries = unzipSync(archiveBytes);
  const names = Object.keys(entries);
  const modelAnchor = names.find((name) => name.endsWith('/assets/models/characters/chicken/0.obj'));
  const audioAnchor = names.find((name) => name.endsWith('/assets/audio/buck1.wav'));
  if (!modelAnchor || !audioAnchor) {
    throw new Error('The pinned Crossy Road source archive is missing its expected models or audio folders.');
  }
  const sourceRoot = modelAnchor.slice(0, modelAnchor.indexOf('/assets/models/'));

  await rm(path.join(ROOT, 'public', 'crossy-source'), { recursive: true, force: true });
  await rm(AUDIO_OUT, { recursive: true, force: true });
  await mkdir(MODEL_OUT, { recursive: true });
  await mkdir(AUDIO_OUT, { recursive: true });

  let modelCount = 0;
  let modelBytes = 0;
  const modelPrefix = sourceRoot + '/assets/models/';
  for (const [entryName, bytes] of Object.entries(entries)) {
    if (!entryName.startsWith(modelPrefix) || entryName.endsWith('/')) continue;
    const relative = entryName.slice(modelPrefix.length);
    const destination = path.join(MODEL_OUT, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
    modelCount += 1;
    modelBytes += bytes.byteLength;
  }

  let audioCount = 0;
  let audioBytes = 0;
  const audioPrefix = sourceRoot + '/assets/audio/';
  for (const [outputName, sourceName] of Object.entries(AUDIO_FILES)) {
    const entryName = audioPrefix + sourceName;
    const bytes = entries[entryName];
    if (!bytes) throw new Error('Required source sound is missing: ' + sourceName);
    await writeFile(path.join(AUDIO_OUT, outputName), bytes);
    audioCount += 1;
    audioBytes += bytes.byteLength;
  }

  if (modelCount < 40) throw new Error('Only ' + modelCount + ' source models were extracted; the full source model set was expected.');
  await writeFile(SOURCE_MARKER, SOURCE_COMMIT + '\n');
  await writeFile(AUDIO_MARKER, SOURCE_COMMIT + '\n');
  console.log('[Crossy Road assets] Prepared ' + modelCount + ' models (' + modelBytes + ' bytes) and ' + audioCount + ' original sounds (' + audioBytes + ' bytes).');
}

prepare().catch((error) => {
  console.error('[Crossy Road assets] ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
