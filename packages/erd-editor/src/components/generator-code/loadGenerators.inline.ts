import * as generatorCode from '@/utils/generator-code';

import type { Generators } from './loadGenerators';

/**
 * The umd build's loadGenerators, aliased in by vite.umd.config.ts: the script
 * tag file carries the generators anyway, so they are imported as they are.
 */
export function loadGenerators(): Promise<Generators> {
  return Promise.resolve(generatorCode);
}
