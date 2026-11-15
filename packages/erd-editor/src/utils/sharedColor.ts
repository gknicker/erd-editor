import {
  gold,
  grass,
  iris,
  pink,
  plum,
  purple,
  teal,
  tomato,
} from '@radix-ui/colors';

/**
 * Step 9 of eight light scales, in the order a hash picks from. Imported scale
 * by scale rather than read off the theme's Palette, whose module evaluates the
 * whole palette as it loads, in the export worker too, which draws these.
 */
export const SharedColors: ReadonlyArray<string> = [
  tomato.tomato9,
  gold.gold9,
  grass.grass9,
  teal.teal9,
  iris.iris9,
  purple.purple9,
  plum.plum9,
  pink.pink9,
];

export function toSharedColor(id: string): string {
  let hash = 0;

  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }

  return SharedColors[Math.abs(hash) % SharedColors.length];
}
