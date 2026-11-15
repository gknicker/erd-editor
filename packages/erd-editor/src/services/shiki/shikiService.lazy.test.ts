import { describe, expect, it, vi } from 'vite-plus/test';

import { ShikiService } from '@/services/shiki/shikiService';

const counts = vi.hoisted(() => ({
  sql: 0,
  go: 0,
  kotlin: 0,
  loadLanguage: [] as unknown[],
}));

// Each factory runs when its grammar module is first imported.
vi.mock('@shikijs/langs/sql', async importOriginal => {
  counts.sql++;
  return importOriginal();
});
vi.mock('@shikijs/langs/go', async importOriginal => {
  counts.go++;
  return importOriginal();
});
// Offline: this grammar's chunk never arrives.
vi.mock('@shikijs/langs/kotlin', () => {
  counts.kotlin++;
  throw new Error('offline');
});

vi.mock('shiki/core', async importOriginal => {
  const actual = await importOriginal<typeof import('shiki/core')>();
  return {
    ...actual,
    createHighlighterCore: async (
      ...args: Parameters<typeof actual.createHighlighterCore>
    ) => {
      const highlighter = await actual.createHighlighterCore(...args);
      const loadLanguage = highlighter.loadLanguage.bind(highlighter);
      highlighter.loadLanguage = (...langs) => {
        counts.loadLanguage.push(...langs);
        return loadLanguage(...langs);
      };
      return highlighter;
    },
  };
});

describe('ShikiService grammars', () => {
  it('starts with none, and loads a language on its first highlight', async () => {
    const service = new ShikiService();
    await vi.waitFor(() => expect(counts.loadLanguage).toEqual([]));
    expect(counts.sql).toBe(0);

    const html = await service.codeToHtml('SELECT 1;', { lang: 'sql' });

    expect(html).toContain('<pre class="shiki');
    expect(counts.sql).toBe(1);
    expect(counts.go).toBe(0);
  });

  it('loads a language once for two panels asking at once', async () => {
    const service = new ShikiService();
    counts.loadLanguage.length = 0;

    await Promise.all([
      service.codeToHtml('package main', { lang: 'go' }),
      service.codeToHtml('package erd', { lang: 'go' }),
    ]);
    await service.codeToHtml('package again', { lang: 'go' });

    expect(counts.loadLanguage).toHaveLength(1);
  });

  it('rejects a grammar that failed to load, and asks again next time', async () => {
    const service = new ShikiService();
    const before = counts.kotlin;

    await expect(
      service.codeToHtml('val x = 1', { lang: 'kotlin' })
    ).rejects.toBeTruthy();
    await expect(
      service.codeToHtml('val x = 1', { lang: 'kotlin' })
    ).rejects.toBeTruthy();

    expect(counts.kotlin).toBe(before + 2);
  });
});
