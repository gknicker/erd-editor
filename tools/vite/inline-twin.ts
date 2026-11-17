import type { Plugin } from 'vite-plus';

/**
 * The modules of erd-editor's dist that ship an inline twin: the same exports
 * reached by a static import where the original loads them through import().
 */
export const ERD_EDITOR_INLINE_TWINS = [
  'components/generator-code/loadGenerators',
] as const;

const DIST_MARK = '/erd-editor/dist/';

/**
 * Swaps each module of erd-editor's dist that has an inline twin for the twin,
 * for a host that bundles its page into one file: an import() it inlines buys
 * nothing there, and Rolldown wraps every module behind it to defer their work.
 */
export function erdEditorInlineTwins(
  twins: readonly string[] = ERD_EDITOR_INLINE_TWINS
): Plugin {
  const wanted = new Set(twins.map(twin => `${twin}.js`));
  return {
    name: 'erd-editor-inline-twins',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !source.startsWith('.')) return null;
      if (!importer.replaceAll('\\', '/').includes(DIST_MARK)) return null;

      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      if (!resolved || resolved.external) return resolved;

      const id = resolved.id.replaceAll('\\', '/');
      const at = id.lastIndexOf(DIST_MARK);
      if (at === -1 || !wanted.has(id.slice(at + DIST_MARK.length))) {
        return resolved;
      }
      const found = await this.resolve(
        resolved.id.replace(/\.js$/, '.inline.js'),
        importer,
        { ...options, skipSelf: true }
      );
      if (!found) {
        this.error(`${resolved.id} ships no inline twin; rebuild erd-editor`);
      }
      return found;
    },
  };
}
