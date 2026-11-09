import { Database } from '@/constants/schema';

import { PrismaEnum, PrismaField, PrismaNativeType } from './types';

type Family = 'postgresql' | 'mysql' | 'sqlserver';

/** The fractional second precision of DATETIME(3) or TIMESTAMP(6). */
const PRECISION = /^(?:DATETIME|TIMESTAMP|TIME)\((\d+)\)/i;

export const PRISMA_SCALARS = [
  'String',
  'Boolean',
  'Int',
  'BigInt',
  'Float',
  'Decimal',
  'DateTime',
  'Json',
  'Bytes',
] as const;

type PrismaScalar = (typeof PRISMA_SCALARS)[number];

/**
 * The column Prisma Migrate creates for a field with no native type, on the
 * dialects it targets. Every cell is a name from that dialect's hint list
 * under @/constants/sql/dataType, so getPrimitiveType resolves it.
 */
const scalarTypes: Record<PrismaScalar, Record<number, string>> = {
  String: {
    [Database.MariaDB]: 'VARCHAR(191)',
    [Database.MSSQL]: 'nvarchar(1000)',
    [Database.MySQL]: 'VARCHAR(191)',
    [Database.Oracle]: 'VARCHAR2(255)',
    [Database.PostgreSQL]: 'text',
    [Database.SQLite]: 'TEXT',
    [Database.Databricks]: 'STRING',
    [Database.Snowflake]: 'VARCHAR(255)',
  },
  Boolean: {
    [Database.MariaDB]: 'BOOLEAN',
    [Database.MSSQL]: 'bit',
    [Database.MySQL]: 'BOOLEAN',
    [Database.Oracle]: 'BOOLEAN',
    [Database.PostgreSQL]: 'boolean',
    [Database.SQLite]: 'BOOLEAN',
    [Database.Databricks]: 'BOOLEAN',
    [Database.Snowflake]: 'BOOLEAN',
  },
  Int: {
    [Database.MariaDB]: 'INTEGER',
    [Database.MSSQL]: 'int',
    [Database.MySQL]: 'INTEGER',
    [Database.Oracle]: 'INTEGER',
    [Database.PostgreSQL]: 'integer',
    [Database.SQLite]: 'INTEGER',
    [Database.Databricks]: 'INT',
    [Database.Snowflake]: 'INT',
  },
  BigInt: {
    [Database.MariaDB]: 'BIGINT',
    [Database.MSSQL]: 'bigint',
    [Database.MySQL]: 'BIGINT',
    // Oracle.ts has no BIGINT; NUMBER carries the long primitive there.
    [Database.Oracle]: 'NUMBER(19)',
    [Database.PostgreSQL]: 'bigint',
    [Database.SQLite]: 'BIGINT',
    [Database.Databricks]: 'BIGINT',
    [Database.Snowflake]: 'BIGINT',
  },
  Float: {
    [Database.MariaDB]: 'DOUBLE',
    [Database.MSSQL]: 'float',
    [Database.MySQL]: 'DOUBLE',
    [Database.Oracle]: 'BINARY_DOUBLE',
    [Database.PostgreSQL]: 'double precision',
    [Database.SQLite]: 'REAL',
    [Database.Databricks]: 'DOUBLE',
    [Database.Snowflake]: 'FLOAT',
  },
  Decimal: {
    [Database.MariaDB]: 'DECIMAL(65,30)',
    [Database.MSSQL]: 'decimal(32,16)',
    [Database.MySQL]: 'DECIMAL(65,30)',
    [Database.Oracle]: 'DECIMAL',
    [Database.PostgreSQL]: 'decimal(65,30)',
    [Database.SQLite]: 'DECIMAL',
    [Database.Databricks]: 'DECIMAL',
    [Database.Snowflake]: 'DECIMAL',
  },
  DateTime: {
    [Database.MariaDB]: 'DATETIME(3)',
    [Database.MSSQL]: 'datetime2',
    [Database.MySQL]: 'DATETIME(3)',
    [Database.Oracle]: 'TIMESTAMP',
    [Database.PostgreSQL]: 'timestamp(3)',
    [Database.SQLite]: 'DATETIME',
    [Database.Databricks]: 'TIMESTAMP',
    [Database.Snowflake]: 'TIMESTAMP_NTZ',
  },
  Json: {
    [Database.MariaDB]: 'JSON',
    // Prisma has no Json on SQL Server, and SQLite.ts lists no JSONB.
    [Database.MSSQL]: 'nvarchar(max)',
    [Database.MySQL]: 'JSON',
    [Database.Oracle]: 'JSON',
    [Database.PostgreSQL]: 'jsonb',
    [Database.SQLite]: 'TEXT',
    [Database.Databricks]: 'VARIANT',
    [Database.Snowflake]: 'VARIANT',
  },
  Bytes: {
    [Database.MariaDB]: 'LONGBLOB',
    [Database.MSSQL]: 'varbinary(max)',
    [Database.MySQL]: 'LONGBLOB',
    [Database.Oracle]: 'BLOB',
    [Database.PostgreSQL]: 'bytea',
    [Database.SQLite]: 'BLOB',
    [Database.Databricks]: 'BINARY',
    [Database.Snowflake]: 'BINARY',
  },
};

/**
 * The @db attributes of the PostgreSQL and CockroachDB providers, spelt for
 * PostgreSQL.ts. CockroachDB's names that PostgreSQL lacks take the column
 * PostgreSQL would hold them in; citext keeps the extension's own name.
 */
const postgresqlNativeTypes: Record<string, string> = {
  BigInt: 'bigint',
  Bit: 'bit',
  Bool: 'bool',
  Boolean: 'boolean',
  ByteA: 'bytea',
  Bytes: 'bytea',
  CatalogSingleChar: 'char(1)',
  Char: 'char',
  Citext: 'citext',
  Date: 'date',
  Decimal: 'decimal',
  DoublePrecision: 'double precision',
  Float4: 'float4',
  Float8: 'float8',
  Inet: 'inet',
  Int2: 'int2',
  Int4: 'int4',
  Int8: 'int8',
  Integer: 'integer',
  Json: 'json',
  JsonB: 'jsonb',
  Money: 'money',
  Oid: 'oid',
  Real: 'real',
  SmallInt: 'smallint',
  String: 'varchar',
  Text: 'text',
  Time: 'time',
  Timestamp: 'timestamp',
  Timestamptz: 'timestamptz',
  Timetz: 'timetz',
  Uuid: 'uuid',
  VarBit: 'varbit',
  VarChar: 'varchar',
  Xml: 'xml',
};

const mysqlNativeTypes: Record<string, string> = {
  BigInt: 'BIGINT',
  Binary: 'BINARY',
  Bit: 'BIT',
  Blob: 'BLOB',
  Char: 'CHAR',
  Date: 'DATE',
  DateTime: 'DATETIME',
  Decimal: 'DECIMAL',
  Double: 'DOUBLE',
  Float: 'FLOAT',
  Int: 'INT',
  Json: 'JSON',
  LongBlob: 'LONGBLOB',
  LongText: 'LONGTEXT',
  MediumBlob: 'MEDIUMBLOB',
  MediumInt: 'MEDIUMINT',
  MediumText: 'MEDIUMTEXT',
  SmallInt: 'SMALLINT',
  Text: 'TEXT',
  Time: 'TIME',
  Timestamp: 'TIMESTAMP',
  TinyBlob: 'TINYBLOB',
  TinyInt: 'TINYINT',
  TinyText: 'TINYTEXT',
  UnsignedBigInt: 'BIGINT UNSIGNED',
  UnsignedInt: 'INT UNSIGNED',
  UnsignedMediumInt: 'MEDIUMINT UNSIGNED',
  UnsignedSmallInt: 'SMALLINT UNSIGNED',
  UnsignedTinyInt: 'TINYINT UNSIGNED',
  VarBinary: 'VARBINARY',
  VarChar: 'VARCHAR',
  Year: 'YEAR',
};

const sqlserverNativeTypes: Record<string, string> = {
  BigInt: 'bigint',
  Binary: 'binary',
  Bit: 'bit',
  Char: 'char',
  Date: 'date',
  DateTime: 'datetime',
  DateTime2: 'datetime2',
  DateTimeOffset: 'datetimeoffset',
  Decimal: 'decimal',
  Float: 'float',
  Image: 'image',
  Int: 'int',
  Money: 'money',
  NChar: 'nchar',
  NText: 'ntext',
  NVarChar: 'nvarchar',
  Real: 'real',
  SmallDateTime: 'smalldatetime',
  SmallInt: 'smallint',
  SmallMoney: 'smallmoney',
  Text: 'text',
  Time: 'time',
  TinyInt: 'tinyint',
  UniqueIdentifier: 'uniqueidentifier',
  VarBinary: 'varbinary',
  VarChar: 'varchar',
  Xml: 'xml',
};

const nativeTypes: Record<Family, Record<string, string>> = {
  postgresql: postgresqlNativeTypes,
  mysql: mysqlNativeTypes,
  sqlserver: sqlserverNativeTypes,
};

const providerFamilies: Record<string, Family> = {
  postgresql: 'postgresql',
  postgres: 'postgresql',
  cockroachdb: 'postgresql',
  mysql: 'mysql',
  sqlserver: 'sqlserver',
};

const providerDatabases: Record<string, number> = {
  postgresql: Database.PostgreSQL,
  postgres: Database.PostgreSQL,
  cockroachdb: Database.PostgreSQL,
  mysql: Database.MySQL,
  sqlserver: Database.MSSQL,
  sqlite: Database.SQLite,
};

/**
 * The dialect a datasource provider names, or current for none and for
 * MongoDB; a MariaDB document stays MariaDB, which Prisma reaches as mysql.
 */
export function providerDatabase(provider: string, current: number): number {
  const database = Object.hasOwn(providerDatabases, provider)
    ? providerDatabases[provider]
    : null;
  if (database === null) return current;

  const family = familyOf(database);
  return family !== null && familyOf(current) === family ? current : database;
}

export function isColumnType(
  typeName: string,
  enums: Record<string, PrismaEnum>
): boolean {
  return isScalar(typeName) || enumOf(enums, typeName) !== null;
}

export function resolveDataType(
  field: PrismaField,
  database: number,
  provider: string,
  enums: Record<string, PrismaEnum>
): string {
  if (field.unsupported) {
    return field.typeName;
  }

  const base = baseDataType(field, database, provider, enums);
  // Only PostgreSQL.ts spells an array column; elsewhere the comment says it.
  return field.list && database === Database.PostgreSQL ? `${base}[]` : base;
}

/**
 * What the column type cannot say: that a list became one value outside
 * PostgreSQL, and an enum's members where no ENUM(...) column lists them.
 */
export function dataTypeComment(
  field: PrismaField,
  database: number,
  enums: Record<string, PrismaEnum>
): string {
  const parts: string[] = [];

  if (field.list && database !== Database.PostgreSQL && !field.unsupported) {
    parts.push(`list of ${field.typeName}`);
  }

  const prismaEnum = field.unsupported ? null : enumOf(enums, field.typeName);
  if (prismaEnum && !hasEnumColumn(database)) {
    parts.push(
      `${storedName(prismaEnum)}: ${storedValues(prismaEnum).join(' | ')}`
    );
  }

  return parts.join(' ');
}

/**
 * The parser spells a default for no dialect in particular; MySQL wants the
 * column's fractional precision on CURRENT_TIMESTAMP and SQL Server a bit.
 */
export function resolveDefault(
  field: PrismaField,
  dataType: string,
  database: number
): string {
  const { default: value } = field;

  if (value === 'CURRENT_TIMESTAMP' && familyOf(database) === 'mysql') {
    const precision = PRECISION.exec(dataType)?.[1] ?? '0';
    return precision === '0' ? value : `${value}(${precision})`;
  }

  if (database === Database.MSSQL && field.typeName === 'Boolean') {
    if (value === 'true') return '1';
    if (value === 'false') return '0';
  }

  return value;
}

function baseDataType(
  field: PrismaField,
  database: number,
  provider: string,
  enums: Record<string, PrismaEnum>
): string {
  const prismaEnum = enumOf(enums, field.typeName);
  if (prismaEnum) {
    return hasEnumColumn(database)
      ? `ENUM(${storedValues(prismaEnum)
          .map(value => `'${value.replace(/'/g, "''")}'`)
          .join(',')})`
      : scalarType('String', database);
  }

  const native = field.nativeType
    ? nativeDataType(field.nativeType, database, provider)
    : '';
  if (native) return native;

  return isScalar(field.typeName) ? scalarType(field.typeName, database) : '';
}

/**
 * A native type is read only on its own provider's dialect, or on any dialect
 * knowing its name when the file names no provider; elsewhere the field's
 * scalar decides, since the attribute means nothing there.
 */
function nativeDataType(
  { name, args }: PrismaNativeType,
  database: number,
  provider: string
): string {
  const family = familyOf(database);
  if (!family) return '';

  const providerFamily = Object.hasOwn(providerFamilies, provider)
    ? providerFamilies[provider]
    : null;
  if (provider !== '' && providerFamily !== family) return '';

  const types = nativeTypes[family];
  if (!Object.hasOwn(types, name)) return '';

  const base = types[name];
  if (args.length === 0) return base;

  // SQL Server spells its Max argument in the lower case MSSQL.ts uses.
  const spelled =
    family === 'sqlserver' ? args.map(arg => arg.toLowerCase()) : args;
  return `${base}(${spelled.join(',')})`;
}

function scalarType(scalar: PrismaScalar, database: number): string {
  return scalarTypes[scalar][database] ?? '';
}

function familyOf(database: number): Family | null {
  switch (database) {
    case Database.PostgreSQL:
      return 'postgresql';
    case Database.MySQL:
    case Database.MariaDB:
      return 'mysql';
    case Database.MSSQL:
      return 'sqlserver';
    default:
      return null;
  }
}

/** Only MySQL.ts and MariaDB.ts list ENUM. */
function hasEnumColumn(database: number): boolean {
  return database === Database.MySQL || database === Database.MariaDB;
}

function isScalar(typeName: string): typeName is PrismaScalar {
  return (PRISMA_SCALARS as readonly string[]).includes(typeName);
}

function enumOf(
  enums: Record<string, PrismaEnum>,
  name: string
): PrismaEnum | null {
  return Object.hasOwn(enums, name) ? enums[name] : null;
}

function storedName(prismaEnum: PrismaEnum): string {
  return prismaEnum.dbName || prismaEnum.name;
}

/** The spelling the table holds, which @map changes. */
function storedValues(prismaEnum: PrismaEnum): string[] {
  return prismaEnum.values.map(value => value.dbName || value.name);
}
