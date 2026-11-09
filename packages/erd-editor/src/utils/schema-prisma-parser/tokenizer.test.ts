import { describe, expect, it } from 'vite-plus/test';

import {
  Token,
  tokenize,
  TokenKind,
} from '@/utils/schema-prisma-parser/tokenizer';

const shape = (source: string): Array<[number, string]> =>
  tokenize(source).map((token: Token) => [token.kind, token.value]);

const values = (source: string): string[] =>
  tokenize(source)
    .filter(token => token.kind !== TokenKind.newline)
    .map(token => token.value);

const breaks = (source: string): number =>
  tokenize(source).filter(token => token.kind === TokenKind.newline).length;

describe('schema-prisma-parser/tokenizer', () => {
  it('reads nothing from an empty source', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('reads a bare identifier', () => {
    expect(shape('model')).toEqual([[TokenKind.identifier, 'model']]);
  });

  it('reads an identifier holding digits and underscores', () => {
    expect(values('user_2 _leading')).toEqual(['user_2', '_leading']);
  });

  it('reads a non-ASCII identifier', () => {
    expect(shape('사용자')).toEqual([[TokenKind.identifier, '사용자']]);
  });

  it('drops spaces and tabs between tokens', () => {
    expect(values('a \t b')).toEqual(['a', 'b']);
  });

  it('records the line each token starts on', () => {
    expect(tokenize('a\n\nb').map(token => token.line)).toEqual([1, 1, 2, 3]);
  });

  describe('punctuation', () => {
    it('reads each mark as its own token', () => {
      expect(shape('{}()[],:=?.')).toEqual(
        ['{', '}', '(', ')', '[', ']', ',', ':', '=', '?', '.'].map(mark => [
          TokenKind.punctuation,
          mark,
        ])
      );
    });

    it('reads @ and @@ apart, so a field attribute and a block one differ', () => {
      expect(shape('@id @@id')).toEqual([
        [TokenKind.punctuation, '@'],
        [TokenKind.identifier, 'id'],
        [TokenKind.punctuation, '@@'],
        [TokenKind.identifier, 'id'],
      ]);
    });

    it('reads a native type as its prefix, a dot and its name', () => {
      expect(values('@db.VarChar(255)')).toEqual([
        '@',
        'db',
        '.',
        'VarChar',
        '(',
        '255',
        ')',
      ]);
    });
  });

  describe('numbers', () => {
    it('reads an integer', () => {
      expect(shape('42')).toEqual([[TokenKind.number, '42']]);
    });

    it('reads a decimal', () => {
      expect(shape('2.5')).toEqual([[TokenKind.number, '2.5']]);
    });

    it('reads a negative number as one token', () => {
      expect(shape('-1.5')).toEqual([[TokenKind.number, '-1.5']]);
    });

    it('leaves a dash no digit follows as punctuation', () => {
      expect(shape('- a')).toEqual([
        [TokenKind.punctuation, '-'],
        [TokenKind.identifier, 'a'],
      ]);
    });

    it('leaves a dot no digit follows outside the number', () => {
      expect(values('1.a')).toEqual(['1', '.', 'a']);
      expect(values('1.')).toEqual(['1', '.']);
    });
  });

  describe('strings', () => {
    it('reads a double-quoted string without its quotes', () => {
      expect(shape('"draft"')).toEqual([[TokenKind.string, 'draft']]);
    });

    it('reads an empty string', () => {
      expect(shape('""')).toEqual([[TokenKind.string, '']]);
    });

    it('keeps a single quote, which is no delimiter in Prisma', () => {
      expect(values(`"'x'::text"`)).toEqual(["'x'::text"]);
    });

    it('unescapes a quote and a backslash', () => {
      expect(values('"a \\"b\\" \\\\ c"')).toEqual(['a "b" \\ c']);
    });

    it('unescapes the control characters', () => {
      expect(values('"\\n\\r\\t\\b\\f"')).toEqual(['\n\r\t\b\f']);
    });

    it('unescapes a four-digit unicode escape', () => {
      expect(values('"\\u0041\\uAC00"')).toEqual(['A가']);
    });

    it('keeps the character after any other backslash', () => {
      expect(values('"x\\/y\\q"')).toEqual(['x/yq']);
    });

    it('keeps a u with fewer than four hex digits after it', () => {
      expect(values('"\\u00G"')).toEqual(['u00G']);
    });

    it('ends an unterminated string at its line break', () => {
      expect(shape('"open\nnext')).toEqual([
        [TokenKind.string, 'open'],
        [TokenKind.newline, '\n'],
        [TokenKind.identifier, 'next'],
      ]);
    });

    it('ends an unterminated string at a backslash closing the line', () => {
      expect(shape('"open\\\nnext')).toEqual([
        [TokenKind.string, 'open\\'],
        [TokenKind.newline, '\n'],
        [TokenKind.identifier, 'next'],
      ]);
    });

    it('ends an unterminated string at the end of the source', () => {
      expect(shape('"open\\')).toEqual([[TokenKind.string, 'open\\']]);
    });
  });

  describe('line breaks', () => {
    it('emits one token per line break', () => {
      expect(shape('a\nb')).toEqual([
        [TokenKind.identifier, 'a'],
        [TokenKind.newline, '\n'],
        [TokenKind.identifier, 'b'],
      ]);
    });

    it('reads CRLF and a lone CR as one break each', () => {
      expect(breaks('a\r\nb\rc')).toBe(2);
    });

    it('emits a break for a blank line, which is how the parser sees one', () => {
      expect(breaks('a\n\nb')).toBe(2);
    });

    it('keeps a break inside braces, which delimit a line-based body', () => {
      expect(breaks('{\na\n}')).toBe(2);
    });

    it('suppresses a break inside a bracket', () => {
      expect(breaks('[a,\nb]')).toBe(0);
    });

    it('suppresses a break inside a parenthesis', () => {
      expect(breaks('(a,\nb)')).toBe(0);
    });

    it('resumes emitting breaks once the bracket closes', () => {
      expect(breaks('[a,\nb]\nc')).toBe(1);
    });

    it('tolerates a stray closing bracket', () => {
      expect(breaks(')\na')).toBe(1);
    });

    it('closes a bracket left open at the next brace', () => {
      expect(breaks('a(\nb\n}\nc')).toBe(1);
    });
  });

  describe('comments', () => {
    it('drops a line comment and keeps the break of its line', () => {
      expect(shape('a // note\nb')).toEqual([
        [TokenKind.identifier, 'a'],
        [TokenKind.newline, '\n'],
        [TokenKind.identifier, 'b'],
      ]);
    });

    it('emits no break for a line holding only a comment', () => {
      expect(shape('a\n// note\nb')).toEqual([
        [TokenKind.identifier, 'a'],
        [TokenKind.newline, '\n'],
        [TokenKind.identifier, 'b'],
      ]);
    });

    it('reads a doc comment without its slashes and leading space', () => {
      expect(shape('///  A user')).toEqual([[TokenKind.docComment, 'A user']]);
    });

    it('keeps the trailing space of a doc comment, as Prisma does', () => {
      expect(values('/// x  ')).toEqual(['x  ']);
    });

    it('reads an empty doc comment', () => {
      expect(shape('///')).toEqual([[TokenKind.docComment, '']]);
    });

    it('reads a fourth slash as the first character of the doc', () => {
      expect(values('//// x')).toEqual(['/ x']);
    });

    it('ends a doc comment at a CR', () => {
      expect(shape('/// doc\r\na')).toEqual([
        [TokenKind.docComment, 'doc'],
        [TokenKind.newline, '\n'],
        [TokenKind.identifier, 'a'],
      ]);
    });

    it('reads a doc comment trailing other tokens on its line', () => {
      expect(shape('a /// doc')).toEqual([
        [TokenKind.identifier, 'a'],
        [TokenKind.docComment, 'doc'],
      ]);
    });

    it('drops a doc comment inside a bracket, where nothing it documents is', () => {
      expect(values('(/// doc\na)')).toEqual(['(', 'a', ')']);
    });

    it('drops a block comment within a line', () => {
      expect(values('a /* note */ b')).toEqual(['a', 'b']);
    });

    it('emits no break for lines a block comment fills', () => {
      expect(shape('a\n/*\n one\n two\n*/\nb')).toEqual([
        [TokenKind.identifier, 'a'],
        [TokenKind.newline, '\n'],
        [TokenKind.identifier, 'b'],
      ]);
    });

    it('ends the line a block comment opens after a token on', () => {
      expect(shape('a /* one\ntwo */ b')).toEqual([
        [TokenKind.identifier, 'a'],
        [TokenKind.newline, '\n'],
        [TokenKind.identifier, 'b'],
      ]);
    });

    it('counts the lines a block comment spans, CR ones included', () => {
      expect(tokenize('/* a\r\nb\rc */ x')[0].line).toBe(3);
    });

    it('takes the rest of the source for an unterminated block comment', () => {
      expect(values('a /* open\nb')).toEqual(['a']);
    });
  });
});
