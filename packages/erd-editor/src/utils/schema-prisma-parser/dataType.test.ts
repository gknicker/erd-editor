import { describe, expect, it } from 'vite-plus/test';

import { Database, DatabaseList } from '@/constants/schema';
import { DatabaseHintMap, PrimitiveType } from '@/constants/sql/dataType';
import { getPrimitiveType } from '@/utils/generator-code/utils';
import {
  dataTypeComment,
  PRISMA_SCALARS,
  providerDatabase,
  resolveDataType,
  resolveDefault,
} from '@/utils/schema-prisma-parser/dataType';
import { PrismaEnum, PrismaField } from '@/utils/schema-prisma-parser/types';

function createField(field: Partial<PrismaField> = {}): PrismaField {
  return {
    name: 'a',
    dbName: '',
    comment: '',
    typeName: 'String',
    unsupported: false,
    optional: false,
    list: false,
    primaryKey: false,
    unique: false,
    autoIncrement: false,
    default: '',
    nativeType: null,
    relationName: '',
    relationFields: [],
    relationReferences: [],
    ...field,
  };
}

const ROLE: PrismaEnum = {
  name: 'Role',
  dbName: '',
  schemaName: '',
  comment: '',
  values: [
    { name: 'USER', dbName: '', comment: '' },
    { name: 'ADMIN', dbName: 'admin', comment: '' },
  ],
};

const ENUMS: Record<string, PrismaEnum> = { Role: ROLE };

function typeOf(
  field: Partial<PrismaField>,
  database: number,
  provider = ''
): string {
  return resolveDataType(createField(field), database, provider, ENUMS);
}

function nativeTypeOf(
  typeName: string,
  name: string,
  args: string[],
  database: number,
  provider: string
): string {
  return typeOf({ typeName, nativeType: { name, args } }, database, provider);
}

/**
 * What Prisma's own native_types function lists per provider, so a type a
 * provider gains shows up here as one the dialect table lacks.
 */
const NATIVE_TYPES: Record<string, string[]> = {
  postgresql: [
    'SmallInt',
    'Integer',
    'BigInt',
    'Decimal',
    'Money',
    'Inet',
    'Oid',
    'Citext',
    'Real',
    'DoublePrecision',
    'VarChar',
    'Char',
    'Text',
    'ByteA',
    'Timestamp',
    'Timestamptz',
    'Date',
    'Time',
    'Timetz',
    'Boolean',
    'Bit',
    'VarBit',
    'Uuid',
    'Xml',
    'Json',
    'JsonB',
  ],
  cockroachdb: [
    'Bit',
    'Bool',
    'Bytes',
    'Char',
    'Date',
    'Decimal',
    'Float4',
    'Float8',
    'Inet',
    'Int2',
    'Int4',
    'Int8',
    'JsonB',
    'Oid',
    'CatalogSingleChar',
    'String',
    'Time',
    'Timestamp',
    'Timestamptz',
    'Timetz',
    'Uuid',
    'VarBit',
  ],
  mysql: [
    'Int',
    'UnsignedInt',
    'SmallInt',
    'UnsignedSmallInt',
    'TinyInt',
    'UnsignedTinyInt',
    'MediumInt',
    'UnsignedMediumInt',
    'BigInt',
    'Decimal',
    'UnsignedBigInt',
    'Float',
    'Double',
    'Bit',
    'Char',
    'VarChar',
    'Binary',
    'VarBinary',
    'TinyBlob',
    'Blob',
    'MediumBlob',
    'LongBlob',
    'TinyText',
    'Text',
    'MediumText',
    'LongText',
    'Date',
    'Time',
    'DateTime',
    'Timestamp',
    'Year',
    'Json',
  ],
  sqlserver: [
    'TinyInt',
    'SmallInt',
    'Int',
    'BigInt',
    'Decimal',
    'Money',
    'SmallMoney',
    'Bit',
    'Float',
    'Real',
    'Date',
    'Time',
    'DateTime',
    'DateTime2',
    'DateTimeOffset',
    'SmallDateTime',
    'Char',
    'NChar',
    'VarChar',
    'Text',
    'NVarChar',
    'NText',
    'Binary',
    'VarBinary',
    'Image',
    'Xml',
    'UniqueIdentifier',
  ],
};

const PROVIDER_DATABASES: Record<string, number> = {
  postgresql: Database.PostgreSQL,
  cockroachdb: Database.PostgreSQL,
  mysql: Database.MySQL,
  sqlserver: Database.MSSQL,
};

/** The hint a type resolves through: its longest leading name, as in getPrimitiveType. */
function hintNameOf(dataType: string, database: number): string | null {
  const value = dataType.toLowerCase().replace(/\([^)]*\)/g, '');
  const names = DatabaseHintMap[database]
    .map(hint => hint.name.toLowerCase())
    .filter(
      name => value.startsWith(name) && !/\w/.test(value.charAt(name.length))
    )
    .sort((a, b) => b.length - a.length);

  return names[0] ?? null;
}

describe('providerDatabase', () => {
  it.each([
    ['postgresql', Database.PostgreSQL],
    ['postgres', Database.PostgreSQL],
    ['cockroachdb', Database.PostgreSQL],
    ['mysql', Database.MySQL],
    ['sqlserver', Database.MSSQL],
    ['sqlite', Database.SQLite],
  ])('reads %s as dialect %i', (provider, database) => {
    expect(providerDatabase(provider, Database.Oracle)).toBe(database);
  });

  it('keeps a MariaDB document MariaDB, which Prisma reaches as mysql', () => {
    expect(providerDatabase('mysql', Database.MariaDB)).toBe(Database.MariaDB);
  });

  it('leaves SQLite for no other dialect outside the native type families', () => {
    expect(providerDatabase('sqlite', Database.Snowflake)).toBe(
      Database.SQLite
    );
  });

  it('leaves the current dialect where it already is the provider', () => {
    expect(providerDatabase('postgresql', Database.PostgreSQL)).toBe(
      Database.PostgreSQL
    );
  });

  it.each(['', 'mongodb', 'unknown', 'toString'])(
    'keeps the current dialect for the provider %j',
    provider => {
      expect(providerDatabase(provider, Database.Snowflake)).toBe(
        Database.Snowflake
      );
    }
  );
});

describe('resolveDataType', () => {
  describe('scalars, as Prisma Migrate creates them', () => {
    it.each([
      ['String', 'text'],
      ['Boolean', 'boolean'],
      ['Int', 'integer'],
      ['BigInt', 'bigint'],
      ['Float', 'double precision'],
      ['Decimal', 'decimal(65,30)'],
      ['DateTime', 'timestamp(3)'],
      ['Json', 'jsonb'],
      ['Bytes', 'bytea'],
    ])('maps %s to %s on PostgreSQL', (typeName, dataType) => {
      expect(typeOf({ typeName }, Database.PostgreSQL)).toBe(dataType);
    });

    it.each([
      ['String', 'VARCHAR(191)'],
      ['Boolean', 'BOOLEAN'],
      ['Int', 'INTEGER'],
      ['BigInt', 'BIGINT'],
      ['Float', 'DOUBLE'],
      ['Decimal', 'DECIMAL(65,30)'],
      ['DateTime', 'DATETIME(3)'],
      ['Json', 'JSON'],
      ['Bytes', 'LONGBLOB'],
    ])('maps %s to %s on MySQL and MariaDB', (typeName, dataType) => {
      expect(typeOf({ typeName }, Database.MySQL)).toBe(dataType);
      expect(typeOf({ typeName }, Database.MariaDB)).toBe(dataType);
    });

    it.each([
      ['String', 'nvarchar(1000)'],
      ['Boolean', 'bit'],
      ['Int', 'int'],
      ['BigInt', 'bigint'],
      ['Float', 'float'],
      ['Decimal', 'decimal(32,16)'],
      ['DateTime', 'datetime2'],
      ['Bytes', 'varbinary(max)'],
    ])('maps %s to %s on SQL Server', (typeName, dataType) => {
      expect(typeOf({ typeName }, Database.MSSQL)).toBe(dataType);
    });

    it.each([
      ['String', 'TEXT'],
      ['Boolean', 'BOOLEAN'],
      ['Int', 'INTEGER'],
      ['BigInt', 'BIGINT'],
      ['Float', 'REAL'],
      ['Decimal', 'DECIMAL'],
      ['DateTime', 'DATETIME'],
      ['Bytes', 'BLOB'],
    ])('maps %s to %s on SQLite', (typeName, dataType) => {
      expect(typeOf({ typeName }, Database.SQLite)).toBe(dataType);
    });

    it('maps Json to TEXT on SQLite, whose hint list has no JSONB', () => {
      expect(typeOf({ typeName: 'Json' }, Database.SQLite)).toBe('TEXT');
    });

    it('maps Json to nvarchar(max) on SQL Server, where Prisma has none', () => {
      expect(typeOf({ typeName: 'Json' }, Database.MSSQL)).toBe(
        'nvarchar(max)'
      );
    });

    it('returns an empty string for a type no block declares', () => {
      expect(typeOf({ typeName: 'User' }, Database.PostgreSQL)).toBe('');
    });

    it('returns an empty string for a database outside the hint map', () => {
      expect(typeOf({ typeName: 'String' }, 0)).toBe('');
    });
  });

  describe('hint list coverage', () => {
    it.each(DatabaseList)(
      'emits only names listed in the %i hint list',
      database => {
        const hintNames = new Set(
          DatabaseHintMap[database].map(hint => hint.name.toLowerCase())
        );
        const emitted = [
          ...PRISMA_SCALARS.map(typeName => typeOf({ typeName }, database)),
          typeOf({ typeName: 'Role' }, database),
        ];

        for (const dataType of emitted) {
          expect(hintNames).toContain(
            dataType
              .replace(/\([^)]*\)/g, '')
              .trim()
              .toLowerCase()
          );
        }
      }
    );

    it.each(DatabaseList)('keeps each scalar primitive on %i', database => {
      const primitiveOf = (typeName: string) =>
        getPrimitiveType(typeOf({ typeName }, database), database);

      expect(primitiveOf('String')).toBe(PrimitiveType.string);
      expect(primitiveOf('Int')).toBe(PrimitiveType.int);
      expect(primitiveOf('BigInt')).toBe(PrimitiveType.long);
      expect(primitiveOf('Decimal')).toBe(PrimitiveType.decimal);
      expect(primitiveOf('DateTime')).toBe(PrimitiveType.dateTime);
    });

    it.each(DatabaseList.filter(database => database !== Database.MSSQL))(
      'keeps Boolean boolean on %i',
      database => {
        expect(
          getPrimitiveType(typeOf({ typeName: 'Boolean' }, database), database)
        ).toBe(PrimitiveType.boolean);
      }
    );
  });

  describe('native types', () => {
    describe.each(Object.entries(NATIVE_TYPES))('%s', (provider, names) => {
      const database = PROVIDER_DATABASES[provider];

      // A type no scalar names has no default to fall back on, so only a
      // native type the dialect table knows gives it a column type.
      it.each(names)('knows %s', name => {
        expect(nativeTypeOf('Unknown', name, [], database, provider)).not.toBe(
          ''
        );
      });

      // citext is an extension PostgreSQL.ts does not list; its primitive
      // falls back to string, which is what it holds.
      it.each(names.filter(name => name !== 'Citext'))(
        'spells %s with a name from the hint list',
        name => {
          expect(
            hintNameOf(
              nativeTypeOf('String', name, [], database, provider),
              database
            )
          ).not.toBeNull();
        }
      );
    });

    it.each([
      ['VarChar', ['200'], 'varchar(200)'],
      ['Char', ['13'], 'char(13)'],
      ['Decimal', ['10', '2'], 'decimal(10,2)'],
      ['Timestamptz', ['6'], 'timestamptz(6)'],
      ['DoublePrecision', [], 'double precision'],
      ['Uuid', [], 'uuid'],
      ['Citext', [], 'citext'],
    ])(
      'spells PostgreSQL %s(%j) as %s',
      (name: string, args: string[], dataType: string) => {
        expect(
          nativeTypeOf('String', name, args, Database.PostgreSQL, 'postgresql')
        ).toBe(dataType);
      }
    );

    it.each([
      ['String', ['10'], 'varchar(10)'],
      ['String', [], 'varchar'],
      ['Int8', [], 'int8'],
      ['Bool', [], 'bool'],
      ['Bytes', [], 'bytea'],
      ['CatalogSingleChar', [], 'char(1)'],
    ])(
      'spells CockroachDB %s(%j) for PostgreSQL as %s',
      (name: string, args: string[], dataType: string) => {
        expect(
          nativeTypeOf('String', name, args, Database.PostgreSQL, 'cockroachdb')
        ).toBe(dataType);
      }
    );

    it.each([
      ['VarChar', ['255'], 'VARCHAR(255)'],
      ['UnsignedInt', [], 'INT UNSIGNED'],
      ['UnsignedBigInt', [], 'BIGINT UNSIGNED'],
      ['DateTime', ['0'], 'DATETIME(0)'],
      ['TinyInt', [], 'TINYINT'],
    ])(
      'spells MySQL %s(%j) as %s',
      (name: string, args: string[], dataType: string) => {
        expect(nativeTypeOf('Int', name, args, Database.MySQL, 'mysql')).toBe(
          dataType
        );
      }
    );

    it('spells a MySQL native type for a MariaDB document too', () => {
      expect(
        nativeTypeOf('Int', 'UnsignedInt', [], Database.MariaDB, 'mysql')
      ).toBe('INT UNSIGNED');
    });

    it('keeps the unsigned primitive an integer', () => {
      expect(
        getPrimitiveType(
          nativeTypeOf('Int', 'UnsignedInt', [], Database.MySQL, 'mysql'),
          Database.MySQL
        )
      ).toBe(PrimitiveType.int);
    });

    it.each([
      ['NVarChar', ['Max'], 'nvarchar(max)'],
      ['VarChar', ['32'], 'varchar(32)'],
      ['Decimal', ['19', '4'], 'decimal(19,4)'],
      ['UniqueIdentifier', [], 'uniqueidentifier'],
    ])(
      'spells SQL Server %s(%j) as %s',
      (name: string, args: string[], dataType: string) => {
        expect(
          nativeTypeOf('String', name, args, Database.MSSQL, 'sqlserver')
        ).toBe(dataType);
      }
    );

    it("ignores a native type on another provider's dialect", () => {
      expect(
        nativeTypeOf('String', 'VarChar', ['10'], Database.PostgreSQL, 'mysql')
      ).toBe('text');
    });

    it('ignores a native type on a dialect no Prisma provider targets', () => {
      expect(
        nativeTypeOf('String', 'VarChar', ['10'], Database.Oracle, 'postgresql')
      ).toBe('VARCHAR2(255)');
    });

    it('ignores a native type on SQLite, which has none', () => {
      expect(
        nativeTypeOf('String', 'VarChar', ['10'], Database.SQLite, 'sqlite')
      ).toBe('TEXT');
    });

    it('ignores a name the dialect does not know', () => {
      expect(
        nativeTypeOf('String', 'Nope', [], Database.PostgreSQL, 'postgresql')
      ).toBe('text');
    });

    it('ignores an inherited property name', () => {
      expect(
        nativeTypeOf('String', 'toString', [], Database.MySQL, 'mysql')
      ).toBe('VARCHAR(191)');
    });

    it('reads a native type by name when the file names no provider', () => {
      expect(nativeTypeOf('String', 'Uuid', [], Database.PostgreSQL, '')).toBe(
        'uuid'
      );
    });

    it('ignores it, without a provider, where the dialect does not know it', () => {
      expect(nativeTypeOf('String', 'Uuid', [], Database.MySQL, '')).toBe(
        'VARCHAR(191)'
      );
    });

    it('ignores a provider the dialect families do not include', () => {
      expect(
        nativeTypeOf('String', 'VarChar', ['8'], Database.MySQL, 'mongodb')
      ).toBe('VARCHAR(191)');
    });
  });

  describe('Unsupported', () => {
    it('keeps the database type verbatim on every dialect', () => {
      for (const database of DatabaseList) {
        expect(
          typeOf({ typeName: 'tsvector', unsupported: true }, database)
        ).toBe('tsvector');
      }
    });
  });

  describe('lists', () => {
    it('spells a PostgreSQL array', () => {
      expect(
        typeOf({ typeName: 'String', list: true }, Database.PostgreSQL)
      ).toBe('text[]');
    });

    it('spells an array of a native type', () => {
      expect(
        typeOf(
          {
            typeName: 'String',
            list: true,
            nativeType: { name: 'VarChar', args: ['10'] },
          },
          Database.PostgreSQL,
          'postgresql'
        )
      ).toBe('varchar(10)[]');
    });

    it('keeps the element type on a dialect with no arrays', () => {
      expect(typeOf({ typeName: 'Int', list: true }, Database.MySQL)).toBe(
        'INTEGER'
      );
    });

    it('keeps the array primitive the element one', () => {
      expect(
        getPrimitiveType(
          typeOf({ typeName: 'Int', list: true }, Database.PostgreSQL),
          Database.PostgreSQL
        )
      ).toBe(PrimitiveType.int);
    });
  });

  describe('enums', () => {
    it('spells the stored values as a MySQL ENUM', () => {
      expect(typeOf({ typeName: 'Role' }, Database.MySQL)).toBe(
        "ENUM('USER','admin')"
      );
    });

    it('spells a MariaDB ENUM too', () => {
      expect(typeOf({ typeName: 'Role' }, Database.MariaDB)).toBe(
        "ENUM('USER','admin')"
      );
    });

    it('doubles a quote inside a value', () => {
      const enums = {
        Q: {
          ...ROLE,
          name: 'Q',
          values: [{ name: 'A', dbName: "it's", comment: '' }],
        },
      };

      expect(
        resolveDataType(
          createField({ typeName: 'Q' }),
          Database.MySQL,
          '',
          enums
        )
      ).toBe("ENUM('it''s')");
    });

    it('takes the string column elsewhere', () => {
      expect(typeOf({ typeName: 'Role' }, Database.PostgreSQL)).toBe('text');
      expect(typeOf({ typeName: 'Role' }, Database.MSSQL)).toBe(
        'nvarchar(1000)'
      );
    });

    it('finds no enum under an inherited property name', () => {
      expect(
        resolveDataType(
          createField({ typeName: 'toString' }),
          Database.MySQL,
          '',
          {}
        )
      ).toBe('');
    });
  });
});

describe('dataTypeComment', () => {
  it('is empty for a plain scalar', () => {
    expect(dataTypeComment(createField(), Database.MySQL, ENUMS)).toBe('');
  });

  it("lists an enum's stored values where no ENUM column holds them", () => {
    expect(
      dataTypeComment(
        createField({ typeName: 'Role' }),
        Database.PostgreSQL,
        ENUMS
      )
    ).toBe('Role: USER | admin');
  });

  it('names the enum by its database name', () => {
    expect(
      dataTypeComment(createField({ typeName: 'Role' }), Database.PostgreSQL, {
        Role: { ...ROLE, dbName: 'user_role' },
      })
    ).toBe('user_role: USER | admin');
  });

  it('says nothing where the ENUM column lists the values', () => {
    expect(
      dataTypeComment(createField({ typeName: 'Role' }), Database.MySQL, ENUMS)
    ).toBe('');
  });

  it('notes a list on a dialect with no arrays', () => {
    expect(
      dataTypeComment(
        createField({ typeName: 'Int', list: true }),
        Database.MySQL,
        ENUMS
      )
    ).toBe('list of Int');
  });

  it('notes nothing for a PostgreSQL array, which its type spells', () => {
    expect(
      dataTypeComment(
        createField({ typeName: 'Int', list: true }),
        Database.PostgreSQL,
        ENUMS
      )
    ).toBe('');
  });

  it('notes both for a list of enum values', () => {
    expect(
      dataTypeComment(
        createField({ typeName: 'Role', list: true }),
        Database.SQLite,
        ENUMS
      )
    ).toBe('list of Role Role: USER | admin');
  });

  it('notes nothing for an Unsupported type, whatever its name', () => {
    expect(
      dataTypeComment(
        createField({ typeName: 'Role', unsupported: true, list: true }),
        Database.SQLite,
        ENUMS
      )
    ).toBe('');
  });
});

describe('resolveDefault', () => {
  const defaultOf = (
    field: Partial<PrismaField>,
    dataType: string,
    database: number
  ) => resolveDefault(createField(field), dataType, database);

  it('gives MySQL the precision of the column it stamps', () => {
    expect(
      defaultOf(
        { typeName: 'DateTime', default: 'CURRENT_TIMESTAMP' },
        'DATETIME(3)',
        Database.MySQL
      )
    ).toBe('CURRENT_TIMESTAMP(3)');
  });

  it('gives MariaDB a TIMESTAMP precision too', () => {
    expect(
      defaultOf(
        { typeName: 'DateTime', default: 'CURRENT_TIMESTAMP' },
        'TIMESTAMP(6)',
        Database.MariaDB
      )
    ).toBe('CURRENT_TIMESTAMP(6)');
  });

  it('leaves CURRENT_TIMESTAMP bare for a column of no fractional seconds', () => {
    expect(
      defaultOf(
        { typeName: 'DateTime', default: 'CURRENT_TIMESTAMP' },
        'DATETIME(0)',
        Database.MySQL
      )
    ).toBe('CURRENT_TIMESTAMP');
    expect(
      defaultOf(
        { typeName: 'DateTime', default: 'CURRENT_TIMESTAMP' },
        'DATE',
        Database.MySQL
      )
    ).toBe('CURRENT_TIMESTAMP');
  });

  it('leaves CURRENT_TIMESTAMP alone on PostgreSQL', () => {
    expect(
      defaultOf(
        { typeName: 'DateTime', default: 'CURRENT_TIMESTAMP' },
        'timestamp(3)',
        Database.PostgreSQL
      )
    ).toBe('CURRENT_TIMESTAMP');
  });

  it('spells a SQL Server boolean as a bit', () => {
    expect(
      defaultOf({ typeName: 'Boolean', default: 'true' }, 'bit', Database.MSSQL)
    ).toBe('1');
    expect(
      defaultOf(
        { typeName: 'Boolean', default: 'false' },
        'bit',
        Database.MSSQL
      )
    ).toBe('0');
  });

  it('leaves any other SQL Server boolean default alone', () => {
    expect(
      defaultOf({ typeName: 'Boolean', default: '(1)' }, 'bit', Database.MSSQL)
    ).toBe('(1)');
  });

  it('leaves a boolean alone elsewhere', () => {
    expect(
      defaultOf(
        { typeName: 'Boolean', default: 'true' },
        'boolean',
        Database.PostgreSQL
      )
    ).toBe('true');
  });
});
