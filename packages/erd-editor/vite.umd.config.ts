import { join } from 'node:path';

import { defineConfig, lazyPlugins } from 'vite-plus';
import { BROWSER_TARGET } from '../../build-target';
import { base64InlineWorkers } from '../../tools/vite/inline-worker.ts';
import { loadLibraryMetadata } from '../../tools/vite/package-metadata.ts';

const packageDir = import.meta.dirname;
const { manifest } = loadLibraryMetadata(packageDir);
const rHtmlPackage: string = '@dineug/vite-plugin-r-html';
const rHtmlPlugins = lazyPlugins(async () => {
  const { rHtml } = await import(rHtmlPackage);
  return [rHtml({ jsx: { konvaImportSource: '@/konva/host' } })];
});

// The script-tag build, run after the es one by the build task: one file with
// every dependency and both workers inside, exposed as window.ErdEditor. The
// exports map never points here; a bundler takes the es modules instead.
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(manifest.version),
  },
  build: {
    target: BROWSER_TARGET,
    // The es build owns dist and has already written it.
    emptyOutDir: false,
    lib: {
      entry: './src/index.ts',
      name: 'ErdEditor',
      formats: ['umd'],
      fileName: () => 'erd-editor.umd.js',
    },
  },
  worker: {
    plugins: () => [rHtmlPlugins],
  },
  resolve: {
    // The inline twins go first: alias entries match in order, and the bare
    // @ entry would otherwise claim these specifiers too.
    alias: [
      {
        find: '@/workers/spawn',
        replacement: join(packageDir, 'src/workers/spawn.inline.ts'),
      },
      {
        find: '@/components/generator-code/loadGenerators',
        replacement: join(
          packageDir,
          'src/components/generator-code/loadGenerators.inline.ts'
        ),
      },
      { find: '@', replacement: join(packageDir, 'src') },
    ],
  },
  plugins: [rHtmlPlugins, base64InlineWorkers()],
});
