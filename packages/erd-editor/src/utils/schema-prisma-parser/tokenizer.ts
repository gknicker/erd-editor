export const TokenKind = {
  identifier: 1,
  string: 2,
  number: 3,
  punctuation: 4,
  docComment: 5,
  newline: 6,
} as const;

export type Token = {
  kind: number;
  value: string;
  line: number;
};

const SPACE = /[ \t\f\v]/;
const DIGIT = /[0-9]/;
const HEX4 = /^[0-9A-Fa-f]{4}$/;
const IDENTIFIER_START = /[A-Za-z_\u0080-\uffff]/;
const IDENTIFIER_PART = /[0-9A-Za-z_\u0080-\uffff]/;
const LEADING_SPACE = /^\s+/;
const ESCAPE_MAP: Record<string, string> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
};

/**
 * A line holding nothing but a plain comment emits no line break, so the
 * parser can tell a blank line, which detaches a doc comment, from a comment.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  // Only [ and ( suppress a line break: a block body is line-delimited, and
  // an argument list Prisma reads on one line is read whole here too.
  let depth = 0;
  let lineHasToken = false;
  let lineHasComment = false;

  const push = (kind: number, value: string) => {
    tokens.push({ kind, value, line });
    lineHasToken = true;
  };

  const breakLine = () => {
    if (depth === 0 && (lineHasToken || !lineHasComment)) {
      tokens.push({ kind: TokenKind.newline, value: '\n', line });
    }
    line += 1;
    lineHasToken = false;
    lineHasComment = false;
  };

  while (index < source.length) {
    const char = source[index];

    if (SPACE.test(char)) {
      index += 1;
      continue;
    }

    if (char === '\r' || char === '\n') {
      index += char === '\r' && source[index + 1] === '\n' ? 2 : 1;
      breakLine();
      continue;
    }

    if (source.startsWith('//', index)) {
      const end = findLineEnd(source, index);
      if (source.startsWith('///', index) && depth === 0) {
        push(
          TokenKind.docComment,
          source.slice(index + 3, end).replace(LEADING_SPACE, '')
        );
      } else {
        lineHasComment = true;
      }
      index = end;
      continue;
    }

    if (source.startsWith('/*', index)) {
      const close = source.indexOf('*/', index + 2);
      const end = close === -1 ? source.length : close + 2;

      lineHasComment = true;
      for (let cursor = index; cursor < end; cursor += 1) {
        const inner = source[cursor];
        if (inner === '\n' || (inner === '\r' && source[cursor + 1] !== '\n')) {
          breakLine();
          lineHasComment = true;
        }
      }

      index = end;
      continue;
    }

    if (char === '"') {
      const result = readString(source, index + 1);
      push(TokenKind.string, result.value);
      index = result.index;
      continue;
    }

    if (
      DIGIT.test(char) ||
      (char === '-' && DIGIT.test(source[index + 1] ?? ''))
    ) {
      const end = readNumber(source, index + 1);
      push(TokenKind.number, source.slice(index, end));
      index = end;
      continue;
    }

    if (IDENTIFIER_START.test(char)) {
      let end = index + 1;
      while (end < source.length && IDENTIFIER_PART.test(source[end])) {
        end += 1;
      }
      push(TokenKind.identifier, source.slice(index, end));
      index = end;
      continue;
    }

    if (char === '@' && source[index + 1] === '@') {
      push(TokenKind.punctuation, '@@');
      index += 2;
      continue;
    }

    if (char === '[' || char === '(') {
      depth += 1;
    } else if (char === ']' || char === ')') {
      depth = Math.max(0, depth - 1);
    } else if (char === '{' || char === '}') {
      // No Prisma value holds a brace, so one ends any bracket left open
      // rather than letting it swallow every line break after it.
      depth = 0;
    }

    push(TokenKind.punctuation, char);
    index += 1;
  }

  return tokens;
}

function findLineEnd(source: string, start: number): number {
  let end = start;
  while (end < source.length && source[end] !== '\n' && source[end] !== '\r') {
    end += 1;
  }
  return end;
}

function readNumber(source: string, start: number): number {
  let end = start;
  while (end < source.length && DIGIT.test(source[end])) {
    end += 1;
  }
  if (source[end] === '.' && DIGIT.test(source[end + 1] ?? '')) {
    end += 1;
    while (end < source.length && DIGIT.test(source[end])) {
      end += 1;
    }
  }
  return end;
}

/**
 * Prisma strings never span lines, so an unterminated one ends at the line
 * break and only that line degrades.
 */
function readString(
  source: string,
  start: number
): { value: string; index: number } {
  const buffer: string[] = [];
  let index = start;

  while (index < source.length) {
    const char = source[index];

    if (char === '"') {
      return { value: buffer.join(''), index: index + 1 };
    }

    if (char === '\n' || char === '\r') {
      break;
    }

    const next = source[index + 1] ?? '';

    if (char === '\\' && next !== '' && next !== '\n' && next !== '\r') {
      const hex = source.slice(index + 2, index + 6);

      if (next === 'u' && HEX4.test(hex)) {
        buffer.push(String.fromCharCode(parseInt(hex, 16)));
        index += 6;
        continue;
      }

      buffer.push(ESCAPE_MAP[next] ?? next);
      index += 2;
      continue;
    }

    buffer.push(char);
    index += 1;
  }

  return { value: buffer.join(''), index };
}
