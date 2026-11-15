// @vitest-environment node

// The worker draws on konva and keeps no stylesheet, yet a constant read from
// a module that evaluates a css template or the theme palette as it loads
// brings that whole module, and what it pulls, into the worker's bundle.

import { beforeAll, describe, expect, it } from 'vite-plus/test';

import { reach, readSource } from '@/__test-utils__/sourceGraph';

const WORKER = 'services/export-png/exportPng.shared-worker.ts';

const CSS_TEMPLATE = /\bcss(?:\.global)?\s*`/;

describe('the export-png worker', () => {
  let files: string[] = [];

  // The cold transpile of the worker's graph, slower under coverage.
  beforeAll(async () => {
    files = await reach(WORKER);
  }, 60_000);

  it('reaches the scene it draws', () => {
    expect(files).toContain('services/export-png/ExportScene.tsx');
    expect(files).toContain('components/erd/canvas/table/Table.tsx');
  });

  it('evaluates no stylesheet module', () => {
    expect(files.filter(file => file.endsWith('.styles.ts'))).toEqual([]);
  });

  it('evaluates no css template', () => {
    expect(files.filter(file => CSS_TEMPLATE.test(readSource(file)))).toEqual(
      []
    );
  });

  it('evaluates no theme palette', () => {
    expect(files.filter(file => file.startsWith('themes/radix-ui'))).toEqual(
      []
    );
  });
});
