export type Generators = typeof import('@/utils/generator-code');

let generators: Promise<Generators> | null = null;

/**
 * The code generators, loaded when the panel first opens; a failed load is not
 * kept. The umd build aliases in loadGenerators.inline.ts: one file has nothing
 * to load later and would only pay the lazy boundary's wrappers.
 */
export function loadGenerators(): Promise<Generators> {
  generators ??= import('@/utils/generator-code').catch(error => {
    generators = null;
    throw error;
  });

  return generators;
}
