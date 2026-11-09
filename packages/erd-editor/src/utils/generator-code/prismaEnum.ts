export type PrismaEnumMember = {
  name: string;
  /** The spelling the column stores, which a member name may not hold. */
  value: string;
};

export type PrismaEnumDefinition = {
  name: string;
  /** The enum's database name, for its map attribute; empty for none. */
  dbName: string;
  members: PrismaEnumMember[];
};

/** The members an enum comment lists: order_status: pending | paid. */
export type EnumComment = {
  storedName: string;
  values: string[];
  /** What the comment said before the enum, which stays a doc comment. */
  rest: string;
};

const MYSQL_ENUM = /^enum\s*\((.*)\)$/is;
const QUOTED_VALUE = /'((?:[^']|'')*)'/g;
const ENUM_COMMENT = /(?:^|\s)([^\s:|]+): ([^\s|]+(?: \| [^\s|]+)*)$/;
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]*$/;

/** The values of MySQL's ENUM('a','b') column type, or null for another type. */
export function parseEnumType(dataType: string): string[] | null {
  const list = MYSQL_ENUM.exec(dataType.trim())?.[1];
  if (list === undefined) return null;

  const values = [...list.matchAll(QUOTED_VALUE)].map(([, value]) =>
    value.replace(/''/g, "'")
  );

  return values.length ? values : null;
}

/**
 * The enum the Prisma importer writes at the end of a column comment where
 * the column type cannot hold it, or null for any other comment.
 */
export function parseEnumComment(comment: string): EnumComment | null {
  const match = ENUM_COMMENT.exec(comment);
  if (!match) return null;

  return {
    storedName: match[1],
    values: match[2].split(' | '),
    rest: comment.slice(0, match.index).trim(),
  };
}

/**
 * Members named by the values they store; a value no identifier spells takes
 * a name made of it and keeps the value in the member's map attribute.
 */
export function toMembers(values: string[]): PrismaEnumMember[] {
  const taken = new Set<string>();

  return values.map(value => {
    let name = IDENTIFIER.test(value)
      ? value
      : `${/^[A-Za-z]/.test(value) ? '' : 'V'}${value.replace(/[^A-Za-z0-9_]/g, '_')}`;

    for (let index = 2; taken.has(name); index += 1) {
      name = `${name.replace(/_\d+$/, '')}_${index}`;
    }
    taken.add(name);

    return { name, value };
  });
}

export function formatEnum({
  name,
  dbName,
  members,
}: PrismaEnumDefinition): string[] {
  const width = Math.max(...members.map(member => member.name.length));

  return [
    `enum ${name} {`,
    ...members.map(member =>
      member.name === member.value
        ? `  ${member.name}`
        : `  ${member.name.padEnd(width)} @map(${JSON.stringify(member.value)})`
    ),
    ...(dbName && dbName !== name
      ? ['', `  @@map(${JSON.stringify(dbName)})`]
      : []),
    '}',
  ];
}
