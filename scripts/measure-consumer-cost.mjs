#!/usr/bin/env node
// Measures what an app that installs erd-editor ships, by package; not a gate.
// pnpm size weighs dist, where npm dependencies stay bare imports; this builds
// as such an app does and weighs what each realm loads. Run after pnpm build.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const packageDir = path.join(root, 'packages', 'erd-editor');
const GZIP_LEVEL = 9;
const OWN = '(erd-editor)';

const USAGE = `Usage: node scripts/measure-consumer-cost.mjs [options]

  (no options)         Print what each realm loads, by package.
  --export <key>       The exports key the app imports. Default ".".
  --json <file>        Also write the measurement as JSON.
  --compare <file>     Print the change against an earlier --json file.
  --keep <dir>         Build into <dir> and leave it, to read the chunks.
  --help               Print this text.

Realms: "page" is what the entry loads before anything runs, "page (on
demand)" what its dynamic imports add, and each worker the same pair. A chunk
two realms load counts in both, as it is downloaded for each. Each package is
one chunk here, so a package an app splits across dynamic imports, as shiki's
grammars are, shows as one on-demand chunk rather than one per import.`;

function parseArgs(argv) {
  const options = { exportKey: '.', json: null, compare: null, keep: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--export') options.exportKey = argv[++i];
    else if (arg === '--json') options.json = argv[++i];
    else if (arg === '--compare') options.compare = argv[++i];
    else if (arg === '--keep') options.keep = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

/** The dist script an exports key resolves to. */
function entryOf(exportKey) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')
  );
  const target = manifest.exports[exportKey];
  if (!target) throw new Error(`No exports key ${exportKey}`);
  const file = path.join(
    packageDir,
    typeof target === 'string' ? target : target.default
  );
  if (!fs.existsSync(file)) {
    throw new Error(
      `Missing build output: ${path.relative(root, file)}. Run: pnpm exec vp run --filter @dineug/erd-editor --fail-if-no-match build`
    );
  }
  return file;
}

/** The npm package a module id belongs to, or null for erd-editor's own. */
function packageOf(id) {
  const at = id.lastIndexOf('node_modules/');
  if (at < 0) return null;
  const [scope, name] = id.slice(at + 'node_modules/'.length).split('/');
  return scope.startsWith('@') ? `${scope}/${name}` : scope;
}

/**
 * A chunk name carrying the package through the file name rolldown writes,
 * which rewrites @, / and + on the way: pkg~name, or pkg~~scope~name.
 */
const chunkName = id => {
  const pkg = packageOf(id);
  if (!pkg) return null;
  const [scope, name] = pkg.split('/');
  return name ? `pkg~~${scope.slice(1)}~${name}` : `pkg~${pkg}`;
};

/** The package a chunk file was named for, or erd-editor's own code. */
function packageOfChunk(file) {
  const base = path.basename(file);
  const scoped = base.match(/^pkg~~([^~]+)~(.+)-[\w-]{8}\.js$/);
  if (scoped) return `@${scoped[1]}/${scoped[2]}`;
  const plain = base.match(/^pkg~(.+)-[\w-]{8}\.js$/);
  return plain ? plain[1] : OWN;
}

async function buildApp(entry, outDir) {
  const { build } = await import('vite-plus');
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erd-consumer-'));
  const appEntry = path.join(appDir, 'main.js');
  fs.writeFileSync(appEntry, `import ${JSON.stringify(entry)};\n`);
  // Hashed names keep two worker passes that split one package differently
  // from writing the same file; the realm walk, not the name, says who loads it.
  const output = (prefix = '') => ({
    codeSplitting: { groups: [{ name: chunkName, test: /node_modules/ }] },
    entryFileNames: `${prefix}[name]-[hash].js`,
    chunkFileNames: `${prefix}[name]-[hash].js`,
  });

  await build({
    configFile: false,
    root: appDir,
    base: './',
    logLevel: 'error',
    build: {
      outDir,
      emptyOutDir: true,
      minify: true,
      reportCompressedSize: false,
      rolldownOptions: { input: appEntry, output: output() },
    },
    worker: { format: 'es', rolldownOptions: { output: output('w/') } },
  });
  fs.rmSync(appDir, { recursive: true, force: true });
}

const STATIC_IMPORT = /(?:\bfrom\s*|\bimport\s*)["'`](\.{1,2}\/[^"'`]+\.js)["'`]/g;
const DYNAMIC_IMPORT = /\bimport\(\s*["'`](\.{1,2}\/[^"'`]+\.js)["'`]\s*\)/g;
const WORKER_URL = /new URL\(\s*["'`](\.{0,2}\/?[^"'`]+\.js)["'`]/g;

/** Static, dynamic and worker references of one output script. */
function referencesOf(file, outDir) {
  const code = fs.readFileSync(file, 'utf8');
  const local = spec => path.resolve(path.dirname(file), spec);
  const fromRoot = spec =>
    spec.startsWith('/') ? path.join(outDir, spec) : local(spec);
  return {
    statics: [...code.matchAll(STATIC_IMPORT)].map(m => local(m[1])),
    dynamics: [...code.matchAll(DYNAMIC_IMPORT)].map(m => local(m[1])),
    workers: [...code.matchAll(WORKER_URL)].map(m => fromRoot(m[1])),
  };
}

/** The realms an output loads, each as its eager and its on-demand files. */
function realmsOf(outDir, appEntryFile) {
  const realms = [];
  const roots = [{ name: 'page', file: appEntryFile }];
  const seenRoots = new Set();

  while (roots.length) {
    const { name, file } = roots.shift();
    if (seenRoots.has(file)) continue;
    seenRoots.add(file);

    const closure = (start, followDynamic) => {
      const seen = new Set();
      const pending = [...start];
      while (pending.length) {
        const current = pending.pop();
        if (seen.has(current) || !fs.existsSync(current)) continue;
        seen.add(current);
        const refs = referencesOf(current, outDir);
        pending.push(...refs.statics);
        if (followDynamic) pending.push(...refs.dynamics);
        for (const worker of refs.workers) {
          const label = path.basename(worker).replace(/-[\w-]{8}\.js$/, '');
          roots.push({ name: label, file: worker });
        }
      }
      return seen;
    };

    const eager = closure([file], false);
    const all = closure([file], true);
    const onDemand = [...all].filter(f => !eager.has(f));
    realms.push({ name, eager: [...eager], onDemand });
  }
  return realms;
}

/** Bytes by package for a set of files. */
function weigh(files) {
  const byPackage = {};
  for (const file of files) {
    const key = packageOfChunk(file);
    const bytes = fs.readFileSync(file);
    const entry = (byPackage[key] ??= { raw: 0, gzip: 0 });
    entry.raw += bytes.length;
    entry.gzip += gzipSync(bytes, { level: GZIP_LEVEL }).length;
  }
  return byPackage;
}

const total = byPackage =>
  Object.values(byPackage).reduce(
    (sum, { raw, gzip }) => ({ raw: sum.raw + raw, gzip: sum.gzip + gzip }),
    { raw: 0, gzip: 0 }
  );

const kb = bytes => `${(bytes / 1024).toFixed(1)} kB`.padStart(10);
const delta = bytes =>
  `${bytes > 0 ? '+' : ''}${(bytes / 1024).toFixed(1)} kB`.padStart(10);

function print(measurement, previous) {
  for (const [realm, byPackage] of Object.entries(measurement.realms)) {
    const sum = total(byPackage);
    const before = previous?.realms[realm];
    const change = before
      ? ` (${delta(sum.gzip - total(before).gzip).trim()} gzip)`
      : '';
    console.log(
      `\n${realm}: ${kb(sum.raw).trim()} raw, ${kb(sum.gzip).trim()} gzip${change}`
    );
    const keys = new Set([...Object.keys(byPackage), ...Object.keys(before ?? {})]);
    const rows = [...keys]
      .map(key => ({
        key,
        now: byPackage[key] ?? { raw: 0, gzip: 0 },
        was: before?.[key],
      }))
      .sort((a, b) => b.now.raw - a.now.raw);
    for (const { key, now, was } of rows) {
      const diff =
        was && (was.raw !== now.raw || was.gzip !== now.gzip)
          ? `  ${delta(now.raw - was.raw)} raw ${delta(now.gzip - was.gzip)} gzip`
          : previous && !was
            ? '  (new)'
            : '';
      console.log(`  ${key.padEnd(32)}${kb(now.raw)}${kb(now.gzip)}${diff}`);
    }
  }
  for (const realm of Object.keys(previous?.realms ?? {})) {
    if (!measurement.realms[realm]) console.log(`\n${realm}: gone`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }

  const entry = entryOf(options.exportKey);
  const outDir =
    options.keep ??
    fs.mkdtempSync(path.join(os.tmpdir(), 'erd-consumer-out-'));
  await buildApp(entry, path.resolve(outDir));

  const appEntryFile = fs
    .readdirSync(outDir)
    .filter(file => /^main-[\w-]{8}\.js$/.test(file))
    .map(file => path.join(outDir, file))[0];
  const realms = {};
  for (const { name, eager, onDemand } of realmsOf(outDir, appEntryFile)) {
    realms[name] = weigh(eager);
    if (onDemand.length) realms[`${name} (on demand)`] = weigh(onDemand);
  }
  const measurement = { exportKey: options.exportKey, gzipLevel: GZIP_LEVEL, realms };

  const previous = options.compare
    ? JSON.parse(fs.readFileSync(options.compare, 'utf8'))
    : null;
  print(measurement, previous);
  if (options.json) {
    fs.writeFileSync(options.json, `${JSON.stringify(measurement, null, 2)}\n`);
  }
  if (!options.keep) fs.rmSync(outDir, { recursive: true, force: true });
}

main().catch(error => {
  console.error(error.message ?? error);
  process.exit(1);
});
