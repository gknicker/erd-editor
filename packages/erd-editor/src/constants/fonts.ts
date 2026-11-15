/*
 * The font stacks, apart from the stylesheet that declares them: a module with
 * a css template evaluates it on load, so a string read from it brings the css
 * compiler into every realm that reads one, the export worker's included.
 */

export const TextFontFamily =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Open Sans', system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'" as const;

export const CodeFontFamily =
  "'Menlo', 'Consolas', 'Bitstream Vera Sans Mono', monospace, 'Apple Color Emoji', 'Segoe UI Emoji'" as const;
