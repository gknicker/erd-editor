// @vitest-environment node

// A store needs the classification lists and nothing more of the catalog; via
// the registry they evaluated every generator action and schema importer in
// each graph that builds a store, the export-png worker's included.

import { beforeAll, describe, expect, it } from 'vite-plus/test';

import { reach } from '@/__test-utils__/sourceGraph';

const WORKER = 'services/export-png/exportPng.shared-worker.ts';

// Transpiling the worker's graph cold is the slow part, slower again under
// coverage; done once here, every walk below reads the cache.
beforeAll(() => reach(WORKER), 60_000);

/** What only the editor's own import actions have reason to reach. */
const isCatalogOnly = (file: string) =>
  file === 'engine/actions.ts' ||
  /^engine\/modules\/[^/]+\/generator\.actions\.ts$/.test(file) ||
  /^utils\/schema-(sql|graphql|dbml|aml)-parser\//.test(file);

describe.each([
  'components/appContext.ts',
  'engine/action-types.ts',
  // engine.js: rolldown chunks by what an entry reaches, not by what it runs,
  // so one importer in reach lands every parser in the replica's chunk.
  'engine/index.ts',
  'engine/store.ts',
  'engine/rx-store.ts',
  'engine/shared-store.ts',
])('%s', entry => {
  it('evaluates neither the creator registry nor a generator action', async () => {
    const files = await reach(entry);

    expect(files).toContain(entry);
    expect(files.filter(isCatalogOnly)).toEqual([]);
  });
});

describe('services/export-png/exportPng.shared-worker.ts', () => {
  // The worker names single generator actions, which tree shaking prunes; a
  // module spreading every barrel, as the deleted engine/actions.ts did,
  // would keep each creator and its importers live in the bundle.
  it('evaluates no merged creator registry', async () => {
    expect(await reach(WORKER)).not.toContain('engine/actions.ts');
  });
});

describe('the walk', () => {
  it('reaches the parsers from the module that imports them', async () => {
    const files = await reach(WORKER);

    expect(files).toContain('engine/modules/editor/generator.actions.ts');
    expect(files).toContain('utils/schema-graphql-parser/index.ts');
  });
});
