import { html } from '@dineug/r-html';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { flush, mount, Mounted } from '@/__test-utils__/index';

// The library arrives when the gate opens, so a spec can act while it loads.
const gate = vi.hoisted(() => {
  let open!: () => void;
  const opened = new Promise<void>(resolve => {
    open = resolve;
  });
  const create = vi.fn((options: { container: HTMLElement }) => {
    const el = document.createElement('div');
    options.container.appendChild(el);
    return { destroy: vi.fn(), $root: { el } };
  });
  return { opened, open, create };
});

vi.mock('@easylogic/colorpicker', async () => {
  await gate.opened;
  return { default: { create: gate.create } };
});

const render = async () => {
  const { default: ColorPicker } =
    await import('@/components/primitives/color-picker/ColorPicker');
  return mount(html`<${ColorPicker} x=${0} y=${0} color=${'#000000'} />`);
};

let mounted: Mounted | null = null;

afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

describe('ColorPicker, while its library loads', () => {
  it('creates nothing before the library arrives, and nothing once closed', async () => {
    mounted = await render();
    await flush();

    expect(mounted.container.querySelector('.color-picker')).not.toBeNull();
    expect(gate.create).not.toHaveBeenCalled();

    mounted.unmount();
    mounted = null;
    gate.open();
    await flush();

    expect(gate.create).not.toHaveBeenCalled();
  });

  it('creates the picker for the next opening from the loaded library', async () => {
    mounted = await render();
    await flush();

    expect(gate.create).toHaveBeenCalledTimes(1);
  });
});
