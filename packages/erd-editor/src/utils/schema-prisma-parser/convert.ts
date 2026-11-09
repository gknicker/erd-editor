import {
  ERDEditorSchemaV3,
  query,
  schemaV3Parser,
} from '@dineug/erd-editor-schema';

import {
  ColumnOption,
  ColumnUIKey,
  Database,
  OrderType,
  RelationshipType,
  StartRelationshipType,
} from '@/constants/schema';
import { EngineContext } from '@/engine/context';
import { Collections, Column, Table } from '@/internal-types';
import { bHas } from '@/utils/bit';
import { createIndex } from '@/utils/collection/index.entity';
import { createIndexColumn } from '@/utils/collection/indexColumn.entity';
import { createRelationship } from '@/utils/collection/relationship.entity';
import { createTable } from '@/utils/collection/table.entity';
import { createColumn } from '@/utils/collection/tableColumn.entity';
import { autoName, primaryKeyColumns } from '@/utils/schema-sql/utils';
import { textInRange, toSafeString } from '@/utils/validation';

import {
  dataTypeComment,
  isColumnType,
  resolveDataType,
  resolveDefault,
} from './dataType';
import { PrismaField, PrismaModel, PrismaTable } from './types';

/** A table's default schema, which never prefixes its name. */
const DEFAULT_SCHEMAS = ['', 'public', 'dbo'];

type TableContext = {
  source: PrismaTable;
  table: Table;
  /** Keyed by the Prisma field name, which is how Prisma names a column. */
  columns: Map<string, Column>;
};

type IndexInput = {
  name: string;
  unique: boolean;
  columns: Array<{ column: Column; descending: boolean }>;
};

type RelationshipInput = {
  parent: TableContext;
  parentColumns: Column[];
  child: TableContext;
  childColumns: Column[];
  toMany: boolean;
};

type RelationEnd = {
  context: TableContext;
  field: PrismaField;
};

type ConvertState = {
  schema: ERDEditorSchemaV3;
  ctx: EngineContext;
  database: number;
  provider: string;
  contexts: TableContext[];
  qualify: (schemaName: string, name: string) => string;
  findContext: (modelName: string) => TableContext | null;
  /** Relation fields already drawn, from either end of their relation. */
  consumed: Set<PrismaField>;
  relationshipKeys: Set<string>;
};

export function convertToSchema(
  model: PrismaModel,
  ctx: EngineContext,
  database: number
): ERDEditorSchemaV3 {
  const schema = schemaV3Parser({});
  const qualify = createQualifier(model.tables);
  const contexts = model.tables.map(source =>
    convertTable(
      schema,
      ctx,
      model,
      database,
      source,
      qualify(source.schemaName, source.dbName || source.name)
    )
  );

  convertIndexes(schema, contexts);
  convertRelationships({
    schema,
    ctx,
    database,
    provider: model.provider,
    contexts: [...contexts],
    qualify,
    findContext: createContextIndex(contexts),
    consumed: new Set(),
    relationshipKeys: new Set(),
  });

  return schema;
}

/**
 * The document has one flat table list, so a @@schema survives as a prefix
 * once a file spreads its models over several; the default schema never does.
 */
function createQualifier(
  tables: PrismaTable[]
): (schemaName: string, name: string) => string {
  const schemaNames = new Set(tables.map(table => table.schemaName));

  return (schemaName, name) =>
    schemaNames.size > 1 && !DEFAULT_SCHEMAS.includes(schemaName)
      ? `${schemaName}_${name}`
      : name;
}

/** A relation field's type is the Prisma name, which @@map leaves alone. */
function createContextIndex(
  contexts: TableContext[]
): (modelName: string) => TableContext | null {
  const byName = new Map<string, TableContext>();

  contexts.forEach(context => {
    if (!byName.has(context.source.name)) {
      byName.set(context.source.name, context);
    }
  });

  return modelName => byName.get(modelName) ?? null;
}

function convertTable(
  { doc, collections }: ERDEditorSchemaV3,
  ctx: EngineContext,
  model: PrismaModel,
  database: number,
  source: PrismaTable,
  tableName: string
): TableContext {
  const { toWidth } = ctx;
  const name = toSafeString(tableName);
  const comment = toSafeString(source.comment);
  const newTable = createTable({
    name,
    comment,
    ui: {
      widthName: textInRange(toWidth(name)),
      widthComment: textInRange(toWidth(comment)),
    },
  });
  const context: TableContext = {
    source,
    table: newTable,
    columns: new Map(),
  };
  const compositeKey = new Set(source.primaryKey);

  source.fields.forEach(field => {
    // A relation field, a composite type and a type no block declares hold
    // no column of their own.
    if (!field.unsupported && !isColumnType(field.typeName, model.enums)) {
      return;
    }

    const column = createFieldColumn(
      ctx,
      model,
      database,
      newTable.id,
      field,
      field.primaryKey || compositeKey.has(field.name)
    );

    appendColumn(collections, context, field.name, column);
  });

  doc.tableIds.push(newTable.id);
  query(collections).collection('tableEntities').setOne(newTable);

  return context;
}

function createFieldColumn(
  { toWidth }: EngineContext,
  model: PrismaModel,
  database: number,
  tableId: string,
  field: PrismaField,
  primaryKey: boolean
): Column {
  const name = toSafeString(field.dbName || field.name);
  const dataType = toSafeString(
    resolveDataType(field, database, model.provider, model.enums)
  );
  const comment = [
    toSafeString(field.comment),
    dataTypeComment(field, database, model.enums),
  ]
    .filter(Boolean)
    .join(' ');
  const defaultValue = toSafeString(resolveDefault(field, dataType, database));
  // Prisma creates a scalar list column without NOT NULL, though the client
  // never reads one back as null.
  const notNull = !field.optional && !field.list;

  return createColumn({
    tableId,
    name,
    comment,
    dataType,
    default: defaultValue,
    options:
      (field.autoIncrement ? ColumnOption.autoIncrement : 0) |
      (primaryKey ? ColumnOption.primaryKey : 0) |
      (field.unique ? ColumnOption.unique : 0) |
      (notNull ? ColumnOption.notNull : 0),
    ui: {
      widthName: textInRange(toWidth(name)),
      widthComment: textInRange(toWidth(comment)),
      widthDataType: textInRange(toWidth(dataType)),
      widthDefault: textInRange(toWidth(defaultValue)),
      // Only the foreign key bit is recomputed on load, so the primary key one
      // has to be written here as well as into options.
      keys: primaryKey ? ColumnUIKey.primaryKey : 0,
    },
  });
}

function appendColumn(
  collections: Collections,
  context: TableContext,
  key: string,
  column: Column
) {
  context.table.columnIds.push(column.id);
  context.table.seqColumnIds.push(column.id);
  context.columns.set(key, column);
  query(collections).collection('tableColumnEntities').setOne(column);
}

function convertIndexes(schema: ERDEditorSchemaV3, contexts: TableContext[]) {
  contexts.forEach(({ source, table, columns }) => {
    source.indexes.forEach(index => {
      appendIndex(schema, table, {
        name: toSafeString(index.name),
        unique: index.unique,
        columns: index.fields.flatMap(field => {
          const column = columns.get(field.name);
          return column ? [{ column, descending: field.descending }] : [];
        }),
      });
    });
  });
}

function appendIndex(
  { doc, collections }: ERDEditorSchemaV3,
  table: Table,
  { name, unique, columns }: IndexInput
) {
  if (!columns.length) return;

  const newIndex = createIndex({ name, tableId: table.id, unique });

  columns.forEach(({ column, descending }) => {
    const indexColumn = createIndexColumn({
      indexId: newIndex.id,
      columnId: column.id,
      orderType: descending ? OrderType.DESC : OrderType.ASC,
    });

    newIndex.indexColumnIds.push(indexColumn.id);
    newIndex.seqIndexColumnIds.push(indexColumn.id);
    query(collections).collection('indexColumnEntities').setOne(indexColumn);
  });

  doc.indexIds.push(newIndex.id);
  query(collections).collection('indexEntities').setOne(newIndex);
}

/**
 * Every field holding fields and references draws its foreign key first, so
 * the back-relation lists it consumes are never read as many-to-many ends.
 */
function convertRelationships(state: ConvertState) {
  const relationEnds = state.contexts.flatMap(context =>
    context.source.fields
      .filter(field => state.findContext(field.typeName))
      .map(field => ({ context, field }))
  );

  relationEnds.forEach(end => {
    if (end.field.relationFields.length && !end.field.list) {
      convertForeignKey(state, relationEnds, end);
    }
  });

  relationEnds.forEach(end => {
    if (end.field.list && !state.consumed.has(end.field)) {
      convertImplicitManyToMany(state, relationEnds, end);
    }
  });
}

/**
 * The other field of a relation points back at this model under the same
 * name, and is a different field, since a self-relation holds both ends.
 */
function findOpposite(
  relationEnds: RelationEnd[],
  { context, field }: RelationEnd,
  consumed: Set<PrismaField>
): RelationEnd | null {
  return (
    relationEnds.find(
      other =>
        other.field !== field &&
        !consumed.has(other.field) &&
        other.context.source.name === field.typeName &&
        other.field.typeName === context.source.name &&
        other.field.relationName === field.relationName
    ) ?? null
  );
}

function convertForeignKey(
  state: ConvertState,
  relationEnds: RelationEnd[],
  end: RelationEnd
) {
  if (state.consumed.has(end.field)) return;

  const { context: child, field } = end;
  const parent = state.findContext(field.typeName) as TableContext;
  const opposite = findOpposite(relationEnds, end, state.consumed);

  state.consumed.add(field);
  if (opposite) {
    state.consumed.add(opposite.field);
  }

  const childColumns = resolveColumns(child, field.relationFields);
  const parentColumns = field.relationReferences.length
    ? resolveColumns(parent, field.relationReferences)
    : primaryKeyColumns([...parent.columns.values()]);
  if (
    childColumns.length === 0 ||
    childColumns.length !== parentColumns.length
  ) {
    return;
  }

  // Prisma calls a relation one-to-one when its back-relation field is not a
  // list; a file missing that field falls back on the key being unique.
  const toMany = opposite
    ? opposite.field.list
    : !isUniqueKey(child, childColumns);

  appendRelationship(state, {
    parent,
    parentColumns,
    child,
    childColumns,
    toMany,
  });
}

function resolveColumns(context: TableContext, names: string[]): Column[] {
  const columns = names.flatMap(name => {
    const column = context.columns.get(name);
    return column ? [column] : [];
  });

  return columns.length === names.length ? columns : [];
}

function isUniqueKey(context: TableContext, columns: Column[]): boolean {
  const ids = new Set(columns.map(column => column.id));
  const sameSet = (candidate: Column[]) =>
    candidate.length === ids.size &&
    candidate.every(column => ids.has(column.id));

  if (columns.length === 1 && bHas(columns[0].options, ColumnOption.unique)) {
    return true;
  }

  if (sameSet(primaryKeyColumns([...context.columns.values()]))) {
    return true;
  }

  return context.source.indexes.some(
    index =>
      index.unique &&
      sameSet(
        resolveColumns(
          context,
          index.fields.map(entry => entry.name)
        )
      )
  );
}

function appendRelationship(
  { schema: { doc, collections }, relationshipKeys }: ConvertState,
  { parent, parentColumns, child, childColumns, toMany }: RelationshipInput
) {
  const key = `${parent.table.id}:${child.table.id}:${childColumns
    .map(column => column.id)
    .join(',')}`;
  if (relationshipKeys.has(key)) return;
  relationshipKeys.add(key);

  childColumns.forEach(column => {
    column.ui.keys |= ColumnUIKey.foreignKey;
  });

  // Prisma cannot require a row to have children, so the child end is always
  // optional; whether a child needs its parent is the start end, as the
  // editor's own hook reads it from the foreign key columns.
  const newRelationship = createRelationship({
    identification: childColumns.every(column =>
      bHas(column.ui.keys, ColumnUIKey.primaryKey)
    ),
    relationshipType: toMany
      ? RelationshipType.ZeroN
      : RelationshipType.ZeroOne,
    startRelationshipType: childColumns.every(column =>
      bHas(column.options, ColumnOption.notNull)
    )
      ? StartRelationshipType.dash
      : StartRelationshipType.ring,
    start: {
      tableId: parent.table.id,
      columnIds: parentColumns.map(column => column.id),
    },
    end: {
      tableId: child.table.id,
      columnIds: childColumns.map(column => column.id),
    },
  });

  doc.relationshipIds.push(newRelationship.id);
  query(collections).collection('relationshipEntities').setOne(newRelationship);
}

/**
 * Two list fields naming each other make the table Prisma creates and hides:
 * _Name, or _AToB after the models in sorted order, with A and B holding each
 * model's single-field id.
 */
function convertImplicitManyToMany(
  state: ConvertState,
  relationEnds: RelationEnd[],
  end: RelationEnd
) {
  const opposite = findOpposite(relationEnds, end, state.consumed);
  if (
    !opposite ||
    !opposite.field.list ||
    end.field.relationFields.length ||
    opposite.field.relationFields.length
  ) {
    return;
  }

  state.consumed.add(end.field);
  state.consumed.add(opposite.field);

  const [left, right] = [end.context, opposite.context].sort((a, b) =>
    a.source.name < b.source.name ? -1 : a.source.name > b.source.name ? 1 : 0
  );
  const leftKeys = primaryKeyColumns([...left.columns.values()]);
  const rightKeys = primaryKeyColumns([...right.columns.values()]);
  if (leftKeys.length !== 1 || rightKeys.length !== 1) return;

  const relationName =
    end.field.relationName || `${left.source.name}To${right.source.name}`;
  appendJoinTable(state, relationName, [
    { parent: left, key: leftKeys[0], columnName: 'A' },
    { parent: right, key: rightKeys[0], columnName: 'B' },
  ]);
}

type JoinSide = {
  parent: TableContext;
  key: Column;
  columnName: string;
};

function appendJoinTable(
  state: ConvertState,
  relationName: string,
  sides: JoinSide[]
) {
  const { schema, ctx, database, provider, contexts } = state;
  const { doc, collections } = schema;
  const { toWidth } = ctx;
  const [left, right] = sides;
  const name = autoName(
    contexts.map(context => context.table),
    '',
    toSafeString(
      state.qualify(left.parent.source.schemaName, `_${relationName}`)
    )
  );
  // Prisma keys the pair with a primary key on PostgreSQL and a unique index
  // elsewhere, CockroachDB included, and names both, so its names are kept.
  const primaryKey =
    database === Database.PostgreSQL && provider !== 'cockroachdb';
  const comment = `Implicit many-to-many table Prisma creates for ${left.parent.table.name} <-> ${right.parent.table.name}`;
  const newTable = createTable({
    name,
    comment,
    ui: {
      widthName: textInRange(toWidth(name)),
      widthComment: textInRange(toWidth(comment)),
    },
  });
  const join: TableContext = {
    source: {
      name,
      dbName: '',
      schemaName: left.parent.source.schemaName,
      comment,
      view: false,
      fields: [],
      primaryKey: [],
      indexes: [],
    },
    table: newTable,
    columns: new Map(),
  };

  doc.tableIds.push(newTable.id);
  query(collections).collection('tableEntities').setOne(newTable);
  contexts.push(join);

  const joinColumns = sides.map(({ key, columnName }) => {
    const { dataType } = key;
    const newColumn = createColumn({
      tableId: newTable.id,
      name: columnName,
      dataType,
      options:
        ColumnOption.notNull | (primaryKey ? ColumnOption.primaryKey : 0),
      ui: {
        keys: primaryKey ? ColumnUIKey.primaryKey : 0,
        widthName: textInRange(toWidth(columnName)),
        widthDataType: textInRange(toWidth(dataType)),
      },
    });

    appendColumn(collections, join, columnName, newColumn);
    return newColumn;
  });

  if (!primaryKey) {
    appendIndex(schema, newTable, {
      name: `_${relationName}_AB_unique`,
      unique: true,
      columns: joinColumns.map(column => ({ column, descending: false })),
    });
  }
  appendIndex(schema, newTable, {
    name: `_${relationName}_B_index`,
    unique: false,
    columns: [{ column: joinColumns[1], descending: false }],
  });

  sides.forEach(({ parent, key }, index) => {
    appendRelationship(state, {
      parent,
      parentColumns: [key],
      child: join,
      childColumns: [joinColumns[index]],
      toMany: true,
    });
  });
}
