import githubDark from '@shikijs/themes/github-dark';
import githubLight from '@shikijs/themes/github-light';
import {
  createHighlighterCore,
  type HighlighterCore,
  type LanguageRegistration,
} from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

import type { Lang } from '@/constants/language';

type Grammar = () => Promise<{ default: LanguageRegistration[] }>;

/**
 * What constants/language.ts maps a Language onto, each imported the first
 * time it is highlighted, with what it embeds: graphql brings javascript,
 * typescript, jsx and tsx. A panel shows one language; the rest wait.
 */
const GRAMMARS = new Map<Lang, Grammar>([
  ['csharp', () => import('@shikijs/langs/csharp')],
  ['go', () => import('@shikijs/langs/go')],
  ['graphql', () => import('@shikijs/langs/graphql')],
  ['java', () => import('@shikijs/langs/java')],
  ['kotlin', () => import('@shikijs/langs/kotlin')],
  ['python', () => import('@shikijs/langs/python')],
  ['scala', () => import('@shikijs/langs/scala')],
  ['sql', () => import('@shikijs/langs/sql')],
  ['typescript', () => import('@shikijs/langs/typescript')],
]);

const themeMap = {
  dark: 'github-dark',
  light: 'github-light',
} as const;

function getThemeKey(theme?: string): 'dark' | 'light' {
  return theme === 'dark' || theme === 'light' ? theme : 'dark';
}

/**
 * Shiki behind the one method the code panels call, in the shared worker only.
 * It starts with the themes and no grammar, and loads each language once.
 *
 * @example
 * const html = await new ShikiService().codeToHtml('select 1', { lang: 'sql' });
 */
export class ShikiService {
  private highlighter: Promise<HighlighterCore>;
  /** One load per language, so two panels asking at once load it once. */
  private grammars = new Map<Lang, Promise<void>>();

  constructor() {
    this.highlighter = createHighlighterCore({
      themes: [githubDark, githubLight],
      langs: [],
      // Plain javascript rather than oniguruma, so no host needs wasm-unsafe-eval
      // in its policy; forgiving turns a grammar the engine cannot transpile into
      // missing colour instead of a throw.
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
  }

  async codeToHtml(
    code: string,
    { lang, theme }: { lang: Lang; theme?: 'dark' | 'light' }
  ): Promise<string> {
    const highlighter = await this.highlighter;
    await this.loadGrammar(highlighter, lang);

    return highlighter.codeToHtml(code, {
      lang,
      theme: themeMap[getThemeKey(theme)],
    });
  }

  /**
   * A load that fails is not kept, so the next request asks again. A language
   * with no grammar loads nothing, and codeToHtml rejects it as shiki does.
   */
  private loadGrammar(highlighter: HighlighterCore, lang: Lang): Promise<void> {
    const grammar = GRAMMARS.get(lang);
    if (!grammar) return Promise.resolve();

    let loading = this.grammars.get(lang);
    if (!loading) {
      loading = highlighter.loadLanguage(grammar).catch(error => {
        this.grammars.delete(lang);
        throw error;
      });
      this.grammars.set(lang, loading);
    }

    return loading;
  }
}
