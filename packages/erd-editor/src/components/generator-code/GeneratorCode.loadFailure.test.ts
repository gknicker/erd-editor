import { html } from '@dineug/r-html';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { createTestAppContext, mount, Mounted } from '@/__test-utils__/index';
import GeneratorCode from '@/components/generator-code/GeneratorCode';

const mocks = vi.hoisted(() => ({ attempts: 0 }));

// Offline: the chunk holding the generators never arrives.
vi.mock('@/utils/generator-code', () => {
  mocks.attempts++;
  throw new Error('offline');
});

const codeOf = (m: Mounted) =>
  m.container.querySelector('.scrollbar') as HTMLDivElement | null;

let mounted: Mounted | null = null;

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.restoreAllMocks();
});

describe('GeneratorCode, when its generators fail to load', () => {
  it('warns and shows no code, without throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mounted = mount(
      html`<${GeneratorCode} isDarkMode=${false} />`,
      createTestAppContext()
    );

    // A failed import settles later than a few ticks; wait for the outcome.
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        '[generator-code] the generators could not be loaded',
        expect.any(Error)
      )
    );
    expect(codeOf(mounted)?.textContent ?? '').toBe('');
  });

  it('asks for the generators again at the next opening', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = mocks.attempts;

    mounted = mount(
      html`<${GeneratorCode} isDarkMode=${false} />`,
      createTestAppContext()
    );

    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(mocks.attempts).toBe(before + 1);
  });
});
