import { describe, expect, it } from 'vite-plus/test';

import { loadGenerators } from '@/components/generator-code/loadGenerators.inline';
import * as generatorCode from '@/utils/generator-code';

describe('loadGenerators, as the umd build has it', () => {
  it('hands over the generators it imported with the rest of the file', async () => {
    await expect(loadGenerators()).resolves.toBe(generatorCode);
  });
});
