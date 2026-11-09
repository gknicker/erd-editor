// @vitest-environment node
import { createRequire } from 'node:module';

import { schemaV3Parser } from '@dineug/erd-editor-schema';
import { describe, expect, it } from 'vite-plus/test';

import {
  ColumnOption,
  Database,
  NameCase,
  OrderType,
  RelationshipType,
} from '@/constants/schema';
import { createEngineContext } from '@/engine/context';
import { RootState } from '@/engine/state';
import {
  Column,
  DeepPartial,
  Index,
  IndexColumn,
  Relationship,
  Table,
} from '@/internal-types';
import { createIndex } from '@/utils/collection/index.entity';
import { createIndexColumn } from '@/utils/collection/indexColumn.entity';
import { createRelationship } from '@/utils/collection/relationship.entity';
import { createTable } from '@/utils/collection/table.entity';
import { createColumn } from '@/utils/collection/tableColumn.entity';
import { createCode, formatTable } from '@/utils/generator-code/prisma';
import { schemaPrismaParserToSchemaJson } from '@/utils/schema-prisma-parser';
import { parsePrismaModel } from '@/utils/schema-prisma-parser/parser';
import { PrismaTable } from '@/utils/schema-prisma-parser/types';

const prismaSchemaWasm = createRequire(import.meta.url)(
  '@prisma/prisma-schema-wasm'
) as { validate: (params: string) => void };

/** What Prisma's own engine says of a schema, or null when it takes it. */
function prismaErrors(source: string): string | null {
  try {
    prismaSchemaWasm.validate(
      JSON.stringify({
        prismaSchema: [['schema.prisma', source]],
        noColor: true,
      })
    );
    return null;
  } catch (error) {
    return JSON.parse((error as Error).message).message;
  }
}

type StateInput = {
  tables?: Table[];
  columns?: Column[];
  relationships?: Relationship[];
  indexes?: Index[];
  indexColumns?: IndexColumn[];
  settings?: Partial<RootState['settings']>;
};

function createState({
  tables = [],
  columns = [],
  relationships = [],
  indexes = [],
  indexColumns = [],
  settings,
}: StateInput): RootState {
  const state = schemaV3Parser({}) as unknown as RootState;
  state.doc.tableIds = tables.map(table => table.id);
  state.doc.relationshipIds = relationships.map(
    relationship => relationship.id
  );
  state.doc.indexIds = indexes.map(index => index.id);
  tables.forEach(table => {
    state.collections.tableEntities[table.id] = table;
  });
  columns.forEach(column => {
    state.collections.tableColumnEntities[column.id] = column;
  });
  relationships.forEach(relationship => {
    state.collections.relationshipEntities[relationship.id] = relationship;
  });
  indexes.forEach(index => {
    state.collections.indexEntities[index.id] = index;
  });
  indexColumns.forEach(indexColumn => {
    state.collections.indexColumnEntities[indexColumn.id] = indexColumn;
  });
  Object.assign(state.settings, { database: Database.PostgreSQL }, settings);
  return state;
}

const ID_OPTIONS = ColumnOption.primaryKey | ColumnOption.notNull;

/** A table named name whose first column, id int, is its key. */
function keyedTable(
  id: string,
  name: string,
  columns: Array<Partial<Column>> = []
): { table: Table; columns: Column[] } {
  const all = [
    createColumn({
      id: `${id}.id`,
      tableId: id,
      name: 'id',
      dataType: 'int',
      options: ID_OPTIONS,
    }),
    ...columns.map((column, index) =>
      createColumn({
        id: `${id}.c${index}`,
        tableId: id,
        name: `c${index}`,
        dataType: 'int',
        ...column,
      })
    ),
  ];

  return {
    table: createTable({
      id,
      name,
      columnIds: all.map(column => column.id),
    }),
    columns: all,
  };
}

/** The model block a one-table document generates, lines and all. */
function model(columns: Array<Partial<Column>>, settings = {}): string[] {
  const { table, columns: all } = keyedTable('t1', 'user', columns);
  const lines = createCode(
    createState({ tables: [table], columns: all, settings })
  ).split('\n');

  const start = lines.findIndex(line => line.startsWith('model '));
  return lines.slice(start, lines.indexOf('}', start) + 1);
}

/** The line of field c0 in a one-table document. */
function field(column: Partial<Column>, settings = {}): string {
  const line = model([column], settings).find(entry =>
    entry.trimStart().startsWith('c0 ')
  );
  if (!line) throw new Error('expected a c0 field');
  return line.trim().replace(/ +/g, ' ');
}

const USERS_POSTS = (() => {
  const users = keyedTable('t1', 'users', [
    { name: 'email', dataType: 'varchar(255)', options: ColumnOption.notNull },
  ]);
  const posts = keyedTable('t2', 'posts', [
    { name: 'user_id', dataType: 'int', options: ColumnOption.notNull },
  ]);

  return { users, posts };
})();

function relationshipState(
  relationship: DeepPartial<Relationship> = {},
  postColumn: Partial<Column> = {},
  extra: StateInput = {}
): RootState {
  const users = keyedTable('t1', 'users');
  const posts = keyedTable('t2', 'posts', [
    {
      name: 'user_id',
      dataType: 'int',
      options: ColumnOption.notNull,
      ...postColumn,
    },
  ]);

  return createState({
    tables: [users.table, posts.table, ...(extra.tables ?? [])],
    columns: [...users.columns, ...posts.columns, ...(extra.columns ?? [])],
    relationships: [
      createRelationship({
        id: 'r1',
        relationshipType: RelationshipType.ZeroN,
        start: { tableId: 't1', columnIds: ['t1.id'] },
        end: { tableId: 't2', columnIds: ['t2.c0'] },
        ...relationship,
      }),
      ...(extra.relationships ?? []),
    ],
    indexes: extra.indexes,
    indexColumns: extra.indexColumns,
  });
}

/** The relation field lines of the generated document, spaces collapsed. */
function relationLines(state: RootState): string[] {
  return createCode(state)
    .split('\n')
    .map(line => line.trim().replace(/ +/g, ' '))
    .filter(
      line =>
        !line.startsWith('model') && / (User|Post)(\?|\[\])?( |$)/.test(line)
    );
}

describe('generator-code/prisma', () => {
  describe('createCode', () => {
    it('returns an empty string when the document has no tables', () => {
      expect(createCode(createState({}))).toBe('');
    });

    it('writes a document Prisma validates, in the layout prisma format gives', () => {
      const { users, posts } = USERS_POSTS;
      users.table.comment = 'People who sign in';
      const state = createState({
        tables: [users.table, posts.table],
        columns: [...users.columns, ...posts.columns],
        relationships: [
          createRelationship({
            id: 'r1',
            relationshipType: RelationshipType.ZeroN,
            start: { tableId: 't1', columnIds: ['t1.id'] },
            end: { tableId: 't2', columnIds: ['t2.c0'] },
          }),
        ],
      });
      const code = createCode(state);

      expect(code.split('\n')).toEqual([
        '',
        'datasource db {',
        '  provider = "postgresql"',
        '}',
        '',
        'model Post {',
        '  id     Int  @id',
        '  userId Int  @map("user_id")',
        '  user   User @relation(fields: [userId], references: [id])',
        '',
        '  @@map("posts")',
        '}',
        '',
        '/// People who sign in',
        'model User {',
        '  id    Int    @id',
        '  email String @db.VarChar(255)',
        '  posts Post[]',
        '',
        '  @@map("users")',
        '}',
        '',
      ]);
      expect(prismaErrors(code)).toBeNull();
    });

    it.each([
      [Database.PostgreSQL, 'postgresql'],
      [Database.MySQL, 'mysql'],
      [Database.MariaDB, 'mysql'],
      [Database.MSSQL, 'sqlserver'],
      [Database.SQLite, 'sqlite'],
    ])('names the provider of dialect %i as %s', (database, provider) => {
      const { table, columns } = keyedTable('t1', 'user');
      const code = createCode(
        createState({ tables: [table], columns, settings: { database } })
      );

      expect(code).toContain(`datasource db {\n  provider = "${provider}"\n}`);
      expect(prismaErrors(code)).toBeNull();
    });

    it.each([Database.Oracle, Database.Databricks, Database.Snowflake])(
      'writes no datasource for dialect %i, which Prisma has no provider for',
      database => {
        const { table, columns } = keyedTable('t1', 'user');
        const code = createCode(
          createState({ tables: [table], columns, settings: { database } })
        );

        expect(code).not.toContain('datasource');
        expect(prismaErrors(code)).toBeNull();
      }
    );

    it('orders the models by table name', () => {
      const a = keyedTable('t1', 'zebra');
      const b = keyedTable('t2', 'apple');
      const code = createCode(
        createState({
          tables: [a.table, b.table],
          columns: [...a.columns, ...b.columns],
        })
      );

      expect(code.indexOf('model Apple')).toBeLessThan(
        code.indexOf('model Zebra')
      );
    });
  });

  describe('formatTable', () => {
    it('writes the model alone, without the datasource', () => {
      const { table, columns } = keyedTable('t1', 'user');
      const buffer: string[] = [];

      formatTable(createState({ tables: [table], columns }), {
        buffer,
        table,
      });

      expect(buffer).toEqual([
        'model User {',
        '  id Int @id',
        '',
        '  @@map("user")',
        '}',
      ]);
    });

    it('writes a table the document does not hold', () => {
      const { table, columns } = keyedTable('t1', 'user');
      const state = createState({ tables: [table], columns });
      state.doc.tableIds = [];
      const buffer: string[] = [];

      formatTable(state, { buffer, table });

      expect(buffer[0]).toBe('model User {');
      expect(buffer[1]).toBe('  id Int @id');
    });
  });

  describe('models', () => {
    it('names the model by the table name case, mapping it to the table', () => {
      expect(model([])).toEqual([
        'model User {',
        '  id Int @id',
        '',
        '  @@map("user")',
        '}',
      ]);
    });

    it('maps nothing when the model keeps the table name', () => {
      expect(model([], { tableNameCase: NameCase.none })).toEqual([
        'model user {',
        '  id Int @id',
        '}',
      ]);
    });

    /** The model line of each table, by table name, in model order. */
    const modelLines = (names: string[], settings = {}) => {
      const tables = names.map((name, index) => keyedTable(`t${index}`, name));
      const code = createCode(
        createState({
          tables: tables.map(({ table }) => table),
          columns: tables.flatMap(({ columns }) => columns),
          settings,
        })
      );

      expect(prismaErrors(code)).toBeNull();
      return code
        .split('\n')
        .filter(line => /^model |@@map/.test(line))
        .map(line => line.trim());
    };

    it('names a model in the singular of its table, mapping it to the table', () => {
      expect(modelLines(['categories', 'order_lines', 'people'])).toEqual([
        'model Category {',
        '@@map("categories")',
        'model OrderLine {',
        '@@map("order_lines")',
        'model Person {',
        '@@map("people")',
      ]);
    });

    it('keeps the name of a table no rule covers', () => {
      expect(modelLines(['news'])).toEqual(['model News {', '@@map("news")']);
    });

    it.each([[['user', 'users']], [['users', 'user']]])(
      "keeps the plural where the singular is another table's model, in %j",
      names => {
        expect(modelLines(names)).toEqual([
          'model User {',
          '@@map("user")',
          'model Users {',
          '@@map("users")',
        ]);
      }
    );

    it('keeps the plural where an earlier table took the same singular', () => {
      expect(modelLines(['boxes', 'boxs'])).toEqual([
        'model Box {',
        '@@map("boxes")',
        'model Boxs {',
        '@@map("boxs")',
      ]);
    });

    it('keeps the plural where the singular is a Prisma type', () => {
      expect(modelLines(['strings'])).toEqual([
        'model Strings {',
        '@@map("strings")',
      ]);
    });

    it('leaves a table name as it is where the name case is none', () => {
      expect(modelLines(['users'], { tableNameCase: NameCase.none })).toEqual([
        'model users {',
      ]);
    });

    it('writes the table comment as doc comments, a line each', () => {
      const { table, columns } = keyedTable('t1', 'user');
      table.comment = 'one\ntwo';
      const code = createCode(createState({ tables: [table], columns }));

      expect(code).toContain('/// one\n/// two\nmodel User {');
    });

    it('writes a composite key as @@id, in column order', () => {
      const { table, columns } = keyedTable('t1', 'user', [
        { name: 'tenant', options: ID_OPTIONS },
      ]);
      const code = createCode(createState({ tables: [table], columns }));

      expect(code).toContain('  @@id([id, tenant])');
      expect(code).not.toContain('@id ');
      expect(prismaErrors(code)).toBeNull();
    });
  });

  describe('fields', () => {
    it.each([
      ['int', 'Int'],
      ['bigint', 'BigInt'],
      ['varchar(255)', 'String @db.VarChar(255)'],
      ['text', 'String'],
      ['decimal(10,2)', 'Decimal @db.Decimal(10, 2)'],
      ['double precision', 'Float'],
      ['real', 'Float @db.Real'],
      ['boolean', 'Boolean'],
      ['timestamp(3)', 'DateTime'],
      ['date', 'DateTime @db.Date'],
      ['jsonb', 'Json'],
      ['', 'String'],
    ])('types the PostgreSQL %j as %s', (dataType, scalar) => {
      expect(field({ dataType, options: ColumnOption.notNull })).toBe(
        `c0 ${scalar}`
      );
    });

    it('types a column by the document dialect', () => {
      expect(
        field(
          { dataType: 'DATETIME(3)', options: ColumnOption.notNull },
          { database: Database.MySQL }
        )
      ).toBe('c0 DateTime');
    });

    it('makes a nullable column optional', () => {
      expect(field({ dataType: 'int' })).toBe('c0 Int?');
    });

    it('keeps a key column required though its not-null flag is off', () => {
      const { table, columns } = keyedTable('t1', 'user');
      columns[0].options = ColumnOption.primaryKey;

      expect(createCode(createState({ tables: [table], columns }))).toContain(
        '  id Int @id\n'
      );
    });

    it('names the field by the column name case, mapping it to the column', () => {
      expect(
        model([{ name: 'created_at', options: ColumnOption.notNull }])
      ).toContain('  createdAt Int @map("created_at")');
    });

    it('maps nothing when the field keeps the column name', () => {
      expect(field({ options: ColumnOption.notNull })).toBe('c0 Int');
    });

    it('marks a unique column', () => {
      expect(
        field({ options: ColumnOption.notNull | ColumnOption.unique })
      ).toBe('c0 Int @unique');
    });

    it('leaves @unique off a key column, whose @id is unique already', () => {
      const { table, columns } = keyedTable('t1', 'user');
      columns[0].options |= ColumnOption.unique;

      expect(createCode(createState({ tables: [table], columns }))).toContain(
        '  id Int @id\n'
      );
    });

    it('writes the column comment above the field', () => {
      expect(
        model([{ comment: 'first\nsecond', options: ColumnOption.notNull }])
      ).toEqual([
        'model User {',
        '  id Int @id',
        '  /// first',
        '  /// second',
        '  c0 Int',
        '',
        '  @@map("user")',
        '}',
      ]);
    });

    it('lines the fields up in columns', () => {
      expect(
        model([
          {
            name: 'created_at',
            dataType: 'timestamp',
            options: ColumnOption.notNull,
          },
        ])
      ).toEqual([
        'model User {',
        '  id        Int      @id',
        '  createdAt DateTime @map("created_at") @db.Timestamp',
        '',
        '  @@map("user")',
        '}',
      ]);
    });
  });

  describe('defaults', () => {
    it.each([
      ['int', ColumnOption.autoIncrement, '', '@default(autoincrement())'],
      ['bigint', ColumnOption.autoIncrement, '', '@default(autoincrement())'],
      ['timestamp', 0, 'CURRENT_TIMESTAMP', '@default(now())'],
      ['timestamp(3)', 0, 'CURRENT_TIMESTAMP(3)', '@default(now())'],
      ['timestamp', 0, 'now()', '@default(now())'],
      ['varchar', 0, "'draft'", '@default("draft")'],
      ['varchar', 0, "'it''s'", '@default("it\'s")'],
      ['varchar', 0, `'a"b\\c'`, '@default("a\\"b\\\\c")'],
      ['varchar', 0, "'a\nb'", '@default("a\\nb")'],
      ['int', 0, '0', '@default(0)'],
      ['decimal', 0, '-1.5', '@default(-1.5)'],
      ['boolean', 0, 'TRUE', '@default(true)'],
      [
        'uuid',
        0,
        'gen_random_uuid()',
        '@default(dbgenerated("gen_random_uuid()"))',
      ],
      ['int', 0, 'abc', '@default(dbgenerated("abc"))'],
      [
        'varchar',
        0,
        'CURRENT_TIMESTAMP',
        '@default(dbgenerated("CURRENT_TIMESTAMP"))',
      ],
    ])(
      'writes a %s default of %j as %s',
      (dataType, options, value, expected) => {
        const line = field({
          dataType,
          default: value,
          options: ColumnOption.notNull | options,
        });

        expect(line.split(' ').slice(2).join(' ')).toContain(expected);
      }
    );

    it('writes no default for an empty one', () => {
      expect(field({ default: '  ', options: ColumnOption.notNull })).toBe(
        'c0 Int'
      );
    });

    it('writes no autoincrement on a type Prisma keeps it off', () => {
      expect(
        field({
          dataType: 'text',
          options: ColumnOption.notNull | ColumnOption.autoIncrement,
        })
      ).toBe('c0 String');
    });

    it('writes defaults Prisma validates', () => {
      const { table, columns } = keyedTable('t1', 'user', [
        { dataType: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        { dataType: 'varchar', default: "'x'" },
        { dataType: 'boolean', default: 'false' },
        { dataType: 'uuid', default: 'gen_random_uuid()' },
      ]);
      columns[0].options |= ColumnOption.autoIncrement;

      expect(
        prismaErrors(createCode(createState({ tables: [table], columns })))
      ).toBeNull();
    });
  });

  describe('native types', () => {
    it('writes a list, never optional, with the defaults Prisma can', () => {
      const lines = model([
        { dataType: 'text[]', default: "'{}'" },
        { dataType: 'text[]', default: "ARRAY['a', 'b']" },
        { dataType: 'integer[]', default: 'ARRAY[1,2]' },
        { dataType: 'text[]', default: "ARRAY[lower('A')]" },
        { dataType: 'integer[]', options: ColumnOption.autoIncrement },
      ]).map(line => line.trim().replace(/ +/g, ' '));

      expect(lines.slice(2, 7)).toEqual([
        'c0 String[] @default([])',
        'c1 String[] @default(["a", "b"])',
        'c2 Int[] @default([1, 2])',
        'c3 String[] @default(dbgenerated("ARRAY[lower(\'A\')]"))',
        'c4 Int[]',
      ]);
    });

    it('writes a JSON document default as the string Prisma takes', () => {
      expect(field({ dataType: 'jsonb', default: "'{}'" })).toBe(
        'c0 Json? @default("{}")'
      );
    });

    it('writes a type Prisma has none for as Unsupported', () => {
      expect(field({ dataType: 'tsvector' })).toBe(
        'c0 Unsupported("tsvector")?'
      );
    });

    it('writes fields of every kind that Prisma validates', () => {
      const { table, columns } = keyedTable('t1', 'user', [
        { dataType: 'varchar(80)', options: ColumnOption.notNull },
        { dataType: 'timestamptz(6)', default: 'CURRENT_TIMESTAMP' },
        { dataType: 'uuid', default: 'gen_random_uuid()' },
        { dataType: 'text[]', default: "ARRAY['member']" },
        { dataType: 'jsonb', default: "'{}'" },
        { dataType: 'tsvector' },
        { dataType: 'numeric(10,2)', default: '0' },
      ]);

      expect(
        prismaErrors(createCode(createState({ tables: [table], columns })))
      ).toBeNull();
    });

    describe('leaving out a MySQL index over a text or blob column', () => {
      const mysqlModel = () => {
        const { table, columns } = keyedTable('t1', 'post', [
          {
            name: 'title',
            dataType: 'VARCHAR(200)',
            options: ColumnOption.notNull,
          },
          {
            name: 'body',
            dataType: 'TEXT',
            options: ColumnOption.notNull | ColumnOption.unique,
          },
        ]);
        const indexColumns = [
          createIndexColumn({ id: 'ic1', indexId: 'i1', columnId: 't1.c0' }),
          createIndexColumn({ id: 'ic2', indexId: 'i2', columnId: 't1.c0' }),
          createIndexColumn({ id: 'ic3', indexId: 'i2', columnId: 't1.c1' }),
        ];

        return createState({
          tables: [table],
          columns,
          indexes: [
            createIndex({
              id: 'i1',
              tableId: 't1',
              indexColumnIds: ['ic1'],
            }),
            createIndex({
              id: 'i2',
              tableId: 't1',
              indexColumnIds: ['ic2', 'ic3'],
            }),
          ],
          indexColumns,
          settings: { database: Database.MySQL },
        });
      };

      it('which MySQL takes only with a length the diagram does not keep', () => {
        const code = createCode(mysqlModel());

        expect(code).toContain('  @@index([title])\n');
        expect(code).not.toContain('@@index([title, body])');
        expect(code).not.toContain('@unique');
        expect(code).toContain('@db.Text');
        expect(prismaErrors(code)).toBeNull();
      });

      it('keeping one on PostgreSQL, which indexes text', () => {
        const state = mysqlModel();
        state.settings.database = Database.PostgreSQL;
        state.collections.tableColumnEntities['t1.c1'].dataType = 'text';

        expect(createCode(state)).toContain('@@index([title, body])');
      });
    });
  });

  describe('enums', () => {
    /** An orders table whose state column holds an enum, and its code. */
    const enumCode = (
      state: Partial<Column>,
      settings: Partial<RootState['settings']> = {},
      extra: Array<Partial<Column>> = []
    ) => {
      const { table, columns } = keyedTable('t1', 'orders', [
        { name: 'state', options: ColumnOption.notNull, ...state },
        ...extra,
      ]);
      return createCode(createState({ tables: [table], columns, settings }));
    };
    const flat = (code: string) => code.replace(/ +/g, ' ');

    it.each([Database.MySQL, Database.MariaDB])(
      "writes MySQL's ENUM as an enum named after the model and field on %i",
      database => {
        const code = enumCode(
          { dataType: "ENUM('DRAFT','PAID')", default: "'PAID'" },
          { database }
        );

        expect(code).toContain('enum OrderState {\n  DRAFT\n  PAID\n}');
        expect(flat(code)).toContain(' state OrderState @default(PAID)');
        expect(prismaErrors(code)).toBeNull();
      }
    );

    it.each([Database.PostgreSQL, Database.SQLite])(
      'writes the enum a string column comment ends in on %i',
      database => {
        const dataType = database === Database.SQLite ? 'TEXT' : 'text';
        const code = enumCode(
          {
            dataType,
            comment: 'Where it is order_status: pending | paid',
            default: "'paid'",
          },
          { database }
        );

        expect(code).toContain(
          'enum OrderStatus {\n  pending\n  paid\n\n  @@map("order_status")\n}'
        );
        expect(code).toContain('  /// Where it is\n');
        expect(flat(code)).toContain(' state OrderStatus @default(paid)');
        expect(code).not.toContain('order_status: pending');
        expect(prismaErrors(code)).toBeNull();
      }
    );

    it('writes a list of enum values', () => {
      const code = enumCode({
        dataType: 'text[]',
        comment: 'Role: USER | ADMIN',
        default: "ARRAY['USER']",
      });

      expect(flat(code)).toContain(' state Role[] @default([USER])');
      expect(prismaErrors(code)).toBeNull();
    });

    it('writes the enums in name order', () => {
      const code = enumCode({ dataType: 'text', comment: 'Zeta: A | B' }, {}, [
        { name: 'kind', dataType: 'text', comment: 'Alpha: A | B' },
      ]);

      expect(code.indexOf('enum Alpha')).toBeLessThan(
        code.indexOf('enum Zeta')
      );
      expect(prismaErrors(code)).toBeNull();
    });

    it('writes the enum once for every column that holds it', () => {
      const code = enumCode({ dataType: 'text', comment: 'Role: A | B' }, {}, [
        { name: 'backup', dataType: 'text', comment: 'Role: A | B' },
      ]);

      expect(code.match(/enum Role/g)).toHaveLength(1);
      expect(flat(code)).toContain(' backup Role?');
      expect(prismaErrors(code)).toBeNull();
    });

    it('keeps a column a String where its enum name holds other values', () => {
      const code = enumCode({ dataType: 'text', comment: 'Role: A | B' }, {}, [
        { name: 'backup', dataType: 'text', comment: 'Role: A | C' },
      ]);

      expect(flat(code)).toContain(' backup String?\n');
      expect(code).toContain('/// Role: A | C');
      expect(prismaErrors(code)).toBeNull();
    });

    it.each([
      ['a model holds', 'Order: A | B', NameCase.pascalCase],
      ['Prisma holds', 'string: A | B', NameCase.pascalCase],
      ['no identifier spells', 'order-kind: A | B', NameCase.none],
    ])(
      'keeps a column a String where its enum name %s',
      (_, comment, tableNameCase) => {
        const code = enumCode({ dataType: 'text', comment }, { tableNameCase });

        expect(code).not.toContain('enum ');
        expect(prismaErrors(code)).toBeNull();
      }
    );

    it('maps a value no identifier spells', () => {
      const code = enumCode(
        {
          dataType: "ENUM('in-progress','done')",
          default: "'in-progress'",
        },
        { database: Database.MySQL }
      );

      expect(code).toContain('  in_progress @map("in-progress")');
      expect(flat(code)).toContain('@default(in_progress)');
      expect(prismaErrors(code)).toBeNull();
    });

    it('passes a default that is no member through dbgenerated', () => {
      expect(
        enumCode({ dataType: 'text', comment: 'Role: A | B', default: "'C'" })
      ).toContain('@default(dbgenerated("\'C\'"))');
    });

    it.each([
      ['a type other than the plain string', { dataType: 'varchar(20)' }, {}],
      [
        'SQL Server, which has no enums',
        { dataType: 'nvarchar(1000)' },
        { database: Database.MSSQL },
      ],
      [
        'a dialect Prisma has no provider for',
        { dataType: 'VARCHAR2(255)' },
        { database: Database.Oracle },
      ],
    ] as Array<[string, Partial<Column>, Partial<RootState['settings']>]>)(
      'leaves an enum comment a comment on %s',
      (_, column, settings) => {
        const code = enumCode({ ...column, comment: 'Role: A | B' }, settings);

        expect(code).not.toContain('enum ');
        expect(code).toContain('/// Role: A | B');
      }
    );

    it('leaves the enum out of a single model', () => {
      const { table, columns } = keyedTable('t1', 'orders', [
        { name: 'state', dataType: 'text', comment: 'Role: A | B' },
      ]);
      const buffer: string[] = [];

      formatTable(createState({ tables: [table], columns }), { buffer, table });

      expect(buffer.join('\n')).not.toContain('enum ');
      expect(buffer.join('\n').replace(/ +/g, ' ')).toContain(' state Role?');
    });
  });

  describe('implicit many-to-many', () => {
    /** Posts and tags joined by a table in Prisma's implicit shape. */
    function joinState(
      joinName = '_PostToTag',
      change: (state: RootState) => void = () => {}
    ): RootState {
      const posts = keyedTable('t1', 'posts');
      const tags = keyedTable('t2', 'tags');
      const join = createTable({
        id: 'j',
        name: joinName,
        columnIds: ['j.a', 'j.b'],
      });
      const columns = ['A', 'B'].map(name =>
        createColumn({
          id: `j.${name.toLowerCase()}`,
          tableId: 'j',
          name,
          dataType: 'int',
          options: ColumnOption.notNull,
        })
      );
      const state = createState({
        tables: [posts.table, tags.table, join],
        columns: [...posts.columns, ...tags.columns, ...columns],
        relationships: [
          ['t1', 'j.a'],
          ['t2', 'j.b'],
        ].map(([tableId, columnId], index) =>
          createRelationship({
            id: `r${index}`,
            relationshipType: RelationshipType.ZeroN,
            start: { tableId, columnIds: [`${tableId}.id`] },
            end: { tableId: 'j', columnIds: [columnId] },
          })
        ),
        indexes: [
          createIndex({
            id: 'i1',
            tableId: 'j',
            unique: true,
            indexColumnIds: ['ic1', 'ic2'],
          }),
        ],
        indexColumns: [
          createIndexColumn({ id: 'ic1', indexId: 'i1', columnId: 'j.a' }),
          createIndexColumn({ id: 'ic2', indexId: 'i1', columnId: 'j.b' }),
        ],
      });
      change(state);
      return state;
    }
    const flat = (state: RootState) => createCode(state).replace(/ +/g, ' ');

    it('writes a list field on each model instead of the join table', () => {
      const state = joinState();
      const code = flat(state);

      expect(code).toContain(' tags Tag[]\n');
      expect(code).toContain(' posts Post[]\n');
      expect(code).not.toContain('_PostToTag');
      expect(prismaErrors(createCode(state))).toBeNull();
    });

    it('names the relation after a join table of another name', () => {
      const state = joinState('_Tagging');
      const code = flat(state);

      expect(code).toContain(' tags Tag[] @relation("Tagging")');
      expect(code).toContain(' posts Post[] @relation("Tagging")');
      expect(prismaErrors(createCode(state))).toBeNull();
    });

    it.each([
      ['a name without the underscore', joinState('PostToTag')],
      [
        'A and B the other way round',
        joinState('_PostToTag', state => {
          state.collections.tableEntities.t1.name = 'zebras';
        }),
      ],
      [
        'a third column',
        joinState('_PostToTag', state => {
          state.collections.tableEntities.j.columnIds.push('j.c');
          state.collections.tableColumnEntities['j.c'] = createColumn({
            id: 'j.c',
            tableId: 'j',
            name: 'C',
            dataType: 'int',
          });
        }),
      ],
      [
        'a column not named A',
        joinState('_PostToTag', state => {
          state.collections.tableColumnEntities['j.a'].name = 'post_id';
        }),
      ],
      [
        'an optional column',
        joinState('_PostToTag', state => {
          state.collections.tableColumnEntities['j.a'].options = 0;
        }),
      ],
      [
        'a column of another type than its key',
        joinState('_PostToTag', state => {
          state.collections.tableColumnEntities['j.a'].dataType = 'bigint';
        }),
      ],
      [
        'a key of two columns',
        joinState('_PostToTag', state => {
          state.collections.tableColumnEntities['t1.id'].options = 0;
        }),
      ],
      [
        'a relationship it starts',
        joinState('_PostToTag', state => {
          state.doc.relationshipIds.push('r9');
          state.collections.relationshipEntities.r9 = createRelationship({
            id: 'r9',
            start: { tableId: 'j', columnIds: ['j.a'] },
            end: { tableId: 't2', columnIds: ['t2.id'] },
          });
        }),
      ],
      [
        'a field already named as the list',
        joinState('_PostToTag', state => {
          state.collections.tableEntities.t1.columnIds.push('t1.tags');
          state.collections.tableColumnEntities['t1.tags'] = createColumn({
            id: 't1.tags',
            tableId: 't1',
            name: 'tags',
            dataType: 'text',
          });
        }),
      ],
    ])('keeps the join table a model where it has %s', (_, state) => {
      expect(createCode(state)).toMatch(/\nmodel PostToTag \{/);
    });

    it('keeps the join table of a model and itself a model', () => {
      const state = joinState('_Follows', state => {
        const relationship = state.collections.relationshipEntities.r1;
        relationship.start = {
          ...relationship.start,
          tableId: 't1',
          columnIds: ['t1.id'],
        };
      });

      expect(createCode(state)).toContain('@@map("_Follows")');
      expect(prismaErrors(createCode(state))).toBeNull();
    });

    it('comes back from an import of an implicit many-to-many', () => {
      const ctx = createEngineContext({ toWidth: text => text.length * 10 });
      const source = `datasource db {
  provider = "postgresql"
}
model Post {
  id   Int   @id
  tags Tag[] @relation("Tagging")
}
model Tag {
  id    Int    @id
  posts Post[] @relation("Tagging")
}
`;
      const code = createCode(
        JSON.parse(schemaPrismaParserToSchemaJson(source, ctx)) as RootState
      );
      const result = parsePrismaModel(code);
      if (!result.ok) throw new Error(result.message);

      expect(
        result.model.tables.map(table => [
          table.name,
          table.fields.map(
            field => `${field.name}:${field.typeName}[]:${field.relationName}`
          ),
        ])
      ).toEqual([
        ['Post', ['id:Int[]:', 'tags:Tag[]:Tagging']],
        ['Tag', ['id:Int[]:', 'posts:Post[]:Tagging']],
      ]);
      expect(prismaErrors(code)).toBeNull();
    });
  });

  describe('indexes', () => {
    function indexedCode(
      index: Partial<Index>,
      indexColumns: Array<Partial<IndexColumn>>
    ): string {
      const { table, columns } = keyedTable('t1', 'user', [
        { name: 'a', options: ColumnOption.notNull },
        { name: 'b', options: ColumnOption.notNull },
      ]);
      const other = keyedTable('t2', 'other');
      const entries = indexColumns.map((indexColumn, position) =>
        createIndexColumn({
          id: `ic${position}`,
          indexId: 'i1',
          ...indexColumn,
        })
      );

      return createCode(
        createState({
          tables: [table, other.table],
          columns: [...columns, ...other.columns],
          indexes: [
            createIndex({
              id: 'i1',
              tableId: 't1',
              indexColumnIds: entries.map(entry => entry.id),
              ...index,
            }),
          ],
          indexColumns: entries,
        })
      );
    }

    it('writes an index', () => {
      const code = indexedCode({}, [
        { columnId: 't1.c0' },
        { columnId: 't1.c1' },
      ]);

      expect(code).toContain('  @@index([a, b])\n');
      expect(prismaErrors(code)).toBeNull();
    });

    it('writes a unique index with its name', () => {
      const code = indexedCode({ unique: true, name: 'uq_ab' }, [
        { columnId: 't1.c0' },
        { columnId: 't1.c1' },
      ]);

      expect(code).toContain('  @@unique([a, b], map: "uq_ab")\n');
      expect(prismaErrors(code)).toBeNull();
    });

    it('writes a descending column', () => {
      const code = indexedCode({}, [
        { columnId: 't1.c0', orderType: OrderType.DESC },
      ]);

      expect(code).toContain('  @@index([a(sort: Desc)])\n');
      expect(prismaErrors(code)).toBeNull();
    });

    it('drops a column of another table or none, and an index left empty', () => {
      expect(
        indexedCode({}, [{ columnId: 't2.id' }, { columnId: 'gone' }])
      ).not.toContain('@@index');
    });
  });

  describe('relationships', () => {
    it('writes both relation fields of a one-to-many', () => {
      const state = relationshipState();

      expect(relationLines(state)).toEqual([
        'user User @relation(fields: [userId], references: [id])',
        'posts Post[]',
      ]);
      expect(prismaErrors(createCode(state))).toBeNull();
    });

    it('makes the relation optional where the foreign key is', () => {
      const state = relationshipState({}, { options: 0 });

      expect(relationLines(state)[0]).toBe(
        'user User? @relation(fields: [userId], references: [id])'
      );
      expect(prismaErrors(createCode(state))).toBeNull();
    });

    it('writes a one-to-one over a unique foreign key', () => {
      const state = relationshipState(
        { relationshipType: RelationshipType.ZeroOne },
        { options: ColumnOption.notNull | ColumnOption.unique }
      );

      expect(relationLines(state)).toEqual([
        'user User @relation(fields: [userId], references: [id])',
        'post Post?',
      ]);
      expect(prismaErrors(createCode(state))).toBeNull();
    });

    it('writes a one-to-one over a foreign key that is the key', () => {
      const state = relationshipState(
        {
          relationshipType: RelationshipType.OneOnly,
          end: { tableId: 't2', columnIds: ['t2.id'] },
        },
        {}
      );

      expect(relationLines(state)).toEqual([
        'user User @relation(fields: [id], references: [id])',
        'post Post?',
      ]);
      expect(prismaErrors(createCode(state))).toBeNull();
    });

    it('writes a composite foreign key in order', () => {
      const parent = keyedTable('t1', 'users', [
        { name: 'tenant', options: ID_OPTIONS },
      ]);
      const child = keyedTable('t2', 'posts', [
        { name: 'user_id', options: ColumnOption.notNull },
        { name: 'user_tenant', options: ColumnOption.notNull },
      ]);
      const state = createState({
        tables: [parent.table, child.table],
        columns: [...parent.columns, ...child.columns],
        relationships: [
          createRelationship({
            id: 'r1',
            relationshipType: RelationshipType.OneN,
            start: { tableId: 't1', columnIds: ['t1.id', 't1.c0'] },
            end: { tableId: 't2', columnIds: ['t2.c0', 't2.c1'] },
          }),
        ],
      });

      expect(relationLines(state)[0]).toBe(
        'user User @relation(fields: [userId, userTenant], references: [id, tenant])'
      );
      expect(prismaErrors(createCode(state))).toBeNull();
    });

    it('names the list field in the plural of the model, irregular ones too', () => {
      const companies = keyedTable('t1', 'companies');
      const people = keyedTable('t2', 'people', [
        { name: 'company_id', options: ColumnOption.notNull },
      ]);
      const state = createState({
        tables: [companies.table, people.table],
        columns: [...companies.columns, ...people.columns],
        relationships: [
          createRelationship({
            id: 'r1',
            relationshipType: RelationshipType.ZeroN,
            start: { tableId: 't1', columnIds: ['t1.id'] },
            end: { tableId: 't2', columnIds: ['t2.c0'] },
          }),
        ],
      });
      const code = createCode(state);
      const flat = code.replace(/ +/g, ' ');

      expect(flat).toContain(
        ' company Company @relation(fields: [companyId], references: [id])'
      );
      expect(flat).toContain(' people Person[]\n');
      expect(prismaErrors(code)).toBeNull();
    });

    it('pluralizes no plural where the name case keeps the table name', () => {
      const state = relationshipState();
      state.settings.tableNameCase = NameCase.none;
      const code = createCode(state);
      const flat = code.replace(/ +/g, ' ');

      expect(flat).toContain(
        ' user users @relation(fields: [userId], references: [id])'
      );
      expect(flat).toContain(' posts posts[]\n');
      expect(prismaErrors(code)).toBeNull();
    });

    it('references a unique index of the parent', () => {
      const state = relationshipState(
        { start: { tableId: 't1', columnIds: ['t1.c0'] } },
        {},
        {
          columns: [],
          indexes: [
            createIndex({
              id: 'i1',
              tableId: 't1',
              unique: true,
              indexColumnIds: ['ic1'],
            }),
          ],
          indexColumns: [
            createIndexColumn({ id: 'ic1', indexId: 'i1', columnId: 't1.c0' }),
          ],
        }
      );
      const users = state.collections.tableEntities.t1;
      const code = createCode({
        ...state,
        collections: {
          ...state.collections,
          tableEntities: {
            ...state.collections.tableEntities,
            t1: { ...users, columnIds: [...users.columnIds, 't1.c0'] },
          },
          tableColumnEntities: {
            ...state.collections.tableColumnEntities,
            't1.c0': createColumn({
              id: 't1.c0',
              tableId: 't1',
              name: 'code',
              dataType: 'int',
              options: ColumnOption.notNull,
            }),
          },
        },
      });

      expect(code).toContain('@relation(fields: [userId], references: [code])');
      expect(prismaErrors(code)).toBeNull();
    });

    describe('naming an ambiguous relation after its foreign key', () => {
      /** Employees managed by another employee, and a backup each may name. */
      function selfState(database: number = Database.PostgreSQL): RootState {
        const { table, columns } = keyedTable('t1', 'employees', [
          { name: 'manager_id' },
          { name: 'backup_id', options: ColumnOption.unique },
        ]);

        return createState({
          tables: [table],
          columns,
          relationships: [
            createRelationship({
              id: 'r1',
              relationshipType: RelationshipType.ZeroN,
              start: { tableId: 't1', columnIds: ['t1.id'] },
              end: { tableId: 't1', columnIds: ['t1.c0'] },
            }),
            createRelationship({
              id: 'r2',
              relationshipType: RelationshipType.ZeroOne,
              start: { tableId: 't1', columnIds: ['t1.id'] },
              end: { tableId: 't1', columnIds: ['t1.c1'] },
            }),
          ],
          settings: { database },
        });
      }

      /** Threads each written by one user and edited by another. */
      function pairState(database: number = Database.PostgreSQL): RootState {
        const users = keyedTable('t1', 'users');
        const threads = keyedTable('t2', 'threads', [
          { name: 'author_id', options: ColumnOption.notNull },
          { name: 'editor_id' },
        ]);

        return createState({
          tables: [users.table, threads.table],
          columns: [...users.columns, ...threads.columns],
          relationships: ['t2.c0', 't2.c1'].map((columnId, index) =>
            createRelationship({
              id: `r${index}`,
              relationshipType: RelationshipType.ZeroN,
              start: { tableId: 't1', columnIds: ['t1.id'] },
              end: { tableId: 't2', columnIds: [columnId] },
            })
          ),
          settings: { database },
        });
      }

      const namedLines = (state: RootState) =>
        createCode(state)
          .split('\n')
          .map(line => line.trim().replace(/ +/g, ' '))
          .filter(line => line.includes('@relation('));

      it('writes a self-relation on either cardinality', () => {
        const state = selfState();

        expect(namedLines(state)).toEqual([
          'manager Employee? @relation("EmployeeManager", fields: [managerId], references: [id])',
          'managerEmployees Employee[] @relation("EmployeeManager")',
          'backup Employee? @relation("EmployeeBackup", fields: [backupId], references: [id])',
          'backupEmployee Employee? @relation("EmployeeBackup")',
        ]);
        expect(prismaErrors(createCode(state))).toBeNull();
      });

      it('writes two relations between one pair of models', () => {
        const state = pairState();

        expect(namedLines(state)).toEqual([
          'author User @relation("ThreadAuthor", fields: [authorId], references: [id])',
          'editor User? @relation("ThreadEditor", fields: [editorId], references: [id])',
          'authorThreads Thread[] @relation("ThreadAuthor")',
          'editorThreads Thread[] @relation("ThreadEditor")',
        ]);
        expect(prismaErrors(createCode(state))).toBeNull();
      });

      it.each([
        Database.MySQL,
        Database.MariaDB,
        Database.SQLite,
        Database.MSSQL,
      ])('writes both kinds that Prisma validates on dialect %i', database => {
        expect(prismaErrors(createCode(selfState(database)))).toBeNull();
        expect(prismaErrors(createCode(pairState(database)))).toBeNull();
      });

      it('makes them NoAction on SQL Server, which refuses a cascade there', () => {
        const code = createCode(pairState(Database.MSSQL));

        expect(code).toContain(
          '@relation("ThreadAuthor", fields: [authorId], references: [id], onDelete: NoAction, onUpdate: NoAction)'
        );
        expect(createCode(selfState(Database.MSSQL))).toContain(
          'references: [id], onDelete: NoAction, onUpdate: NoAction)'
        );
      });

      it('leaves an unambiguous relation on SQL Server at its defaults', () => {
        const state = relationshipState();
        state.settings.database = Database.MSSQL;

        expect(createCode(state)).not.toContain('NoAction');
      });

      it('takes the stem of a snake_case key the name case keeps', () => {
        const state = pairState();
        state.settings.columnNameCase = NameCase.none;

        expect(namedLines(state)[0]).toBe(
          'author User @relation("ThreadAuthor", fields: [author_id], references: [id])'
        );
      });

      it.each([
        ['owner', 'userByOwner'],
        ['paid', 'userByPaid'],
      ])(
        'names the relation after the parent where the key %s has no Id',
        (name, childName) => {
          const state = pairState();
          state.collections.tableColumnEntities['t2.c0'].name = name;

          expect(namedLines(state)[0]).toMatch(
            new RegExp(
              `^${childName} User @relation\\("Thread${childName[0].toUpperCase()}${childName.slice(1)}"`
            )
          );
          expect(prismaErrors(createCode(state))).toBeNull();
        }
      );

      it('names the relation after the parent and every column of a composite key', () => {
        const parent = keyedTable('t1', 'users', [
          { name: 'tenant', options: ID_OPTIONS },
        ]);
        const child = keyedTable('t2', 'posts', [
          { name: 'owner_id', options: ColumnOption.notNull },
          { name: 'owner_tenant', options: ColumnOption.notNull },
          { name: 'editor_id' },
          { name: 'editor_tenant' },
        ]);
        const state = createState({
          tables: [parent.table, child.table],
          columns: [...parent.columns, ...child.columns],
          relationships: [
            ['t2.c0', 't2.c1'],
            ['t2.c2', 't2.c3'],
          ].map((columnIds, index) =>
            createRelationship({
              id: `r${index}`,
              relationshipType: RelationshipType.ZeroN,
              start: { tableId: 't1', columnIds: ['t1.id', 't1.c0'] },
              end: { tableId: 't2', columnIds },
            })
          ),
        });

        expect(namedLines(state).slice(0, 2)).toEqual([
          'userByOwnerIdOwnerTenant User @relation("PostUserByOwnerIdOwnerTenant", fields: [ownerId, ownerTenant], references: [id, tenant])',
          'userByEditorIdEditorTenant User? @relation("PostUserByEditorIdEditorTenant", fields: [editorId, editorTenant], references: [id, tenant])',
        ]);
        expect(prismaErrors(createCode(state))).toBeNull();
      });

      it("falls back on the model's name where a column holds the key's", () => {
        const state = pairState();
        const threads = state.collections.tableEntities.t2;
        threads.columnIds.push('t2.c9');
        state.collections.tableColumnEntities['t2.c9'] = createColumn({
          id: 't2.c9',
          tableId: 't2',
          name: 'author',
          dataType: 'int',
        });
        const code = createCode(state);

        expect(namedLines(state)).toEqual([
          'userByAuthorId User @relation("ThreadUserByAuthorId", fields: [authorId], references: [id])',
          'editor User? @relation("ThreadEditor", fields: [editorId], references: [id])',
          'userByAuthorIdThreads Thread[] @relation("ThreadUserByAuthorId")',
          'editorThreads Thread[] @relation("ThreadEditor")',
        ]);
        expect(prismaErrors(code)).toBeNull();
      });
    });

    describe('leaving out what is still deferred, keeping the keys', () => {
      const expectDeferred = (state: RootState) => {
        const code = createCode(state);

        expect(code).not.toContain('@relation');
        expect(code).toMatch(/ userId +(Int|BigInt)\??( |\n)/);
        expect(prismaErrors(code)).toBeNull();
      };

      it('a one-to-one over a foreign key that is not unique', () => {
        expectDeferred(
          relationshipState({ relationshipType: RelationshipType.ZeroOne })
        );
      });

      it('one that references no unique column', () => {
        const state = relationshipState({
          start: { tableId: 't1', columnIds: ['t1.c0'] },
        });
        state.collections.tableEntities.t1.columnIds.push('t1.c0');
        state.collections.tableColumnEntities['t1.c0'] = createColumn({
          id: 't1.c0',
          tableId: 't1',
          name: 'code',
          dataType: 'int',
          options: ColumnOption.notNull,
        });

        expectDeferred(state);
      });

      it('one whose keys differ in type', () => {
        expectDeferred(relationshipState({}, { dataType: 'bigint' }));
      });

      it('one whose keys differ in native type', () => {
        const state = relationshipState({}, { dataType: 'int2' });

        expect(createCode(state)).not.toContain('@relation');
        expect(prismaErrors(createCode(state))).toBeNull();
      });

      it.each([
        ['Prisma has no type for', 'tsvector'],
        ['that are lists', 'integer[]'],
      ])('one whose keys %s', (_, dataType) => {
        const state = relationshipState({}, { dataType });
        state.collections.tableColumnEntities['t1.id'].dataType = dataType;

        expect(createCode(state)).not.toContain('@relation');
      });

      it("one whose child holds both the key's name and the model's", () => {
        const state = relationshipState(
          {},
          {},
          {
            columns: [
              createColumn({
                id: 't2.c9',
                tableId: 't2',
                name: 'user',
                dataType: 'int',
              }),
            ],
          }
        );
        state.collections.tableEntities.t2.columnIds.push('t2.c9');

        expectDeferred(state);
      });

      it('one whose parent already has a field of the relation field name', () => {
        const state = relationshipState(
          {},
          {},
          {
            columns: [
              createColumn({
                id: 't1.c9',
                tableId: 't1',
                name: 'posts',
                dataType: 'int',
              }),
            ],
          }
        );
        state.collections.tableEntities.t1.columnIds.push('t1.c9');

        expectDeferred(state);
      });

      it.each([
        ['no column', { end: { tableId: 't2', columnIds: [] } }],
        ['a missing column', { end: { tableId: 't2', columnIds: ['gone'] } }],
        [
          "another table's column",
          { end: { tableId: 't2', columnIds: ['t1.id'] } },
        ],
        [
          'more columns than the parent',
          { end: { tableId: 't2', columnIds: ['t2.c0', 't2.id'] } },
        ],
        ['an unknown cardinality', { relationshipType: 0 }],
        ['a table the document lacks', { start: { tableId: 'gone' } }],
      ] as Array<[string, DeepPartial<Relationship>]>)(
        'one with %s',
        (_, relationship) => {
          expectDeferred(relationshipState(relationship));
        }
      );
    });
  });

  describe('a round trip through the Prisma importer', () => {
    const SOURCE = `datasource db {
  provider = "postgresql"
}

/// People who sign in
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique @db.VarChar(255)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  roles     String[] @default(["member"])
  settings  Json     @default("{}")
  search    Unsupported("tsvector")?
  posts     Post[]   @relation("WrittenPosts")
  edited    Post[]   @relation("EditedPosts")
  profile   Profile?

  @@map("users")
}

model Profile {
  userId Int    @id @map("user_id")
  bio    String @default("")
  user   User   @relation(fields: [userId], references: [id])

  @@map("profiles")
}

model Post {
  id        Int     @id @default(autoincrement())
  authorId  Int?    @map("author_id")
  editorId  Int?    @map("editor_id")
  replyToId Int?    @map("reply_to_id")
  title     String  @db.VarChar(200)
  price     Decimal @default(0) @db.Decimal(10, 2)
  author    User?   @relation("WrittenPosts", fields: [authorId], references: [id])
  editor    User?   @relation("EditedPosts", fields: [editorId], references: [id])
  replyTo   Post?   @relation("Replies", fields: [replyToId], references: [id])
  replies   Post[]  @relation("Replies")

  @@index([authorId, title(sort: Desc)], map: "idx_posts_author")
  @@map("posts")
}
`;

    const ctx = createEngineContext({ toWidth: text => text.length * 10 });
    const state = JSON.parse(
      schemaPrismaParserToSchemaJson(SOURCE, ctx)
    ) as RootState;
    const code = createCode(state);

    it('writes a schema Prisma validates', () => {
      expect(prismaErrors(code)).toBeNull();
    });

    it('gives back every table, column and relation', () => {
      const result = parsePrismaModel(code);
      if (!result.ok) throw new Error(result.message);
      const models = new Set(result.model.tables.map(table => table.name));
      const shape = result.model.tables.map(table => ({
        table: table.dbName || table.name,
        columns: table.fields
          .filter(entry => !models.has(entry.typeName))
          .map(entry => entry.dbName || entry.name),
        relations: table.fields
          .filter(entry => entry.relationFields.length)
          .map(
            entry => `${entry.relationFields} -> ${entry.relationReferences}`
          ),
      }));

      expect(shape).toEqual([
        {
          table: 'posts',
          columns: [
            'id',
            'author_id',
            'editor_id',
            'reply_to_id',
            'title',
            'price',
          ],
          relations: ['authorId -> id', 'editorId -> id', 'replyToId -> id'],
        },
        {
          table: 'profiles',
          columns: ['user_id', 'bio'],
          relations: ['userId -> id'],
        },
        {
          table: 'users',
          columns: ['id', 'email', 'created_at', 'roles', 'settings', 'search'],
          relations: [],
        },
      ]);
      expect(code).toContain('/// People who sign in');
      expect(code).toContain(
        '@@index([authorId, title(sort: Desc)], map: "idx_posts_author")'
      );
    });

    it('gives back every field type, native type, list and default', () => {
      const original = parsePrismaModel(SOURCE);
      const result = parsePrismaModel(code);
      if (!original.ok || !result.ok) throw new Error('expected both to parse');
      const types = (tables: PrismaTable[]) =>
        tables.flatMap(table =>
          table.fields
            .filter(entry => !/^(User|Post|Profile)$/.test(entry.typeName))
            .map(
              entry =>
                `${table.dbName}.${entry.dbName || entry.name} ${entry.typeName}${
                  entry.list ? '[]' : ''
                }${entry.optional ? '?' : ''} ${entry.nativeType?.name ?? ''}(${
                  entry.nativeType?.args ?? ''
                }) ${entry.default}`
            )
        );

      expect(types(result.model.tables).sort()).toEqual(
        types(original.model.tables).sort()
      );
    });

    it('keeps the relation field names a foreign key carries and renames the rest', () => {
      const result = parsePrismaModel(code);
      if (!result.ok) throw new Error(result.message);
      const relationFields = Object.fromEntries(
        result.model.tables.map(table => [
          table.dbName,
          table.fields
            .filter(entry => /^(User|Post|Profile)$/.test(entry.typeName))
            .map(entry => `${entry.name}:${entry.relationName}`),
        ])
      );

      // Every field the source named after its key or its model comes back;
      // the diagram kept no relation names and no custom back field names
      // (posts, edited, replies), so those follow the foreign key instead.
      expect(relationFields).toEqual({
        posts: [
          'author:PostAuthor',
          'editor:PostEditor',
          'replyTo:PostReplyTo',
          'replyToPosts:PostReplyTo',
        ],
        profiles: ['user:'],
        users: ['profile:', 'authorPosts:PostAuthor', 'editorPosts:PostEditor'],
      });
    });
  });
});
