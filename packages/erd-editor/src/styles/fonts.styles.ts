import { css } from '@dineug/r-html';

import { CodeFontFamily, TextFontFamily } from '@/constants/fonts';

/** Global, not scoped: :host is the shadow host, which no component class matches. */
export const fontsStyle = css.global`
  :host {
    --text-font-family: ${TextFontFamily};
    --code-font-family: ${CodeFontFamily};
  }
`;
