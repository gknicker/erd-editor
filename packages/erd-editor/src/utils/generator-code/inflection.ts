import { upperFirst } from 'es-toolkit';

/** Plural to singular, for the irregular nouns a schema commonly names. */
const IRREGULAR_PLURALS: Record<string, string> = {
  aliases: 'alias',
  analyses: 'analysis',
  buses: 'bus',
  children: 'child',
  criteria: 'criterion',
  feet: 'foot',
  geese: 'goose',
  heroes: 'hero',
  indices: 'index',
  leaves: 'leaf',
  matrices: 'matrix',
  men: 'man',
  mice: 'mouse',
  people: 'person',
  quizzes: 'quiz',
  statuses: 'status',
  teeth: 'tooth',
  vertices: 'vertex',
  women: 'woman',
};

const IRREGULAR_SINGULARS: Record<string, string> = Object.fromEntries(
  Object.entries(IRREGULAR_PLURALS).map(([plural, singular]) => [
    singular,
    plural,
  ])
);

/** Words that name one thing and many alike. */
const UNCOUNTABLE = new Set([
  'data',
  'equipment',
  'feedback',
  'information',
  'media',
  'metadata',
  'news',
  'series',
  'software',
  'species',
  'staff',
]);

/** Singulars ending in s that no plural rule may shorten. */
const SINGULAR_WITH_S = new Set([
  'alias',
  'atlas',
  'bias',
  'canvas',
  'chaos',
  'gas',
  'lens',
]);

/** Words in ies or ches that are a singular with a plain s on the end. */
const PLAIN_S = new Set([
  'caches',
  'calories',
  'cookies',
  'headaches',
  'lies',
  'movies',
  'niches',
  'pies',
  'rookies',
  'ties',
  'zombies',
]);

/** The last word of an identifier: Lines in OrderLines or order_lines' lines. */
const LAST_WORD = /([A-Z]?[a-z]+)$/;

/**
 * The singular of an identifier's last word, for the regular English patterns
 * and the common irregular nouns only; any other word comes back unchanged,
 * so a generator backs the name with the real one, as Prisma's map does.
 */
export function singularize(name: string): string {
  return replaceLastWord(name, singularizeWord);
}

/** The plural of an identifier's last word, under the same rules. */
export function pluralize(name: string): string {
  return replaceLastWord(name, pluralizeWord);
}

function replaceLastWord(
  name: string,
  inflect: (word: string) => string
): string {
  const match = LAST_WORD.exec(name);
  if (!match) return name;

  const word = match[1];
  const inflected = inflect(word.toLowerCase());
  const cased =
    word[0] === word[0].toUpperCase() ? upperFirst(inflected) : inflected;

  return `${name.slice(0, match.index)}${cased}`;
}

function singularizeWord(word: string): string {
  if (UNCOUNTABLE.has(word) || SINGULAR_WITH_S.has(word)) return word;
  if (Object.hasOwn(IRREGULAR_PLURALS, word)) return IRREGULAR_PLURALS[word];
  if (/(ss|us|is)$/.test(word)) return word;
  if (PLAIN_S.has(word)) return word.slice(0, -1);
  if (/[^aeiou]ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/(sses|xes|zzes|ches|shes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);

  return word;
}

function pluralizeWord(word: string): string {
  if (UNCOUNTABLE.has(word)) return word;
  if (Object.hasOwn(IRREGULAR_SINGULARS, word)) {
    return IRREGULAR_SINGULARS[word];
  }
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;

  return `${word}s`;
}
