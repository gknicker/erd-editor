import { html } from '@dineug/r-html';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { mount, Mounted } from '@/__test-utils__/index';
import ColorPicker from '@/components/primitives/color-picker/ColorPicker';

const mocks = vi.hoisted(() => ({ attempts: 0 }));

// Offline: the chunk holding the library never arrives.
vi.mock('@easylogic/colorpicker', () => {
  mocks.attempts++;
  throw new Error('offline');
});

let mounted: Mounted | null = null;

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.restoreAllMocks();
});

describe('ColorPicker, when its library fails to load', () => {
  it('warns, draws only its empty container, and throws nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mounted = mount(html`<${ColorPicker} x=${0} y=${0} color=${'#000000'} />`);

    // A failed import settles later than a few ticks; wait for the outcome.
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        '[color-picker] the picker could not be loaded',
        expect.any(Error)
      )
    );
    const container = mounted.container.querySelector('.color-picker');
    expect(container).not.toBeNull();
    expect(container!.children).toHaveLength(0);
  });

  it('asks for the library again at the next opening', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = mocks.attempts;

    mounted = mount(html`<${ColorPicker} x=${0} y=${0} color=${'#000000'} />`);

    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(mocks.attempts).toBe(before + 1);
  });
});
