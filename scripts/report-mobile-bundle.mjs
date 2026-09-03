import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const outputDirectory = 'www';
const statsPath = join(outputDirectory, 'stats.json');

if (!existsSync(statsPath)) {
  console.error(`Bundle stats not found at ${statsPath}. Run npm run build:stats first.`);
  process.exitCode = 1;
} else {
  const stats = JSON.parse(readFileSync(statsPath, 'utf8'));
  const outputs = stats.outputs ?? {};
  const initialOutputs = findInitialOutputs(outputs);
  const initialBytes = sumOutputBytes(outputs, initialOutputs);
  const javascriptBytes = sumFiles(outputDirectory, new Set(['.js']));
  const cssBytes = sumFiles(outputDirectory, new Set(['.css']));
  const fontBytes = sumFiles(join(outputDirectory, 'media'), new Set(['.woff', '.woff2', '.ttf', '.otf']));
  const largestInitialInputs = aggregateInitialInputs(outputs, initialOutputs).slice(0, 15);

  console.log('Mobile production bundle');
  console.log(`Initial JavaScript/CSS: ${formatBytes(initialBytes)}`);
  console.log(`All JavaScript:        ${formatBytes(javascriptBytes)}`);
  console.log(`All CSS:               ${formatBytes(cssBytes)}`);
  console.log(`All fonts:             ${formatBytes(fontBytes)}`);
  console.log('\nLargest initial inputs:');
  for (const [path, bytes] of largestInitialInputs) {
    console.log(`${formatBytes(bytes).padStart(10)}  ${path}`);
  }
}

function findInitialOutputs(outputs) {
  const entryPoints = Object.entries(outputs)
    .filter(([path, output]) => isInitialEntryPoint(output.entryPoint) && isCodeOrStyle(path))
    .map(([path]) => path);
  const visited = new Set();
  const pending = [...entryPoints];

  while (pending.length > 0) {
    const outputPath = pending.pop();
    if (!outputPath || visited.has(outputPath)) continue;
    visited.add(outputPath);
    for (const imported of outputs[outputPath]?.imports ?? []) {
      if (imported.kind !== 'dynamic-import' && isCodeOrStyle(imported.path)) {
        pending.push(imported.path);
      }
    }
  }

  return visited;
}

function isCodeOrStyle(path) {
  return path.endsWith('.js') || path.endsWith('.css');
}

function isInitialEntryPoint(entryPoint) {
  return typeof entryPoint === 'string'
    && (entryPoint === 'apps/mobile/src/main.ts'
    || entryPoint.startsWith('angular:polyfills:')
    || entryPoint.startsWith('angular:styles/global:'));
}

function sumOutputBytes(outputs, outputPaths) {
  let bytes = 0;
  for (const outputPath of outputPaths) bytes += outputs[outputPath]?.bytes ?? 0;
  return bytes;
}

function aggregateInitialInputs(outputs, outputPaths) {
  const totals = new Map();
  for (const outputPath of outputPaths) {
    for (const [inputPath, input] of Object.entries(outputs[outputPath]?.inputs ?? {})) {
      totals.set(inputPath, (totals.get(inputPath) ?? 0) + input.bytesInOutput);
    }
  }
  return [...totals.entries()].sort((left, right) => right[1] - left[1]);
}

function sumFiles(directory, extensions) {
  if (!existsSync(directory)) return 0;
  let bytes = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      bytes += sumFiles(path, extensions);
    } else if (extensions.has(extname(entry.name))) {
      bytes += statSync(path).size;
    }
  }
  return bytes;
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}
