import { ERDEditorSchemaV3 } from '@dineug/erd-editor-schema';
import { describe, expect, it } from 'vite-plus/test';

import { CANVAS_SIZE_MAX, CANVAS_SIZE_MIN, Database } from '@/constants/schema';
import { createEngineContext } from '@/engine/context';
import { Column } from '@/internal-types';
import { schemaPrismaParserToSchemaJson } from '@/utils/schema-prisma-parser';

type Schema = Pick<
  ERDEditorSchemaV3,
  '$schema' | 'version' | 'settings' | 'doc' | 'collections'
>;

const ctx = createEngineContext({ toWidth: text => text.length * 10 });

function parse(
  prisma: string,
  prepare?: (schema: ERDEditorSchemaV3) => ERDEditorSchemaV3
): Schema {
  return JSON.parse(schemaPrismaParserToSchemaJson(prisma, ctx, prepare));
}

const withDatabase =
  (database: number) =>
  (schema: ERDEditorSchemaV3): ERDEditorSchemaV3 => {
    schema.settings.database = database;
    return schema;
  };

const columnsOf = (schema: Schema): Column[] =>
  schema.doc.tableIds.flatMap(tableId =>
    schema.collections.tableEntities[tableId].columnIds.map(
      columnId => schema.collections.tableColumnEntities[columnId]
    )
  );

const dataTypes = (schema: Schema): Record<string, string> =>
  Object.fromEntries(
    columnsOf(schema).map(column => [column.name, column.dataType])
  );

const tableNames = (schema: Schema): string[] =>
  schema.doc.tableIds.map(id => schema.collections.tableEntities[id].name);

const models = (count: number): string =>
  Array.from(
    { length: count },
    (_, index) => `model M${index} {\n  id Int @id\n}`
  ).join('\n');

const withProvider = (provider: string, body: string): string =>
  `datasource db {\n  provider = "${provider}"\n}\n${body}`;

const SIMPLE = `model User {
  id   Int    @id
  name String
}`;

const NATIVE = `model User {
  id    String @id @db.Uuid
  email String @db.VarChar(80)
}`;

describe('schemaPrismaParserToSchemaJson', () => {
  it('returns a formatted JSON string, not an object', () => {
    const json = schemaPrismaParserToSchemaJson(SIMPLE, ctx);

    expect(typeof json).toBe('string');
    expect(json).toContain('\n  "version": "3.0.0"');
  });

  it('produces a v3 envelope', () => {
    const schema = parse(SIMPLE);

    expect(schema.version).toBe('3.0.0');
    expect(schema.$schema).toContain('schema.json');
    expect(Object.keys(schema).sort()).toEqual([
      '$schema',
      'collections',
      'doc',
      'settings',
      'version',
    ]);
  });

  it('reads the document', () => {
    const schema = parse(SIMPLE);

    expect(tableNames(schema)).toEqual(['User']);
    expect(columnsOf(schema).map(column => column.name)).toEqual([
      'id',
      'name',
    ]);
  });

  it('carries the relationships and the tables Prisma creates for them', () => {
    const schema = parse(`model Post {
  id   Int   @id
  tags Tag[]
}
model Tag {
  id    Int    @id
  posts Post[]
}`);

    expect(tableNames(schema)).toEqual(['Post', 'Tag', '_PostToTag']);
    expect(schema.doc.relationshipIds).toHaveLength(2);
  });

  describe('canvas size', () => {
    it('grows with the table count', () => {
      expect(parse(models(40)).settings.width).toBe(4000);
    });

    it('never falls below the minimum', () => {
      expect(parse(SIMPLE).settings.width).toBe(CANVAS_SIZE_MIN);
    });

    it('never rises above the maximum', () => {
      expect(parse(models(300)).settings.height).toBe(CANVAS_SIZE_MAX);
    });
  });

  describe('the dialect', () => {
    it("takes the provider's, since the native types are written for it", () => {
      const schema = parse(
        withProvider('postgresql', NATIVE),
        withDatabase(Database.MySQL)
      );

      expect(schema.settings.database).toBe(Database.PostgreSQL);
      expect(dataTypes(schema)).toEqual({ id: 'uuid', email: 'varchar(80)' });
    });

    it('takes PostgreSQL for CockroachDB, which the editor has no dialect for', () => {
      expect(
        parse(withProvider('cockroachdb', SIMPLE), withDatabase(Database.MySQL))
          .settings.database
      ).toBe(Database.PostgreSQL);
    });

    it('keeps a MariaDB document MariaDB for mysql', () => {
      expect(
        parse(withProvider('mysql', SIMPLE), withDatabase(Database.MariaDB))
          .settings.database
      ).toBe(Database.MariaDB);
    });

    it("keeps the editor's when the file names no provider", () => {
      const schema = parse(NATIVE, withDatabase(Database.MSSQL));

      expect(schema.settings.database).toBe(Database.MSSQL);
      expect(dataTypes(schema)).toEqual({
        id: 'nvarchar(1000)',
        email: 'varchar(80)',
      });
    });

    it("keeps the editor's for MongoDB, which has no relational dialect", () => {
      expect(
        parse(withProvider('mongodb', SIMPLE), withDatabase(Database.Oracle))
          .settings.database
      ).toBe(Database.Oracle);
    });

    it('defaults to the schema settings when prepare is not given', () => {
      expect(parse(SIMPLE).settings.database).toBe(Database.MySQL);
    });
  });

  describe('the prepare callback', () => {
    it('keeps the other settings it is handed', () => {
      const schema = parse(withProvider('sqlite', SIMPLE), incoming => {
        incoming.settings.databaseName = 'shop';
        return incoming;
      });

      expect(schema.settings.databaseName).toBe('shop');
      expect(schema.settings.database).toBe(Database.SQLite);
    });

    it('keeps the canvas size the importer computed', () => {
      expect(
        parse(SIMPLE, incoming => {
          incoming.settings.databaseName = 'shop';
          return incoming;
        }).settings.width
      ).toBe(CANVAS_SIZE_MIN);
    });
  });

  describe('degrading rather than throwing', () => {
    it('produces an empty document for an empty string', () => {
      expect(parse('').doc.tableIds).toEqual([]);
    });

    it('produces an empty document for text that is not Prisma', () => {
      expect(parse('not prisma at all { ] }').doc.tableIds).toEqual([]);
    });

    it('keeps the models around a line it cannot read', () => {
      expect(
        tableNames(
          parse(
            'model A {\n  id Int @id\n}\n!! garbage\nmodel B {\n  id Int @id\n}'
          )
        )
      ).toEqual(['A', 'B']);
    });

    // Every string degrades rather than throwing; only a source that is not a
    // string at all reaches parsePrismaModel's own catch and this empty model.
    it('produces an empty document when the source itself is not a string', () => {
      const schema = parse(
        null as unknown as string,
        withDatabase(Database.SQLite)
      );

      expect(schema.doc.tableIds).toEqual([]);
      expect(schema.settings.width).toBe(CANVAS_SIZE_MIN);
      expect(schema.settings.database).toBe(Database.SQLite);
    });
  });
});
