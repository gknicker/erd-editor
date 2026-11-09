import { query } from '@dineug/erd-editor-schema';
import { lowerFirst, upperFirst } from 'es-toolkit';

import {
  ColumnOption,
  Database,
  NameCase,
  OrderType,
} from '@/constants/schema';
import { RootState } from '@/engine/state';
import { Column, Relationship, Table } from '@/internal-types';
import { bHas } from '@/utils/bit';
import { orderByNameASC } from '@/utils/schema-sql/utils';

import { pluralize, singularize } from './inflection';
import {
  formatEnum,
  parseEnumComment,
  parseEnumType,
  PrismaEnumDefinition,
  toMembers,
} from './prismaEnum';
import { resolvePrismaType } from './prismaType';
import {
  FormatTableOptions,
  getNameCase,
  hasNRelationship,
  hasOneRelationship,
} from './utils';

const providers: Record<number, string> = {
  [Database.MariaDB]: 'mysql',
  [Database.MSSQL]: 'sqlserver',
  [Database.MySQL]: 'mysql',
  [Database.PostgreSQL]: 'postgresql',
  [Database.SQLite]: 'sqlite',
};

const NUMERIC_LITERAL = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/;
const BOOLEAN_LITERAL = /^(true|false)$/i;
const QUOTED_LITERAL = /^'([^']|'')*'$/;
const ESCAPED_QUOTE = /''/g;
const ARRAY_LITERAL = /^ARRAY\[(.+)\]$/i;
const CURRENT_TIMESTAMP = /^(current_timestamp(\([0-9]*\))?|now\(\))$/i;
const STRING_ESCAPE = /["\\\n\r]/g;
const ESCAPE_MAP: Record<string, string> = {
  '\n': '\\n',
  '\r': '\\r',
};
const INTEGER_SCALARS = ['Int', 'BigInt'];
/** Prisma's own type names, which no model may take. */
const RESERVED_MODEL_NAMES = new Set([
  'String',
  'Boolean',
  'Int',
  'BigInt',
  'Float',
  'Decimal',
  'DateTime',
  'Json',
  'Bytes',
  'Unsupported',
]);
/** authorId, author_id or authorID, whose stem names the relation field. */
const ID_SUFFIX = /^(.+?)(?:_id|_ID|Id|ID)$/;
/** _PostToTag or _Tagging, the join table of an implicit many-to-many. */
const JOIN_TABLE = /^_([A-Za-z][A-Za-z0-9_]*)$/;
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]*$/;
const NUMBER_SCALARS = ['Int', 'BigInt', 'Float', 'Decimal'];
/**
 * MySQL's text and blob types, which it indexes only by a prefix length or
 * as FULLTEXT; the diagram keeps neither, so such an index is left out.
 */
const MYSQL_UNINDEXABLE = new Set([
  'TinyText',
  'Text',
  'MediumText',
  'LongText',
  'TinyBlob',
  'Blob',
  'MediumBlob',
  'LongBlob',
]);

type Field = {
  name: string;
  /** A Prisma scalar, Unsupported("...") or the name of an enum. */
  scalar: string;
  enum?: PrismaEnumDefinition;
  /** The column comment, less an enum's members the enum now holds. */
  comment: string;
  /** The native type attribute without its prefix, or empty. */
  native: string;
  list: boolean;
  required: boolean;
};

/** One side of a relationship: the field it adds to the model on that side. */
type RelationField = {
  name: string;
  type: string;
  attribute: string;
};

type PrismaContext = {
  models: Map<string, string>;
  enums: Map<string, PrismaEnumDefinition>;
  /** Join tables Prisma's implicit many-to-many stands for, written as none. */
  joinTables: Set<string>;
  fields: Map<string, Field>;
  relationFields: Map<string, RelationField[]>;
};

export function createCode(state: RootState): string {
  const {
    doc: { tableIds },
    settings: { database },
    collections,
  } = state;
  const tables = query(collections)
    .collection('tableEntities')
    .selectByIds(tableIds)
    .sort(orderByNameASC);

  if (tables.length === 0) {
    return '';
  }

  const buffer: string[] = [''];
  const context = createPrismaContext(state);
  const provider = providers[database];

  if (provider) {
    buffer.push('datasource db {');
    buffer.push(`  provider = ${quoteString(provider)}`);
    buffer.push('}');
    buffer.push('');
  }

  [...context.enums.values()]
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .forEach(definition => {
      buffer.push(...formatEnum(definition), '');
    });

  tables.forEach(table => {
    if (context.joinTables.has(table.id)) return;

    formatModel(state, { buffer, table }, context);
    buffer.push('');
  });

  return buffer.join('\n');
}

export function formatTable(
  state: RootState,
  { buffer, table }: FormatTableOptions
) {
  formatModel(state, { buffer, table }, createPrismaContext(state, table));
}

function formatModel(
  state: RootState,
  { buffer, table }: FormatTableOptions,
  context: PrismaContext
) {
  const { collections } = state;
  const modelName = context.models.get(table.id) as string;
  const columns = query(collections)
    .collection('tableColumnEntities')
    .selectByIds(table.columnIds);
  const primaryKeys = columns.filter(column =>
    bHas(column.options, ColumnOption.primaryKey)
  );
  const rows: Array<{ comment: string; cells: string[] }> = [];

  columns.forEach(column => {
    const field = context.fields.get(column.id) as Field;
    const attributes: string[] = [];

    if (primaryKeys.length === 1 && primaryKeys[0] === column) {
      attributes.push('@id');
    }

    const defaultValue = formatDefault(column, field);
    if (defaultValue) {
      attributes.push(`@default(${defaultValue})`);
    }
    if (
      bHas(column.options, ColumnOption.unique) &&
      !attributes.includes('@id') &&
      !isUnindexable(state, field)
    ) {
      attributes.push('@unique');
    }
    if (field.name !== column.name) {
      attributes.push(`@map(${quoteString(column.name)})`);
    }
    if (field.native) {
      attributes.push(`@db.${field.native}`);
    }

    rows.push({
      comment: field.comment,
      cells: [field.name, typeOf(field), attributes.join(' ')],
    });
  });

  (context.relationFields.get(table.id) ?? []).forEach(relation => {
    rows.push({
      comment: '',
      cells: [relation.name, relation.type, relation.attribute],
    });
  });

  const blockAttributes: string[] = [];

  if (primaryKeys.length > 1) {
    blockAttributes.push(
      `@@id([${primaryKeys.map(column => context.fields.get(column.id)?.name).join(', ')}])`
    );
  }
  blockAttributes.push(...formatIndexes(state, table, context));
  if (modelName !== table.name) {
    blockAttributes.push(`@@map(${quoteString(table.name)})`);
  }

  pushComment(buffer, '', table.comment);
  buffer.push(`model ${modelName} {`);
  formatRows(buffer, rows);
  if (blockAttributes.length !== 0) {
    if (rows.length !== 0) {
      buffer.push('');
    }
    blockAttributes.forEach(line => buffer.push(`  ${line}`));
  }
  buffer.push('}');
}

/** Lines the fields up in columns, as prisma format does. */
function formatRows(
  buffer: string[],
  rows: Array<{ comment: string; cells: string[] }>
) {
  const widths = [0, 1].map(index =>
    Math.max(0, ...rows.map(row => row.cells[index].length))
  );

  rows.forEach(({ comment, cells }) => {
    pushComment(buffer, '  ', comment);
    buffer.push(
      `  ${cells
        .map((cell, index) => (index < 2 ? cell.padEnd(widths[index]) : cell))
        .join(' ')}`.trimEnd()
    );
  });
}

function pushComment(buffer: string[], indent: string, comment: string) {
  if (comment.trim() === '') {
    return;
  }

  comment
    .split(/\r\n|\r|\n/)
    .forEach(line => buffer.push(`${indent}/// ${line}`.trimEnd()));
}

function formatIndexes(
  state: RootState,
  table: Table,
  context: PrismaContext
): string[] {
  const {
    doc: { indexIds },
    collections,
  } = state;
  const columnCollection = query(collections).collection('tableColumnEntities');
  const indexColumnCollection = query(collections).collection(
    'indexColumnEntities'
  );
  const lines: string[] = [];

  query(collections)
    .collection('indexEntities')
    .selectByIds(indexIds)
    .filter(index => index.tableId === table.id)
    .forEach(index => {
      let unindexable = false;
      const fields = indexColumnCollection
        .selectByIds(index.indexColumnIds)
        .flatMap(indexColumn => {
          const column = columnCollection.selectById(indexColumn.columnId);
          const field = column ? context.fields.get(column.id) : undefined;
          if (!column || column.tableId !== table.id || !field) {
            return [];
          }
          unindexable ||= isUnindexable(state, field);

          return [
            indexColumn.orderType === OrderType.DESC
              ? `${field.name}(sort: Desc)`
              : field.name,
          ];
        });

      if (fields.length === 0 || unindexable) {
        return;
      }

      const name =
        index.name.trim() === '' ? '' : `, map: ${quoteString(index.name)}`;
      lines.push(
        `@@${index.unique ? 'unique' : 'index'}([${fields.join(', ')}]${name})`
      );
    });

  return lines;
}

/** Names every table's model and fields; a table the document lacks too. */
function createPrismaContext(state: RootState, extra?: Table): PrismaContext {
  const {
    doc: { tableIds },
    settings: { tableNameCase, columnNameCase, database },
    collections,
  } = state;
  const tables = query(collections)
    .collection('tableEntities')
    .selectByIds(tableIds);

  if (extra && !tables.includes(extra)) {
    tables.push(extra);
  }
  const context: PrismaContext = {
    models: new Map(),
    enums: new Map(),
    joinTables: new Set(),
    fields: new Map(),
    relationFields: new Map(),
  };

  const casedNames = new Map(
    tables.map(table => [table.id, getNameCase(table.name, tableNameCase)])
  );
  const casedTaken = new Set(casedNames.values());
  const modelsTaken = new Set<string>();

  tables.forEach(table => {
    const cased = casedNames.get(table.id) as string;
    const singular =
      tableNameCase === NameCase.none ? cased : singularize(cased);
    // A singular another model or Prisma itself holds keeps the name as it
    // was cased; the map attribute names the table either way.
    const name =
      singular !== cased &&
      (casedTaken.has(singular) ||
        modelsTaken.has(singular) ||
        RESERVED_MODEL_NAMES.has(singular))
        ? cased
        : singular;

    modelsTaken.add(name);
    context.models.set(table.id, name);
  });

  tables.forEach(table => {
    const model = context.models.get(table.id) as string;

    query(collections)
      .collection('tableColumnEntities')
      .selectByIds(table.columnIds)
      .forEach(column => {
        const field: Field = {
          name: getNameCase(column.name, columnNameCase),
          ...resolvePrismaType(column.dataType, database),
          comment: column.comment,
          required:
            bHas(column.options, ColumnOption.notNull) ||
            bHas(column.options, ColumnOption.primaryKey),
        };

        applyEnum(state, context, model, column, field);
        context.fields.set(column.id, field);
      });
  });

  addImplicitManyToMany(state, context, tables);
  addRelationFields(state, context);

  return context;
}

/**
 * Makes a column an enum by the conventions the Prisma importer writes: the
 * values of MySQL's ENUM type, named after the model and field, or the enum a
 * string column's comment ends in, named after the enum it names.
 */
function applyEnum(
  { settings: { database, tableNameCase } }: RootState,
  context: PrismaContext,
  model: string,
  column: Column,
  field: Field
) {
  const provider = providers[database];

  if (provider === 'mysql') {
    const values = parseEnumType(column.dataType);
    if (values) {
      registerEnum(
        context,
        field,
        `${model}${upperFirst(field.name)}`,
        '',
        values
      );
    }
    return;
  }

  if (
    (provider !== 'postgresql' && provider !== 'sqlite') ||
    field.scalar !== 'String' ||
    field.native !== ''
  ) {
    return;
  }

  const parsed = parseEnumComment(column.comment);
  if (
    parsed &&
    registerEnum(
      context,
      field,
      getNameCase(parsed.storedName, tableNameCase),
      parsed.storedName,
      parsed.values
    )
  ) {
    field.comment = parsed.rest;
  }
}

/**
 * Types the field with the enum, made once per name; a name a model, a Prisma
 * type or an enum of other values holds leaves the field a String.
 */
function registerEnum(
  context: PrismaContext,
  field: Field,
  name: string,
  dbName: string,
  values: string[]
): boolean {
  const existing = context.enums.get(name);
  const sameValues =
    existing &&
    existing.members.map(member => member.value).join('\u0000') ===
      values.join('\u0000');

  if (
    !IDENTIFIER.test(name) ||
    RESERVED_MODEL_NAMES.has(name) ||
    [...context.models.values()].includes(name) ||
    (existing && !sameValues)
  ) {
    return false;
  }

  const definition = existing ?? { name, dbName, members: toMembers(values) };
  context.enums.set(name, definition);
  field.scalar = name;
  field.enum = definition;
  return true;
}

/**
 * Recognizes the join table of Prisma's implicit many-to-many as Prisma does:
 * _Name with required columns A and B holding the single-column keys of two
 * models, A the first by name, and writes a list field on each model instead.
 */
function addImplicitManyToMany(
  state: RootState,
  context: PrismaContext,
  tables: Table[]
) {
  const {
    doc: { relationshipIds },
    collections,
  } = state;
  const relationships = query(collections)
    .collection('relationshipEntities')
    .selectByIds(relationshipIds);

  tables.forEach(join => {
    const relationName = JOIN_TABLE.exec(join.name)?.[1];
    const columns = query(collections)
      .collection('tableColumnEntities')
      .selectByIds(join.columnIds);
    if (!relationName || columns.length !== 2) return;

    const ends = ['A', 'B'].map(columnName => {
      const column = columns.find(entry => entry.name === columnName);
      const into = relationships.filter(
        relationship =>
          column &&
          relationship.end.tableId === join.id &&
          relationship.end.columnIds.join() === column.id
      );
      if (!column || into.length !== 1) return null;

      const { start } = into[0];
      const model = context.models.get(start.tableId);
      const key = soleKey(state, start.tableId);
      const field = context.fields.get(column.id) as Field;

      return model &&
        key &&
        start.columnIds.join() === key.id &&
        field.required &&
        isSameKeyType(field, context.fields.get(key.id) as Field)
        ? { tableId: start.tableId, model }
        : null;
    });
    const [a, b] = ends;

    if (
      !a ||
      !b ||
      // A comes strictly first, which also leaves a model and itself out:
      // their two list fields would need names nothing recovers.
      !(a.model < b.model) ||
      relationships.some(relationship => relationship.start.tableId === join.id)
    ) {
      return;
    }

    const attribute =
      relationName === `${a.model}To${b.model}`
        ? ''
        : `@relation(${quoteString(relationName)})`;
    const inA: RelationField = {
      name: pluralize(lowerFirst(singularize(b.model))),
      type: `${b.model}[]`,
      attribute,
    };
    const inB: RelationField = {
      name: pluralize(lowerFirst(singularize(a.model))),
      type: `${a.model}[]`,
      attribute,
    };

    if (
      fieldNames(state, context, a.tableId).has(inA.name) ||
      fieldNames(state, context, b.tableId).has(inB.name)
    ) {
      return;
    }

    addRelationField(context, a.tableId, inA);
    addRelationField(context, b.tableId, inB);
    context.joinTables.add(join.id);
  });
}

/** The one column of a table's key, or null for a composite key or none. */
function soleKey({ collections }: RootState, tableId: string): Column | null {
  const table = query(collections)
    .collection('tableEntities')
    .selectById(tableId) as Table;
  const keys = query(collections)
    .collection('tableColumnEntities')
    .selectByIds(table.columnIds)
    .filter(column => bHas(column.options, ColumnOption.primaryKey));

  return keys.length === 1 ? keys[0] : null;
}

/**
 * Gives each relationship Prisma can express its two relation fields; one
 * whose fields would clash or break Prisma's rules is left out.
 */
function addRelationFields(state: RootState, context: PrismaContext) {
  const {
    doc: { relationshipIds },
    settings: { database },
    collections,
  } = state;
  const relationships = query(collections)
    .collection('relationshipEntities')
    .selectByIds(relationshipIds);
  const pairKey = ({ start, end }: Relationship) =>
    [start.tableId, end.tableId].sort().join(':');
  const pairCounts = new Map<string, number>();

  relationships.forEach(relationship => {
    const key = pairKey(relationship);
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  });

  relationships.forEach(relationship => {
    const { start, end, relationshipType } = relationship;
    const parentModel = context.models.get(start.tableId);
    const childModel = context.models.get(end.tableId);
    const toMany = hasNRelationship(relationshipType);

    if (
      !parentModel ||
      !childModel ||
      context.joinTables.has(end.tableId) ||
      (!toMany && !hasOneRelationship(relationshipType))
    ) {
      return;
    }

    const parentColumns = resolveColumns(state, start);
    const childColumns = resolveColumns(state, end);
    const parentFields = parentColumns.map(
      column => context.fields.get(column.id) as Field
    );
    const childFields = childColumns.map(
      column => context.fields.get(column.id) as Field
    );

    if (
      childColumns.length === 0 ||
      childColumns.length !== parentColumns.length ||
      childFields.some(
        (field, index) => !isSameKeyType(field, parentFields[index])
      ) ||
      !isUniqueKey(state, start.tableId, parentColumns) ||
      (!toMany && !isUniqueKey(state, end.tableId, childColumns))
    ) {
      return;
    }

    // A relation to its own model, or one of several between two models, is
    // ambiguous to Prisma until both of its fields carry one relation name.
    const ambiguous =
      start.tableId === end.tableId ||
      pairCounts.get(pairKey(relationship)) !== 1;
    const names = relationNames({
      parentModel,
      childModel,
      childFields,
      toMany,
      ambiguous,
      childTaken: fieldNames(state, context, end.tableId),
      parentTaken: fieldNames(state, context, start.tableId),
    });

    if (!names) {
      return;
    }

    const relationArgs = [
      ...(names.relationName ? [quoteString(names.relationName)] : []),
      `fields: [${childFields.map(field => field.name).join(', ')}]`,
      `references: [${parentFields.map(field => field.name).join(', ')}]`,
      // SQL Server refuses a cascade that loops back to its table or reaches
      // one table by two paths, so such a foreign key can only be NoAction.
      ...(ambiguous && database === Database.MSSQL
        ? ['onDelete: NoAction', 'onUpdate: NoAction']
        : []),
    ];
    const childField: RelationField = {
      name: names.childName,
      type: `${parentModel}${childFields.every(field => field.required) ? '' : '?'}`,
      attribute: `@relation(${relationArgs.join(', ')})`,
    };
    const parentField: RelationField = {
      name: names.parentName,
      type: `${childModel}${toMany ? '[]' : '?'}`,
      attribute: names.relationName
        ? `@relation(${quoteString(names.relationName)})`
        : '',
    };

    addRelationField(context, end.tableId, childField);
    addRelationField(context, start.tableId, parentField);
  });
}

type RelationNameInput = {
  parentModel: string;
  childModel: string;
  childFields: Field[];
  toMany: boolean;
  ambiguous: boolean;
  childTaken: Set<string>;
  parentTaken: Set<string>;
};

type RelationNames = {
  relationName: string;
  childName: string;
  parentName: string;
};

/**
 * Names a relation as a schema written by hand does: the field holding the
 * key after a single-column key (authorId gives author), else after the model,
 * and the list on the other side in the plural; null when every name is taken.
 */
function relationNames({
  parentModel,
  childModel,
  childFields,
  toMany,
  ambiguous,
  childTaken,
  parentTaken,
}: RelationNameInput): RelationNames | null {
  const parent = lowerFirst(singularize(parentModel));
  const child = singularize(childModel);
  const stem =
    childFields.length === 1
      ? (ID_SUFFIX.exec(childFields[0].name)?.[1] ?? '')
      : '';
  // An ambiguous relation keeps its fields apart by the key they stand on.
  const fallback = ambiguous
    ? `${parent}By${childFields.map(field => upperFirst(field.name)).join('')}`
    : parent;
  const childName = [stem, fallback].find(
    name => name !== '' && !childTaken.has(name)
  );

  if (!childName) {
    return null;
  }

  const many = toMany ? pluralize(child) : child;
  const parentName = ambiguous
    ? `${childName}${upperFirst(many)}`
    : lowerFirst(many);
  if (parentTaken.has(parentName)) {
    return null;
  }

  return {
    relationName: ambiguous ? `${childModel}${upperFirst(childName)}` : '',
    childName,
    parentName,
  };
}

function addRelationField(
  context: PrismaContext,
  tableId: string,
  field: RelationField
) {
  const fields = context.relationFields.get(tableId) ?? [];
  fields.push(field);
  context.relationFields.set(tableId, fields);
}

function fieldNames(
  { collections }: RootState,
  context: PrismaContext,
  tableId: string
): Set<string> {
  const table = query(collections)
    .collection('tableEntities')
    .selectById(tableId) as Table;

  return new Set([
    ...table.columnIds.flatMap(id => context.fields.get(id)?.name ?? []),
    ...(context.relationFields.get(tableId) ?? []).map(field => field.name),
  ]);
}

function resolveColumns(
  { collections }: RootState,
  { tableId, columnIds }: Relationship['start']
): Column[] {
  const columns = query(collections)
    .collection('tableColumnEntities')
    .selectByIds(columnIds)
    .filter(column => column.tableId === tableId);

  return columns.length === columnIds.length ? columns : [];
}

/** Whether the columns are a unique criterion: a key, a unique column or index. */
function isUniqueKey(
  { doc: { indexIds }, collections }: RootState,
  tableId: string,
  columns: Column[]
): boolean {
  const ids = new Set(columns.map(column => column.id));
  const sameSet = (candidate: string[]) =>
    candidate.length === ids.size && candidate.every(id => ids.has(id));
  const table = query(collections)
    .collection('tableEntities')
    .selectById(tableId) as Table;
  const tableColumns = query(collections)
    .collection('tableColumnEntities')
    .selectByIds(table.columnIds);
  const indexColumnCollection = query(collections).collection(
    'indexColumnEntities'
  );

  return (
    (columns.length === 1 && bHas(columns[0].options, ColumnOption.unique)) ||
    sameSet(
      tableColumns
        .filter(column => bHas(column.options, ColumnOption.primaryKey))
        .map(column => column.id)
    ) ||
    query(collections)
      .collection('indexEntities')
      .selectByIds(indexIds)
      .some(
        index =>
          index.tableId === tableId &&
          index.unique &&
          sameSet(
            indexColumnCollection
              .selectByIds(index.indexColumnIds)
              .map(indexColumn => indexColumn.columnId)
          )
      )
  );
}

/**
 * The default in the spelling the field's scalar takes; an expression Prisma
 * has no literal for is passed through dbgenerated.
 */
function formatDefault(column: Column, field: Field): string {
  const { scalar } = field;

  if (bHas(column.options, ColumnOption.autoIncrement)) {
    return INTEGER_SCALARS.includes(scalar) && !field.list
      ? 'autoincrement()'
      : '';
  }

  const value = column.default.trim();

  if (value === '') {
    return '';
  }
  if (field.list) {
    return formatListDefault(value, field);
  }

  return formatLiteral(value, field) ?? `dbgenerated(${quoteString(value)})`;
}

/** A literal Prisma can write for the field, or null for any other value. */
function formatLiteral(
  value: string,
  { scalar, enum: definition }: Field
): string | null {
  if (definition) {
    const stored = QUOTED_LITERAL.test(value)
      ? value.slice(1, -1).replace(ESCAPED_QUOTE, "'")
      : null;
    return (
      definition.members.find(member => member.value === stored)?.name ?? null
    );
  }
  if (scalar === 'DateTime' && CURRENT_TIMESTAMP.test(value)) {
    return 'now()';
  }
  if (
    (scalar === 'String' || scalar === 'Json') &&
    QUOTED_LITERAL.test(value)
  ) {
    return quoteString(value.slice(1, -1).replace(ESCAPED_QUOTE, "'"));
  }
  if (NUMBER_SCALARS.includes(scalar) && NUMERIC_LITERAL.test(value)) {
    return value;
  }
  if (scalar === 'Boolean' && BOOLEAN_LITERAL.test(value)) {
    return value.toLowerCase();
  }

  return null;
}

/**
 * A PostgreSQL array default as the list Prisma writes: the empty literal, or
 * ARRAY[...] of literals it can write one by one.
 */
function formatListDefault(value: string, field: Field): string {
  if (value === "'{}'") {
    return '[]';
  }

  const items = ARRAY_LITERAL.exec(value)?.[1]
    .split(',')
    .map(item => formatLiteral(item.trim(), field));

  return items && items.every(item => item !== null)
    ? `[${items.join(', ')}]`
    : `dbgenerated(${quoteString(value)})`;
}

function isUnindexable({ settings: { database } }: RootState, field: Field) {
  return (
    (database === Database.MySQL || database === Database.MariaDB) &&
    MYSQL_UNINDEXABLE.has(field.native)
  );
}

/** The field's type as written: Int, String?, String[] or Unsupported("x")?. */
function typeOf({ scalar, list, required }: Field): string {
  if (list) return `${scalar}[]`;
  return required ? scalar : `${scalar}?`;
}

/** Prisma relates only keys of one type, native type and all. */
function isSameKeyType(child: Field, parent: Field): boolean {
  return (
    child.scalar === parent.scalar &&
    child.native === parent.native &&
    !child.list &&
    !parent.list &&
    !child.scalar.startsWith('Unsupported')
  );
}

function quoteString(value: string): string {
  return `"${value.replace(STRING_ESCAPE, char => ESCAPE_MAP[char] ?? `\\${char}`)}"`;
}
