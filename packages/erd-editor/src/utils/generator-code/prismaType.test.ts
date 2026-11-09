// @vitest-environment node
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vite-plus/test';

import { Database } from '@/constants/schema';
import { resolvePrismaType } from '@/utils/generator-code/prismaType';

const prismaSchemaWasm = createRequire(import.meta.url)(
  '@prisma/prisma-schema-wasm'
) as { validate: (params: string) => void };

/** A model with one field per type, which Prisma's own engine must take. */
function prismaErrors(provider: string, types: string[]): string | null {
  const source = [
    `datasource db {\n  provider = "${provider}"\n}`,
    'model T {',
    '  id Int @id',
    ...types.map((type, index) => `  f${index} ${type}`),
    '}',
  ].join('\n');

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

/** The field type a column type resolves to, native attribute and all. */
const typeOf = (dataType: string, database: number) => {
  const { scalar, native, list } = resolvePrismaType(dataType, database);
  return `${scalar}${list ? '[]' : ''}${native ? ` @db.${native}` : ''}`;
};

const POSTGRESQL_TYPES: Array<[string, string]> = [
  ['integer', 'Int'],
  ['int4', 'Int'],
  ['serial', 'Int'],
  ['smallint', 'Int @db.SmallInt'],
  ['bigint', 'BigInt'],
  ['bigserial', 'BigInt'],
  ['oid', 'Int @db.Oid'],
  ['numeric(10,2)', 'Decimal @db.Decimal(10, 2)'],
  ['decimal(65,30)', 'Decimal'],
  ['numeric', 'Decimal @db.Decimal'],
  ['numeric(7)', 'Decimal @db.Decimal(7, 0)'],
  ['money', 'Decimal @db.Money'],
  ['real', 'Float @db.Real'],
  ['double precision', 'Float'],
  ['float8', 'Float'],
  ['float(53)', 'Float'],
  ['varchar(200)', 'String @db.VarChar(200)'],
  ['character varying(10)', 'String @db.VarChar(10)'],
  ['varchar', 'String @db.VarChar'],
  ['char(13)', 'String @db.Char(13)'],
  ['text', 'String'],
  ['citext', 'String @db.Citext'],
  ['uuid', 'String @db.Uuid'],
  ['inet', 'String @db.Inet'],
  ['xml', 'String @db.Xml'],
  ['bit(8)', 'String @db.Bit(8)'],
  ['varbit(8)', 'String @db.VarBit(8)'],
  ['boolean', 'Boolean'],
  ['bool', 'Boolean'],
  ['bytea', 'Bytes'],
  ['timestamp(3)', 'DateTime'],
  ['timestamp', 'DateTime @db.Timestamp'],
  ['timestamp(6) without time zone', 'DateTime @db.Timestamp(6)'],
  ['timestamptz(6)', 'DateTime @db.Timestamptz(6)'],
  ['timestamp with time zone', 'DateTime @db.Timestamptz'],
  ['date', 'DateTime @db.Date'],
  ['time(3)', 'DateTime @db.Time(3)'],
  ['timetz', 'DateTime @db.Timetz'],
  ['jsonb', 'Json'],
  ['json', 'Json @db.Json'],
  ['text[]', 'String[]'],
  ['varchar(10)[]', 'String[] @db.VarChar(10)'],
  ['integer []', 'Int[]'],
];

const MYSQL_TYPES: Array<[string, string]> = [
  ['INT', 'Int'],
  ['INTEGER', 'Int'],
  ['INT(11)', 'Int'],
  ['INT(10) UNSIGNED', 'Int @db.UnsignedInt'],
  ['SMALLINT', 'Int @db.SmallInt'],
  ['SMALLINT UNSIGNED', 'Int @db.UnsignedSmallInt'],
  ['TINYINT', 'Int @db.TinyInt'],
  ['TINYINT(4)', 'Int @db.TinyInt'],
  ['TINYINT UNSIGNED', 'Int @db.UnsignedTinyInt'],
  ['MEDIUMINT', 'Int @db.MediumInt'],
  ['MEDIUMINT UNSIGNED', 'Int @db.UnsignedMediumInt'],
  ['BIGINT', 'BigInt'],
  ['BIGINT UNSIGNED', 'BigInt @db.UnsignedBigInt'],
  ['SERIAL', 'BigInt @db.UnsignedBigInt'],
  ['YEAR', 'Int @db.Year'],
  ['TINYINT(1)', 'Boolean'],
  ['BOOLEAN', 'Boolean'],
  ['BOOL', 'Boolean'],
  ['BIT(1)', 'Boolean'],
  ['BIT(8)', 'Bytes @db.Bit(8)'],
  ['DECIMAL(12,2)', 'Decimal @db.Decimal(12, 2)'],
  ['DECIMAL(65,30)', 'Decimal'],
  ['NUMERIC(5)', 'Decimal @db.Decimal(5, 0)'],
  ['FLOAT', 'Float @db.Float'],
  ['DOUBLE', 'Float'],
  ['DOUBLE PRECISION', 'Float'],
  ['CHAR(2)', 'String @db.Char(2)'],
  ['VARCHAR(191)', 'String'],
  ['VARCHAR(255)', 'String @db.VarChar(255)'],
  ['VARCHAR', 'String'],
  ['TINYTEXT', 'String @db.TinyText'],
  ['TEXT', 'String @db.Text'],
  ['MEDIUMTEXT', 'String @db.MediumText'],
  ['LONGTEXT', 'String @db.LongText'],
  ['BINARY(16)', 'Bytes @db.Binary(16)'],
  ['VARBINARY(16)', 'Bytes @db.VarBinary(16)'],
  ['TINYBLOB', 'Bytes @db.TinyBlob'],
  ['BLOB', 'Bytes @db.Blob'],
  ['MEDIUMBLOB', 'Bytes @db.MediumBlob'],
  ['LONGBLOB', 'Bytes'],
  ['DATE', 'DateTime @db.Date'],
  ['TIME', 'DateTime @db.Time'],
  ['DATETIME(3)', 'DateTime'],
  ['DATETIME', 'DateTime @db.DateTime'],
  ['DATETIME(0)', 'DateTime @db.DateTime(0)'],
  ['TIMESTAMP(6)', 'DateTime @db.Timestamp(6)'],
  ['JSON', 'Json'],
  ["ENUM('a','b')", 'String'],
];

const SQLSERVER_TYPES: Array<[string, string]> = [
  ['int', 'Int'],
  ['tinyint', 'Int @db.TinyInt'],
  ['smallint', 'Int @db.SmallInt'],
  ['bigint', 'BigInt'],
  ['bit', 'Boolean'],
  ['decimal(19,4)', 'Decimal @db.Decimal(19, 4)'],
  ['decimal(32,16)', 'Decimal'],
  ['decimal(9)', 'Decimal @db.Decimal(9, 0)'],
  ['money', 'Float @db.Money'],
  ['smallmoney', 'Float @db.SmallMoney'],
  ['float', 'Float'],
  ['float(53)', 'Float'],
  ['float(24)', 'Float @db.Float(24)'],
  ['real', 'Float @db.Real'],
  ['date', 'DateTime @db.Date'],
  ['time', 'DateTime @db.Time'],
  ['datetime', 'DateTime @db.DateTime'],
  ['datetime2', 'DateTime'],
  ['datetimeoffset', 'DateTime @db.DateTimeOffset'],
  ['smalldatetime', 'DateTime @db.SmallDateTime'],
  ['char(10)', 'String @db.Char(10)'],
  ['nchar(10)', 'String @db.NChar(10)'],
  ['varchar(32)', 'String @db.VarChar(32)'],
  ['varchar(max)', 'String @db.VarChar(Max)'],
  ['nvarchar(1000)', 'String'],
  ['nvarchar(MAX)', 'String @db.NVarChar(Max)'],
  ['text', 'String @db.Text'],
  ['ntext', 'String @db.NText'],
  ['xml', 'String @db.Xml'],
  ['uniqueidentifier', 'String @db.UniqueIdentifier'],
  ['binary(16)', 'Bytes @db.Binary(16)'],
  ['varbinary(max)', 'Bytes'],
  ['varbinary(16)', 'Bytes @db.VarBinary(16)'],
  ['image', 'Bytes @db.Image'],
];

describe('generator-code/prismaType', () => {
  it.each(POSTGRESQL_TYPES)('reads the PostgreSQL %j as %s', (type, result) => {
    expect(typeOf(type, Database.PostgreSQL)).toBe(result);
  });

  it.each(MYSQL_TYPES)('reads the MySQL %j as %s', (type, result) => {
    expect(typeOf(type, Database.MySQL)).toBe(result);
  });

  it('reads a MariaDB type as a MySQL one', () => {
    expect(typeOf('INT UNSIGNED', Database.MariaDB)).toBe(
      'Int @db.UnsignedInt'
    );
  });

  it.each(SQLSERVER_TYPES)('reads the SQL Server %j as %s', (type, result) => {
    expect(typeOf(type, Database.MSSQL)).toBe(result);
  });

  it.each([
    ['postgresql', POSTGRESQL_TYPES],
    ['mysql', MYSQL_TYPES],
    ['sqlserver', SQLSERVER_TYPES],
  ] as const)(
    'gives %s only native types Prisma allows on their scalar',
    (provider, types) => {
      expect(
        prismaErrors(
          provider,
          types.map(([, result]) => result)
        )
      ).toBeNull();
    }
  );

  it.each([
    ['tsvector', Database.PostgreSQL],
    ['geography(Point, 4326)', Database.PostgreSQL],
    ['interval day(2) to second(6)', Database.PostgreSQL],
    ['tsvector[]', Database.PostgreSQL],
    ["SET('a','b')", Database.MySQL],
    ['GEOMETRY', Database.MySQL],
    ['INT[]', Database.MySQL],
    ['geography', Database.MSSQL],
  ])('keeps the %j Prisma has no type for as Unsupported', (type, database) => {
    expect(resolvePrismaType(type, database)).toEqual({
      scalar: `Unsupported(${JSON.stringify(type)})`,
      native: '',
      list: false,
    });
  });

  it('reads an empty type as a String', () => {
    expect(typeOf('  ', Database.PostgreSQL)).toBe('String');
  });

  it.each([
    ['INTEGER', 'Int'],
    ['TEXT', 'String'],
    ['REAL', 'Float'],
    ['DATETIME', 'DateTime'],
    ['BOOLEAN', 'Boolean'],
    ['BLOB', 'Bytes'],
    ['JSON', 'Json'],
    ['TEXT[]', 'String'],
  ])(
    'reads the SQLite %j as %s, with no native type to give',
    (type, result) => {
      expect(typeOf(type, Database.SQLite)).toBe(result);
    }
  );

  it.each([
    ['VARCHAR2(255)', Database.Oracle, 'String'],
    ['NUMBER(19)', Database.Oracle, 'BigInt'],
    ['VARIANT', Database.Snowflake, 'String'],
    ['BIGINT', Database.Databricks, 'BigInt'],
  ])(
    'reads the %j of dialect %i, which Prisma has no provider for, by its primitive',
    (type, database, result) => {
      expect(typeOf(type, database)).toBe(result);
    }
  );
});
