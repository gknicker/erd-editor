/// <reference types="vite/client" />
import { beforeAll, describe, expect, it, vi } from 'vite-plus/test';

const styleModules = {
  ...import.meta.glob('../**/*.styles.ts'),
  ...import.meta.glob('../**/*.style.ts'),
};

const modulePaths = Object.keys(styleModules).sort();

const SCOPE_CLASS = /\._[0-9a-z]{7}/;

function adoptedSheets(addCSSHost: (host: ShadowRoot) => void): string[][] {
  const host = document.createElement('div').attachShadow({ mode: 'open' });
  addCSSHost(host);

  return host.adoptedStyleSheets.map(sheet =>
    Array.from(sheet.cssRules).map(rule => rule.cssText)
  );
}

function adoptedRules(addCSSHost: (host: ShadowRoot) => void): string[] {
  return adoptedSheets(addCSSHost).flat();
}

/**
 * A css.global sheet is the one kind carrying no generated class anywhere in it.
 * Marker text will not do, because component sheets declare the same
 * properties.
 */
function isGlobalSheet(rules: string[]): boolean {
  return !rules.some(text => SCOPE_CLASS.test(text));
}

function selectorOf(cssText: string): string {
  return cssText.slice(0, cssText.indexOf('{')).trim();
}

/** Every rule adopted when all 57 modules share one module registry. */
let cumulative: string[] = [];
/** The css.global half of cumulative, which the bucket keeps in front. */
let globalRules: string[] = [];
/** The scoped half. */
let componentRules: string[] = [];
let sheetsOfEachKind = { global: 0, component: 0 };
/** Every rule adopted when each module is rendered alone in a fresh registry. */
let isolated = new Map<string, string[]>();

let erdEditorScope = '';
let codeBlockRootScope = '';
let codeBlockClipboardScope = '';
let colorPickerScope = '';
let uniqueScope = '';
let orderTypeScope = '';

beforeAll(async () => {
  vi.resetModules();
  const { addCSSHost } = await import('@dineug/r-html');
  for (const path of modulePaths) {
    await styleModules[path]();
  }

  const erdEditor = await import('@/components/erd-editor/ErdEditor.styles');
  const codeBlock =
    await import('@/components/primitives/code-block/CodeBlock.styles');
  const colorPicker =
    await import('@/components/primitives/color-picker/ColorPicker.styles');
  const indexesIndex =
    await import('@/components/erd/table-properties/table-properties-indexes/indexes-index/IndexesIndex.styles');
  const indexesColumn =
    await import('@/components/erd/table-properties/table-properties-indexes/indexes-column/IndexesColumn.styles');
  erdEditorScope = `.${String(erdEditor.root)}`;
  codeBlockRootScope = `.${String(codeBlock.root)}`;
  codeBlockClipboardScope = `.${String(codeBlock.clipboard)}`;
  colorPickerScope = `.${String(colorPicker.container)}`;
  uniqueScope = `.${String(indexesIndex.unique)}`;
  orderTypeScope = `.${String(indexesColumn.orderType)}`;

  const sheets = adoptedSheets(addCSSHost);
  globalRules = sheets.filter(isGlobalSheet).flat();
  componentRules = sheets.filter(rules => !isGlobalSheet(rules)).flat();
  cumulative = sheets.flat();
  sheetsOfEachKind = {
    global: sheets.filter(isGlobalSheet).length,
    component: sheets.filter(rules => !isGlobalSheet(rules)).length,
  };

  isolated = new Map();
  for (const path of modulePaths) {
    vi.resetModules();
    const { addCSSHost: addIsolatedHost } = await import('@dineug/r-html');
    await styleModules[path]();
    isolated.set(path, adoptedRules(addIsolatedHost));
  }
});

describe('selector-list scope widening', () => {
  it('scopes every segment of every selector list a scoped template emits', () => {
    // P6-51 took the one comma-prelude site with the svg scene, so this no longer
    // pins a count; the proposition it guarded is r-html's, and r-html/src/css/
    // selector.test.ts now asserts it on the compiler directly.
    const lists = componentRules.filter(text => selectorOf(text).includes(','));

    for (const list of lists) {
      for (const segment of selectorOf(list).split(',')) {
        expect(segment).toMatch(SCOPE_CLASS);
      }
    }
  });

  it('leaves the global bucket lists unscoped, which is the whole point of css.global', () => {
    // These lists are type selectors, pseudo elements, the universal selector
    // and the picker's own runtime class names. A scope class on any of them
    // would stop it matching, which is what this assertion is about.
    const lists = globalRules.filter(text => selectorOf(text).includes(','));

    expect(lists).toHaveLength(46);
    for (const list of lists) {
      expect(list).not.toMatch(SCOPE_CLASS);
    }
  });
});

describe('rule-count invariance', () => {
  it('loads 57 style modules', () => {
    // A new style module is meant to move this number, which is why it is
    // pinned rather than derived. P6-51 took six, the marker one more, the
    // chrome gave four back, and the dead DOM sash and an empty module took two.
    expect(modulePaths).toHaveLength(57);
  });

  it('adopts 621 rules, none of them a duplicate', () => {
    // Pinned rather than derived, so a rule added or lost anywhere in the
    // package has to be accounted for here.
    expect(cumulative).toHaveLength(621);
    expect(new Set(cumulative).size).toBe(621);
  });

  it('splits into 327 global rules ahead of 294 component rules', () => {
    // A shadow root applies its own styleSheets before its adoptedStyleSheets,
    // so the only thing keeping the reset ahead of the components is the bucket,
    // which is what this asserts positionally. Both halves move independently.
    expect(sheetsOfEachKind).toEqual({ global: 5, component: 163 });
    expect(globalRules).toHaveLength(327);
    expect(componentRules).toHaveLength(294);
    expect(cumulative).toEqual([...globalRules, ...componentRules]);
  });

  it('drops no rule when the modules are loaded together', () => {
    const union = new Set<string>();
    for (const rules of isolated.values()) {
      rules.forEach(rule => union.add(rule));
    }
    const cumulativeSet = new Set(cumulative);
    const droppedByLoadingTogether = [...union].filter(
      rule => !cumulativeSet.has(rule)
    );

    // Identifiers are content hashes now, so a rule's text is the same whether its module is
    // rendered alone or with the other 56 — which is exactly what makes this comparison mean
    // "nothing was lost to dedup" rather than "the class names differ".
    expect(union.size).toBe(621);
    expect(droppedByLoadingTogether).toEqual([]);
  });

  it('gives two templates with the same whole text one class and one rule', () => {
    // The identifier hashes the whole canonical text, so two modules writing
    // one template share a class and a rule; one root under different nested
    // rules hashes apart, which r-html's compileToRules spec pins.
    expect(uniqueScope).toBe(orderTypeScope);
    expect(
      cumulative.filter(rule => rule === `${uniqueScope} { cursor: pointer; }`)
    ).toHaveLength(1);
  });
});

describe('empty rules', () => {
  it('discards the two rules whose bodies were empty, keeping their children', () => {
    // ErdEditor.styles.ts:17 &.none-focus and CodeBlock.styles.ts:59 &:hover hold nested
    // rules and no declarations of their own. The old pipeline emitted .S.none-focus {  } and
    // .S:hover {  }; the compiler discards a rule with no declarations.
    expect(cumulative.filter(text => /\{\s*\}$/.test(text))).toEqual([]);

    expect(cumulative).toContain(
      `${erdEditorScope}.none-focus div[data-focus-border] { border-color: var(--placeholder) !important; }`
    );
    expect(cumulative).toContain(
      `${erdEditorScope}.none-focus div[data-focus-border-bottom] { border-bottom-color: var(--placeholder) !important; }`
    );
    expect(cumulative).toContain(
      `${erdEditorScope}.none-focus input[data-focus-border-bottom] { border-bottom-color: var(--placeholder) !important; }`
    );
    expect(cumulative).toContain(
      `${codeBlockRootScope}:hover ${codeBlockClipboardScope} { opacity: 1; }`
    );
  });
});
