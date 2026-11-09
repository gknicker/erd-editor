import { Database } from '@/constants/schema';
import { PrimitiveTypeMap } from '@/constants/sql/dataType';

import { getPrimitiveType } from './utils';

export type PrismaType = {
  /** A Prisma scalar, or Unsupported("...") holding the column type. */
  scalar: string;
  /** The native type attribute without its prefix, such as VarChar(255). */
  native: string;
  list: boolean;
};

type Family = 'postgresql' | 'mysql' | 'sqlserver';

/** The scalar a native type stands on and the native type's own name. */
type NativeEntry = [scalar: string, native: string];

const convertTypeMap: PrimitiveTypeMap = {
  int: 'Int',
  long: 'BigInt',
  float: 'Float',
  double: 'Float',
  decimal: 'Decimal',
  boolean: 'Boolean',
  string: 'String',
  lob: 'String',
  date: 'DateTime',
  dateTime: 'DateTime',
  time: 'DateTime',
};

/**
 * Each family's column type names, lower-cased and without their arguments,
 * as the native type Prisma spells them with and the scalar it is allowed on.
 */
const nativeTypes: Record<Family, Record<string, NativeEntry>> = {
  postgresql: {
    smallint: ['Int', 'SmallInt'],
    int2: ['Int', 'SmallInt'],
    smallserial: ['Int', 'SmallInt'],
    integer: ['Int', 'Integer'],
    int: ['Int', 'Integer'],
    int4: ['Int', 'Integer'],
    serial: ['Int', 'Integer'],
    bigint: ['BigInt', 'BigInt'],
    int8: ['BigInt', 'BigInt'],
    bigserial: ['BigInt', 'BigInt'],
    oid: ['Int', 'Oid'],
    decimal: ['Decimal', 'Decimal'],
    numeric: ['Decimal', 'Decimal'],
    money: ['Decimal', 'Money'],
    real: ['Float', 'Real'],
    float4: ['Float', 'Real'],
    'double precision': ['Float', 'DoublePrecision'],
    float8: ['Float', 'DoublePrecision'],
    float: ['Float', 'DoublePrecision'],
    varchar: ['String', 'VarChar'],
    'character varying': ['String', 'VarChar'],
    char: ['String', 'Char'],
    character: ['String', 'Char'],
    bpchar: ['String', 'Char'],
    text: ['String', 'Text'],
    citext: ['String', 'Citext'],
    uuid: ['String', 'Uuid'],
    inet: ['String', 'Inet'],
    xml: ['String', 'Xml'],
    bit: ['String', 'Bit'],
    varbit: ['String', 'VarBit'],
    'bit varying': ['String', 'VarBit'],
    boolean: ['Boolean', 'Boolean'],
    bool: ['Boolean', 'Boolean'],
    bytea: ['Bytes', 'ByteA'],
    timestamp: ['DateTime', 'Timestamp'],
    'timestamp without time zone': ['DateTime', 'Timestamp'],
    timestamptz: ['DateTime', 'Timestamptz'],
    'timestamp with time zone': ['DateTime', 'Timestamptz'],
    date: ['DateTime', 'Date'],
    time: ['DateTime', 'Time'],
    'time without time zone': ['DateTime', 'Time'],
    timetz: ['DateTime', 'Timetz'],
    'time with time zone': ['DateTime', 'Timetz'],
    json: ['Json', 'Json'],
    jsonb: ['Json', 'JsonB'],
  },
  mysql: {
    int: ['Int', 'Int'],
    integer: ['Int', 'Int'],
    'int unsigned': ['Int', 'UnsignedInt'],
    'integer unsigned': ['Int', 'UnsignedInt'],
    smallint: ['Int', 'SmallInt'],
    'smallint unsigned': ['Int', 'UnsignedSmallInt'],
    tinyint: ['Int', 'TinyInt'],
    'tinyint unsigned': ['Int', 'UnsignedTinyInt'],
    mediumint: ['Int', 'MediumInt'],
    'mediumint unsigned': ['Int', 'UnsignedMediumInt'],
    bigint: ['BigInt', 'BigInt'],
    'bigint unsigned': ['BigInt', 'UnsignedBigInt'],
    serial: ['BigInt', 'UnsignedBigInt'],
    year: ['Int', 'Year'],
    decimal: ['Decimal', 'Decimal'],
    numeric: ['Decimal', 'Decimal'],
    dec: ['Decimal', 'Decimal'],
    fixed: ['Decimal', 'Decimal'],
    float: ['Float', 'Float'],
    double: ['Float', 'Double'],
    'double precision': ['Float', 'Double'],
    real: ['Float', 'Double'],
    bit: ['Bytes', 'Bit'],
    char: ['String', 'Char'],
    varchar: ['String', 'VarChar'],
    tinytext: ['String', 'TinyText'],
    text: ['String', 'Text'],
    mediumtext: ['String', 'MediumText'],
    longtext: ['String', 'LongText'],
    binary: ['Bytes', 'Binary'],
    varbinary: ['Bytes', 'VarBinary'],
    tinyblob: ['Bytes', 'TinyBlob'],
    blob: ['Bytes', 'Blob'],
    mediumblob: ['Bytes', 'MediumBlob'],
    longblob: ['Bytes', 'LongBlob'],
    date: ['DateTime', 'Date'],
    time: ['DateTime', 'Time'],
    datetime: ['DateTime', 'DateTime'],
    timestamp: ['DateTime', 'Timestamp'],
    json: ['Json', 'Json'],
  },
  sqlserver: {
    tinyint: ['Int', 'TinyInt'],
    smallint: ['Int', 'SmallInt'],
    int: ['Int', 'Int'],
    integer: ['Int', 'Int'],
    bigint: ['BigInt', 'BigInt'],
    decimal: ['Decimal', 'Decimal'],
    numeric: ['Decimal', 'Decimal'],
    dec: ['Decimal', 'Decimal'],
    money: ['Float', 'Money'],
    smallmoney: ['Float', 'SmallMoney'],
    bit: ['Boolean', 'Bit'],
    float: ['Float', 'Float'],
    real: ['Float', 'Real'],
    date: ['DateTime', 'Date'],
    time: ['DateTime', 'Time'],
    datetime: ['DateTime', 'DateTime'],
    datetime2: ['DateTime', 'DateTime2'],
    datetimeoffset: ['DateTime', 'DateTimeOffset'],
    smalldatetime: ['DateTime', 'SmallDateTime'],
    char: ['String', 'Char'],
    character: ['String', 'Char'],
    nchar: ['String', 'NChar'],
    varchar: ['String', 'VarChar'],
    'char varying': ['String', 'VarChar'],
    'character varying': ['String', 'VarChar'],
    nvarchar: ['String', 'NVarChar'],
    text: ['String', 'Text'],
    ntext: ['String', 'NText'],
    xml: ['String', 'Xml'],
    uniqueidentifier: ['String', 'UniqueIdentifier'],
    binary: ['Bytes', 'Binary'],
    varbinary: ['Bytes', 'VarBinary'],
    image: ['Bytes', 'Image'],
  },
};

/** Native types that take arguments, with how many at most. */
const nativeArgs: Record<Family, Record<string, number>> = {
  postgresql: {
    Decimal: 2,
    VarChar: 1,
    Char: 1,
    Bit: 1,
    VarBit: 1,
    Timestamp: 1,
    Timestamptz: 1,
    Time: 1,
    Timetz: 1,
  },
  mysql: {
    Decimal: 2,
    Bit: 1,
    Char: 1,
    VarChar: 1,
    Binary: 1,
    VarBinary: 1,
    Time: 1,
    DateTime: 1,
    Timestamp: 1,
  },
  sqlserver: {
    Decimal: 2,
    Float: 1,
    Char: 1,
    NChar: 1,
    VarChar: 1,
    NVarChar: 1,
    Binary: 1,
    VarBinary: 1,
  },
};

/** MySQL's native types that need their argument and mean nothing without. */
const MYSQL_REQUIRED_ARGS = ['Bit', 'Char', 'VarChar', 'Binary', 'VarBinary'];

/**
 * The native type Prisma gives each scalar when a field names none, which is
 * left unwritten, as prisma db pull leaves it.
 */
const defaultNatives: Record<Family, Record<string, string[]>> = {
  postgresql: {
    Int: ['Integer'],
    BigInt: ['BigInt'],
    Float: ['DoublePrecision'],
    Decimal: ['Decimal(65, 30)'],
    String: ['Text'],
    Boolean: ['Boolean'],
    DateTime: ['Timestamp(3)'],
    Json: ['JsonB'],
    Bytes: ['ByteA'],
  },
  mysql: {
    Int: ['Int'],
    BigInt: ['BigInt'],
    Float: ['Double'],
    Decimal: ['Decimal(65, 30)'],
    String: ['VarChar(191)'],
    DateTime: ['DateTime(3)'],
    Json: ['Json'],
    Bytes: ['LongBlob'],
  },
  sqlserver: {
    Int: ['Int'],
    BigInt: ['BigInt'],
    Float: ['Float', 'Float(53)'],
    Decimal: ['Decimal(32, 16)'],
    String: ['NVarChar(1000)'],
    Boolean: ['Bit'],
    DateTime: ['DateTime2'],
    Bytes: ['VarBinary(Max)'],
  },
};

const families: Record<number, Family> = {
  [Database.PostgreSQL]: 'postgresql',
  [Database.MySQL]: 'mysql',
  [Database.MariaDB]: 'mysql',
  [Database.MSSQL]: 'sqlserver',
};

/** A column type cut into its words and its arguments: DECIMAL(10, 2) UNSIGNED. */
const TYPE_PARTS = /^([^(]*?)\s*(?:\(([^)]*)\))?\s*([^()]*)$/;
const LIST_SUFFIX = /\s*\[\]$/;
const SQLITE_SCALARS: Record<string, string> = {
  blob: 'Bytes',
  json: 'Json',
  jsonb: 'Json',
};

/**
 * The Prisma type a column type stands for on the document's dialect: the
 * scalar, and the native type where the family has one that is not the
 * scalar's own default; a type with no Prisma equivalent is Unsupported.
 */
export function resolvePrismaType(
  dataType: string,
  database: number
): PrismaType {
  const family = families[database];
  const raw = dataType.trim();
  const list = family === 'postgresql' && LIST_SUFFIX.test(raw);
  const value = list ? raw.replace(LIST_SUFFIX, '') : raw;
  const parts = TYPE_PARTS.exec(value);
  const base = parts
    ? `${parts[1]} ${parts[3]}`.trim().toLowerCase().replace(/\s+/g, ' ')
    : '';
  const args = (parts?.[2] ?? '')
    .split(',')
    .map(arg => arg.trim())
    .filter(arg => arg !== '');

  if (!family) {
    const scalar =
      database === Database.SQLite && Object.hasOwn(SQLITE_SCALARS, base)
        ? SQLITE_SCALARS[base]
        : convertTypeMap[getPrimitiveType(raw, database)];
    return { scalar, native: '', list: false };
  }

  if (raw === '' || (family === 'mysql' && base === 'enum')) {
    // Enums are written as the String their column holds, for now.
    return { scalar: 'String', native: '', list };
  }

  const special = mysqlBoolean(family, base, args);
  if (special) {
    return { scalar: special, native: '', list };
  }

  if (!Object.hasOwn(nativeTypes[family], base)) {
    return {
      scalar: `Unsupported(${JSON.stringify(raw)})`,
      native: '',
      list: false,
    };
  }

  const [scalar, name] = nativeTypes[family][base];
  const native = formatNative(family, name, args);
  const isDefault = (defaultNatives[family][scalar] ?? []).includes(native);

  return { scalar, native: isDefault ? '' : native, list };
}

/** TINYINT(1) and BIT(1) are MySQL's booleans, as Prisma reads them. */
function mysqlBoolean(
  family: Family,
  base: string,
  args: string[]
): string | null {
  if (family !== 'mysql') return null;
  if (base === 'boolean' || base === 'bool') return 'Boolean';
  if ((base === 'tinyint' || base === 'bit') && args.join() === '1') {
    return 'Boolean';
  }
  return null;
}

function formatNative(family: Family, name: string, args: string[]): string {
  const count = nativeArgs[family][name] ?? 0;
  const kept = args
    .slice(0, count)
    .map(arg => (arg.toLowerCase() === 'max' ? 'Max' : arg));

  // DECIMAL(p) is DECIMAL(p, 0) in SQL, and Prisma takes both or neither.
  if (name === 'Decimal' && kept.length === 1) {
    kept.push('0');
  }

  if (kept.length === 0) {
    return family === 'mysql' && MYSQL_REQUIRED_ARGS.includes(name) ? '' : name;
  }

  return `${name}(${kept.join(', ')})`;
}
