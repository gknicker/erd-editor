import { describe, expect, it } from 'vite-plus/test';

import * as styles from '@/components/primitives/sash/Sash.styles';
import { SASH_SIZE } from '@/constants/layout';

describe('Sash.styles', () => {
  it('sizes the sash by the shared thickness in the layout constants', () => {
    expect(SASH_SIZE).toBe(5);
  });

  it('exposes `sash` as a css template compiled to a class identifier', () => {
    expect(styles.sash).toBeTruthy();
    expect(String(styles.sash)).toMatch(/\S/);
  });

  it('absolutely positions the sash and defines the three type modifiers', () => {
    const source = styles.sash.strings.join('');

    expect(source).toContain('position: absolute');
    expect(source).toContain('&.vertical');
    expect(source).toContain('&.horizontal');
    expect(source).toContain('&.edge');
  });

  it('drives the modifier sizes from SASH_SIZE and picks an axis cursor', () => {
    expect(styles.sash.values).toEqual([
      SASH_SIZE,
      SASH_SIZE,
      SASH_SIZE,
      SASH_SIZE,
    ]);

    const source = styles.sash.strings.join('');
    expect(source).toContain('cursor: ew-resize');
    expect(source).toContain('cursor: ns-resize');
  });
});
