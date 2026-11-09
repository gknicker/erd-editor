import { describe, expect, it } from 'vite-plus/test';

import { parsePrismaModel } from '@/utils/schema-prisma-parser/parser';
import {
  PrismaEnum,
  PrismaField,
  PrismaModel,
  PrismaTable,
} from '@/utils/schema-prisma-parser/types';

function parse(source: string): PrismaModel {
  const result = parsePrismaModel(source);
  if (!result.ok) throw new Error(result.message);
  return result.model;
}

function table(source: string, name?: string): PrismaTable {
  const { tables } = parse(source);
  const found = name ? tables.find(entry => entry.name === name) : tables[0];
  if (!found) throw new Error(`expected a table ${name ?? ''}`);
  return found;
}

function fieldOf(entry: PrismaTable, name: string): PrismaField {
  const found = entry.fields.find(field => field.name === name);
  if (!found) throw new Error(`expected a field ${name}`);
  return found;
}

/** The field a, declared after an id so the model is one Prisma accepts. */
function field(declaration: string, rest = ''): PrismaField {
  return fieldOf(
    table(`model T {\n  id Int @id\n  a ${declaration}\n}\n${rest}`),
    'a'
  );
}

function defaultOf(declaration: string, rest = ''): string {
  return field(declaration, rest).default;
}

function enumOf(source: string, name: string): PrismaEnum {
  const found = parse(source).enums[name];
  if (!found) throw new Error(`expected an enum ${name}`);
  return found;
}

const BOOKSTORE = `// The bookstore, as a Prisma project writes it.

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

/// Where an order is in its life.
enum OrderStatus {
  pending   /// Awaiting payment
  paid
  cancelled @map("canceled")

  @@map("order_status")
}

/// People who wrote something we sell
model Author {
  id    Int          @id @default(autoincrement())
  name  String       @db.VarChar(120)
  books BookAuthor[]

  @@index([name], map: "idx_authors_name")
  @@map("authors")
}

model Book {
  id        Int          @id @default(autoincrement())
  /// ISBN-13, no dashes
  isbn      String       @unique @db.Char(13)
  price     Decimal      @default(0) @db.Decimal(10, 2)
  createdAt DateTime     @default(now()) @map("created_at")
  authors   BookAuthor[]
  orders    Order[]

  @@map("books")
}

model BookAuthor {
  bookId   Int    @map("book_id")
  authorId Int    @map("author_id")
  book     Book   @relation(fields: [bookId], references: [id])
  author   Author @relation(fields: [authorId], references: [id], onDelete: Cascade)

  @@id([bookId, authorId])
  @@map("book_authors")
}

model Order {
  id     Int         @id @default(autoincrement())
  bookId Int         @map("book_id")
  status OrderStatus @default(cancelled)
  book   Book        @relation(fields: [bookId], references: [id])

  @@index([bookId, id(sort: Desc)])
  @@map("orders")
}
`;

describe('schema-prisma-parser/parser', () => {
  it('returns an empty model for an empty document', () => {
    expect(parse('')).toEqual({
      provider: '',
      tables: [],
      enums: {},
      compositeTypes: [],
    });
  });

  it('returns an empty model for a document of comments alone', () => {
    expect(parse('// nothing here\n/// nor here\n/* nor here */')).toEqual(
      parse('')
    );
  });

  it('reports a source that is not a string rather than throwing', () => {
    const result = parsePrismaModel(null as unknown as string);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).not.toBe('');
  });

  describe('a whole schema', () => {
    const model = parse(BOOKSTORE);

    it('reads the provider', () => {
      expect(model.provider).toBe('postgresql');
    });

    it('reads every model in source order', () => {
      expect(model.tables.map(entry => entry.name)).toEqual([
        'Author',
        'Book',
        'BookAuthor',
        'Order',
      ]);
    });

    it('reads the table names @@map gives', () => {
      expect(model.tables.map(entry => entry.dbName)).toEqual([
        'authors',
        'books',
        'book_authors',
        'orders',
      ]);
    });

    it('reads a model with every field it declares, relation fields included', () => {
      expect(model.tables[1].fields.map(entry => entry.name)).toEqual([
        'id',
        'isbn',
        'price',
        'createdAt',
        'authors',
        'orders',
      ]);
    });

    it('reads a field in full', () => {
      expect(fieldOf(model.tables[1], 'isbn')).toEqual({
        name: 'isbn',
        dbName: '',
        comment: 'ISBN-13, no dashes',
        typeName: 'String',
        unsupported: false,
        optional: false,
        list: false,
        primaryKey: false,
        unique: true,
        autoIncrement: false,
        default: '',
        nativeType: { name: 'Char', args: ['13'] },
        relationName: '',
        relationFields: [],
        relationReferences: [],
      });
    });

    it('reads a relation field on the side that holds the foreign key', () => {
      expect(fieldOf(model.tables[2], 'author')).toMatchObject({
        typeName: 'Author',
        relationFields: ['authorId'],
        relationReferences: ['id'],
      });
    });

    it('reads a back-relation field, which carries no attribute', () => {
      expect(fieldOf(model.tables[0], 'books')).toMatchObject({
        typeName: 'BookAuthor',
        list: true,
        relationFields: [],
      });
    });

    it('reads a composite primary key', () => {
      expect(model.tables[2].primaryKey).toEqual(['bookId', 'authorId']);
    });

    it('reads the indexes', () => {
      expect(model.tables[0].indexes).toEqual([
        {
          name: 'idx_authors_name',
          unique: false,
          fields: [{ name: 'name', descending: false }],
        },
      ]);
      expect(model.tables[3].indexes[0].fields).toEqual([
        { name: 'bookId', descending: false },
        { name: 'id', descending: true },
      ]);
    });

    it('reads the enum', () => {
      expect(model.enums.OrderStatus).toEqual({
        name: 'OrderStatus',
        dbName: 'order_status',
        schemaName: '',
        comment: 'Where an order is in its life.',
        values: [
          { name: 'pending', dbName: '', comment: 'Awaiting payment' },
          { name: 'paid', dbName: '', comment: '' },
          { name: 'cancelled', dbName: 'canceled', comment: '' },
        ],
      });
    });

    it('resolves an enum default to the stored spelling', () => {
      expect(fieldOf(model.tables[3], 'status').default).toBe("'canceled'");
    });

    it('reads the model doc comment', () => {
      expect(model.tables[0].comment).toBe(
        'People who wrote something we sell'
      );
    });
  });

  describe('datasource', () => {
    it('leaves the provider empty without a datasource', () => {
      expect(parse('model T {\n  id Int @id\n}').provider).toBe('');
    });

    it('reads the provider whatever the datasource is named', () => {
      expect(parse('datasource pg {\n  provider = "mysql"\n}').provider).toBe(
        'mysql'
      );
    });

    it('keeps the first datasource, the only one Prisma allows', () => {
      expect(
        parse(
          'datasource a {\n  provider = "sqlite"\n}\ndatasource b {\n  provider = "mysql"\n}'
        ).provider
      ).toBe('sqlite');
    });

    it('ignores the keys around the provider, arrays included', () => {
      expect(
        parse(`datasource db {
  relationMode = "prisma"
  schemas      = ["auth", "forum"]
  provider     = "postgresql"
  directUrl    = env("DIRECT_URL")
}`).provider
      ).toBe('postgresql');
    });

    it('ignores a provider that is not a string', () => {
      expect(parse('datasource db {\n  provider = env("P")\n}').provider).toBe(
        ''
      );
    });

    it('ignores a line that is not a key and a value', () => {
      expect(
        parse('datasource db {\n  provider\n  = "x"\n  provider = "sqlite"\n}')
          .provider
      ).toBe('sqlite');
    });

    it('reads nothing from a datasource without a body', () => {
      expect(
        parse('datasource db\nmodel T {\n  id Int @id\n}').tables
      ).toHaveLength(1);
    });
  });

  describe('blocks', () => {
    it('skips a generator block', () => {
      expect(
        parse(`generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["views"]
}
model T {
  id Int @id
}`).tables.map(entry => entry.name)
      ).toEqual(['T']);
    });

    it('reads a view as a table and marks it', () => {
      expect(
        table('view Summary {\n  id Int @unique\n  total Int\n}')
      ).toMatchObject({ name: 'Summary', view: true });
    });

    it('marks a model as no view', () => {
      expect(table('model T {\n  id Int @id\n}').view).toBe(false);
    });

    it('records a composite type by name and reads none of its fields', () => {
      const model = parse(`type Address {
  street String
  city   String
}
model T {
  id      Int     @id
  address Address
}`);

      expect(model.compositeTypes).toEqual(['Address']);
      expect(model.tables.map(entry => entry.name)).toEqual(['T']);
    });

    it('skips a composite type with no name', () => {
      expect(parse('type {\n  a Int\n}').compositeTypes).toEqual([]);
    });

    it('skips a block whose keyword Prisma does not know', () => {
      expect(
        parse(`table Old {
  id Int
}
model T {
  id Int @id
}`).tables.map(entry => entry.name)
      ).toEqual(['T']);
    });

    it('skips a nested block inside an unknown one', () => {
      expect(
        parse('thing {\n  a {\n  }\n}\nmodel T {\n  id Int @id\n}').tables
      ).toHaveLength(1);
    });

    it('skips a model with no name', () => {
      expect(
        parse(
          'model {\n  id Int @id\n}\nmodel T {\n  id Int @id\n}'
        ).tables.map(entry => entry.name)
      ).toEqual(['T']);
    });

    it('skips a model with no body', () => {
      expect(
        parse('model A\nmodel T {\n  id Int @id\n}').tables.map(
          entry => entry.name
        )
      ).toEqual(['T']);
    });

    it('reads a model whose brace opens on the next line', () => {
      expect(table('model T\n{\n  id Int @id\n}').fields).toHaveLength(1);
    });

    it('reads a model written on one line', () => {
      expect(table('model T { id Int @id }').fields[0]).toMatchObject({
        name: 'id',
        primaryKey: true,
      });
    });

    it('reads a model closed at the end of the source', () => {
      expect(table('model T {\n  id Int @id').fields).toHaveLength(1);
    });

    it('skips stray tokens between blocks', () => {
      expect(parse('} "x" 1\nmodel T {\n  id Int @id\n}').tables).toHaveLength(
        1
      );
    });

    it('tolerates blank lines between fields', () => {
      expect(
        table('model T {\n\n  id Int @id\n\n\n  a Int\n\n}').fields
      ).toHaveLength(2);
    });

    it('reads @@schema', () => {
      expect(
        table('model T {\n  id Int @id\n  @@schema("auth")\n}').schemaName
      ).toBe('auth');
    });

    it('reads the labelled spelling of @@map', () => {
      expect(
        table('model T {\n  id Int @id\n  @@map(name: "t")\n}').dbName
      ).toBe('t');
    });

    it('ignores a block attribute with no slot, such as @@ignore', () => {
      const entry = table('model T {\n  id Int @id\n  @@ignore\n}');

      expect(entry.fields).toHaveLength(1);
      expect(entry.indexes).toEqual([]);
    });
  });

  describe('field types', () => {
    it('reads a required scalar', () => {
      expect(field('String')).toMatchObject({
        typeName: 'String',
        optional: false,
        list: false,
      });
    });

    it('reads an optional field', () => {
      expect(field('String?').optional).toBe(true);
    });

    it('reads an optional marker set apart by a space', () => {
      expect(field('String ?').optional).toBe(true);
    });

    it('reads a list', () => {
      expect(field('String[]')).toMatchObject({ list: true, optional: false });
    });

    it('reads both markers of an optional list, which Prisma refuses', () => {
      expect(field('String[]?')).toMatchObject({ list: true, optional: true });
    });

    it('reads an Unsupported type as its database type', () => {
      expect(field('Unsupported("circle")')).toMatchObject({
        typeName: 'circle',
        unsupported: true,
      });
    });

    it('reads an optional Unsupported type', () => {
      expect(field('Unsupported("geography(Point, 4326)")?')).toMatchObject({
        typeName: 'geography(Point, 4326)',
        unsupported: true,
        optional: true,
      });
    });

    it('reads an Unsupported type holding no string', () => {
      expect(field('Unsupported()').typeName).toBe('');
    });

    it('reads a bare Unsupported as a type name', () => {
      expect(field('Unsupported')).toMatchObject({
        typeName: 'Unsupported',
        unsupported: false,
      });
    });

    it('drops a field with no type', () => {
      expect(
        table('model T {\n  id Int @id\n  broken\n  later @id\n}').fields.map(
          entry => entry.name
        )
      ).toEqual(['id']);
    });

    it('reads fields named after Prisma keywords', () => {
      expect(
        table(
          'model T {\n  id Int @id\n  type String\n  model String\n  enum String\n}'
        ).fields.map(entry => entry.name)
      ).toEqual(['id', 'type', 'model', 'enum']);
    });

    it('skips a line that opens with no name', () => {
      expect(
        table('model T {\n  id Int @id\n  "a" Int\n  b Int\n}').fields.map(
          entry => entry.name
        )
      ).toEqual(['id', 'b']);
    });
  });

  describe('field attributes', () => {
    it('reads @id', () => {
      expect(field('Int @id').primaryKey).toBe(true);
    });

    it('reads @id with arguments', () => {
      expect(field('Int @id(map: "pk", clustered: false)').primaryKey).toBe(
        true
      );
    });

    it('reads @unique', () => {
      expect(field('String @unique').unique).toBe(true);
    });

    it('reads @unique with arguments', () => {
      expect(field('String @unique(map: "uq", sort: Desc)').unique).toBe(true);
    });

    it('reads @map', () => {
      expect(field('String @map("full_name")').dbName).toBe('full_name');
    });

    it('reads the labelled spelling of @map', () => {
      expect(field('String @map(name: "full_name")').dbName).toBe('full_name');
    });

    it('reads several attributes on one field', () => {
      expect(
        field('String @unique @map("e_mail") @db.VarChar(255)')
      ).toMatchObject({
        unique: true,
        dbName: 'e_mail',
        nativeType: { name: 'VarChar', args: ['255'] },
      });
    });

    it('ignores an attribute with no slot, such as @updatedAt', () => {
      expect(field('DateTime @updatedAt @ignore')).toMatchObject({
        typeName: 'DateTime',
        default: '',
      });
    });

    it('reads an attribute that ends the source without arguments', () => {
      expect(table('model T {\n  id Int @id').fields[0].primaryKey).toBe(true);
    });
  });

  describe('native types', () => {
    it('reads a native type without arguments', () => {
      expect(field('String @db.Uuid').nativeType).toEqual({
        name: 'Uuid',
        args: [],
      });
    });

    it('reads every argument', () => {
      expect(field('Decimal @db.Decimal(10, 2)').nativeType).toEqual({
        name: 'Decimal',
        args: ['10', '2'],
      });
    });

    it('keeps a named argument as written', () => {
      expect(field('String @db.NVarChar(Max)').nativeType?.args).toEqual([
        'Max',
      ]);
    });

    it('keeps a string argument quoted', () => {
      expect(
        field('String @db.Custom("x", [1], f(2))').nativeType?.args
      ).toEqual(['"x"', '[1]', 'f(2)']);
    });

    it('reads a native type written after any datasource name', () => {
      expect(field('String @pg.Citext').nativeType?.name).toBe('Citext');
    });

    it('leaves the native type empty without one', () => {
      expect(field('String').nativeType).toBeNull();
    });
  });

  describe('defaults', () => {
    it('reads an integer', () => {
      expect(defaultOf('Int @default(0)')).toBe('0');
    });

    it('reads a negative decimal', () => {
      expect(defaultOf('Float @default(-1.5)')).toBe('-1.5');
    });

    it('reads true and false verbatim', () => {
      expect(defaultOf('Boolean @default(true)')).toBe('true');
      expect(defaultOf('Boolean @default(false)')).toBe('false');
    });

    it('re-quotes a string in the SQL spelling the editor stores', () => {
      expect(defaultOf('String @default("draft")')).toBe("'draft'");
    });

    it('doubles a quote inside a string, as SQL spells it', () => {
      expect(defaultOf('String @default("it\'s")')).toBe("'it''s'");
    });

    it('unescapes a string before quoting it', () => {
      expect(defaultOf('String @default("a\\"b")')).toBe(`'a"b'`);
    });

    it('reads a JSON document, which Prisma writes as a string', () => {
      expect(defaultOf('Json @default("{}")')).toBe("'{}'");
    });

    it('reads the labelled spelling', () => {
      expect(defaultOf('Int @default(value: 5)')).toBe('5');
    });

    it('reads a default carrying a constraint name', () => {
      expect(defaultOf('Int @default(1, map: "df_a")')).toBe('1');
    });

    it('reads now() as CURRENT_TIMESTAMP', () => {
      expect(defaultOf('DateTime @default(now())')).toBe('CURRENT_TIMESTAMP');
    });

    it('reads the expression dbgenerated holds verbatim', () => {
      expect(
        defaultOf('String @default(dbgenerated("gen_random_uuid()"))')
      ).toBe('gen_random_uuid()');
    });

    it("keeps the quotes inside dbgenerated's expression", () => {
      expect(defaultOf(`String @default(dbgenerated("'draft'::text"))`)).toBe(
        "'draft'::text"
      );
    });

    it('reads an empty dbgenerated as no default', () => {
      expect(defaultOf('String @default(dbgenerated())')).toBe('');
    });

    it.each(['uuid()', 'uuid(7)', 'cuid()', 'cuid(2)', 'ulid()', 'nanoid(8)'])(
      'reads %s, which the Prisma client generates, as no default',
      call => {
        expect(defaultOf(`String @default(${call})`)).toBe('');
      }
    );

    it('reads auto(), which MongoDB generates, as no default', () => {
      expect(defaultOf('String @default(auto()) @db.ObjectId')).toBe('');
    });

    it('reads autoincrement() as a flag, not a default', () => {
      expect(field('Int @default(autoincrement())')).toMatchObject({
        autoIncrement: true,
        default: '',
      });
    });

    it("reads CockroachDB's sequence() as a flag too", () => {
      expect(
        field('BigInt @default(sequence(maxValue: 100))').autoIncrement
      ).toBe(true);
    });

    it('reads an empty list as an array literal with no element type', () => {
      expect(defaultOf('String[] @default([])')).toBe("'{}'");
    });

    it('reads a list', () => {
      expect(defaultOf('String[] @default(["a", "b"])')).toBe(
        "ARRAY['a', 'b']"
      );
    });

    it('reads a list of numbers', () => {
      expect(defaultOf('Int[] @default([1, 2])')).toBe('ARRAY[1, 2]');
    });

    it('reads an enum member as the string it stores', () => {
      expect(
        defaultOf('Role @default(USER)', 'enum Role {\n  USER\n  ADMIN\n}')
      ).toBe("'USER'");
    });

    it("reads an enum member's @map spelling, which is what the table stores", () => {
      expect(
        defaultOf(
          'Role @default(ADMIN)',
          'enum Role {\n  USER\n  ADMIN @map("admin")\n}'
        )
      ).toBe("'admin'");
    });

    it('reads a list of enum members', () => {
      expect(
        defaultOf(
          'Role[] @default([USER, ADMIN])',
          'enum Role {\n  USER @map("user")\n  ADMIN\n}'
        )
      ).toBe("ARRAY['user', 'ADMIN']");
    });

    it('quotes a bare name no enum declares', () => {
      expect(defaultOf('Role @default(GUEST)')).toBe("'GUEST'");
    });

    it('reads a default with no value as none', () => {
      expect(defaultOf('Int @default()')).toBe('');
    });

    it('leaves a field without @default empty', () => {
      expect(defaultOf('Int')).toBe('');
    });
  });

  describe('relations', () => {
    const RELATED = `model User {
  id    Int    @id
  posts Post[] @relation("Written")
}
model Post {
  id       Int  @id
  authorId Int
  author   User @relation("Written", fields: [authorId], references: [id], onDelete: Cascade, map: "fk_author")
}`;

    it('reads the name, the fields and the references', () => {
      expect(fieldOf(table(RELATED, 'Post'), 'author')).toMatchObject({
        relationName: 'Written',
        relationFields: ['authorId'],
        relationReferences: ['id'],
      });
    });

    it('reads a name on the back-relation side', () => {
      expect(fieldOf(table(RELATED, 'User'), 'posts').relationName).toBe(
        'Written'
      );
    });

    it('reads the labelled spelling of the name', () => {
      expect(
        field('User @relation(name: "Owner", fields: [x], references: [id])')
          .relationName
      ).toBe('Owner');
    });

    it('leaves the name empty when only fields are given', () => {
      expect(
        field('User @relation(fields: [x], references: [id])').relationName
      ).toBe('');
    });

    it('reads a composite foreign key in order', () => {
      expect(
        field(
          'Order @relation(fields: [orderStore, orderNumber], references: [storeId, number])'
        )
      ).toMatchObject({
        relationFields: ['orderStore', 'orderNumber'],
        relationReferences: ['storeId', 'number'],
      });
    });

    it('reads a single field written without brackets, as Prisma allows', () => {
      expect(
        field('User @relation(fields: userId, references: id)')
      ).toMatchObject({
        relationFields: ['userId'],
        relationReferences: ['id'],
      });
    });

    it('drops a list entry that is not a field name', () => {
      expect(
        field('User @relation(fields: [a, "b", 1], references: [id])')
          .relationFields
      ).toEqual(['a']);
    });
  });

  describe('block attributes', () => {
    const block = (attribute: string): PrismaTable =>
      table(`model T {\n  id Int @id\n  a Int\n  b Int\n  ${attribute}\n}`);

    it('reads @@id', () => {
      expect(block('@@id([a, b])').primaryKey).toEqual(['a', 'b']);
    });

    it('reads the labelled spelling of @@id', () => {
      expect(block('@@id(fields: [a, b], name: "ab")').primaryKey).toEqual([
        'a',
        'b',
      ]);
    });

    it('reads @@unique as a unique index', () => {
      expect(block('@@unique([a, b])').indexes).toEqual([
        {
          name: '',
          unique: true,
          fields: [
            { name: 'a', descending: false },
            { name: 'b', descending: false },
          ],
        },
      ]);
    });

    it('reads a single-field @@unique as an index, as it is written', () => {
      expect(block('@@unique([a])').indexes[0]).toMatchObject({
        unique: true,
        fields: [{ name: 'a', descending: false }],
      });
    });

    it("reads @@unique's map as the index name", () => {
      expect(block('@@unique([a, b], map: "uq_ab")').indexes[0].name).toBe(
        'uq_ab'
      );
    });

    it("ignores @@unique's name, which names the key in the client alone", () => {
      expect(block('@@unique([a, b], name: "ab")').indexes[0].name).toBe('');
    });

    it('reads @@index', () => {
      expect(block('@@index([a])').indexes[0]).toMatchObject({
        name: '',
        unique: false,
      });
    });

    it("reads @@index's map as the index name", () => {
      expect(block('@@index([a], map: "idx_a")').indexes[0].name).toBe('idx_a');
    });

    it("reads @@index's name, the legacy spelling of map", () => {
      expect(block('@@index([a], name: "idx_a")').indexes[0].name).toBe(
        'idx_a'
      );
    });

    it('reads a descending field', () => {
      expect(
        block('@@index([a(sort: Desc), b(sort: Asc)])').indexes[0].fields
      ).toEqual([
        { name: 'a', descending: true },
        { name: 'b', descending: false },
      ]);
    });

    it('ignores the field options the editor has no slot for', () => {
      expect(
        block('@@index([a(length: 10), b(ops: raw("x"))], type: Hash)')
          .indexes[0].fields
      ).toEqual([
        { name: 'a', descending: false },
        { name: 'b', descending: false },
      ]);
    });

    it('reads the labelled spelling of the field list', () => {
      expect(
        block('@@index(fields: [a], map: "idx")').indexes[0]
      ).toMatchObject({
        name: 'idx',
        fields: [{ name: 'a', descending: false }],
      });
    });

    it('reads a single field written without brackets', () => {
      expect(block('@@index(a)').indexes[0].fields).toEqual([
        { name: 'a', descending: false },
      ]);
    });

    it('reads a dotted path into a composite type', () => {
      expect(block('@@index([address.city])').indexes[0].fields[0].name).toBe(
        'address.city'
      );
    });

    it('reads @@fulltext as an index', () => {
      expect(block('@@fulltext([a, b], map: "ft")').indexes[0]).toMatchObject({
        name: 'ft',
        unique: false,
      });
    });

    it('drops an index naming no field', () => {
      expect(block('@@index([])').indexes).toEqual([]);
      expect(block('@@index()').indexes).toEqual([]);
      expect(block('@@index(["a"])').indexes).toEqual([]);
    });

    it('reads several block attributes in order', () => {
      const entry = table(`model T {
  id Int @id
  a  Int
  @@index([a])
  @@unique([a, id])
  @@map("t")
}`);

      expect(entry.indexes.map(index => index.unique)).toEqual([false, true]);
      expect(entry.dbName).toBe('t');
    });
  });

  describe('enums', () => {
    it('reads the values in order', () => {
      expect(
        enumOf('enum Role {\n  USER\n  ADMIN\n}', 'Role').values.map(
          value => value.name
        )
      ).toEqual(['USER', 'ADMIN']);
    });

    it('reads @@map and @@schema', () => {
      expect(
        enumOf(
          'enum Role {\n  USER\n  @@map("role")\n  @@schema("auth")\n}',
          'Role'
        )
      ).toMatchObject({ dbName: 'role', schemaName: 'auth' });
    });

    it('reads the labelled spelling of a value @map', () => {
      expect(
        enumOf('enum Role {\n  USER @map(name: "user")\n}', 'Role').values[0]
          .dbName
      ).toBe('user');
    });

    it('ignores a value attribute other than @map', () => {
      expect(
        enumOf('enum Role {\n  USER @other("x") @map("user")\n}', 'Role')
          .values[0].dbName
      ).toBe('user');
    });

    it('ignores a block attribute other than @@map and @@schema', () => {
      expect(
        enumOf('enum Role {\n  USER\n  @@ignore\n}', 'Role').values
      ).toHaveLength(1);
    });

    it('reads the doc comments of the enum and of a value', () => {
      const prismaEnum = enumOf(
        '/// Who may sign in\nenum Role {\n  /// Everyone\n  USER /// by default\n}',
        'Role'
      );

      expect(prismaEnum.comment).toBe('Who may sign in');
      expect(prismaEnum.values[0].comment).toBe('Everyone\nby default');
    });

    it('skips a line that opens with no name', () => {
      expect(
        enumOf('enum Role {\n  "USER"\n  ADMIN\n}', 'Role').values.map(
          value => value.name
        )
      ).toEqual(['ADMIN']);
    });

    it('skips an enum with no name', () => {
      expect(parse('enum {\n  A\n}').enums).toEqual({});
    });

    it('registers an enum whatever its name, __proto__ included', () => {
      const { enums } = parse('enum __proto__ {\n  A\n}');

      expect(Object.keys(enums)).toEqual(['__proto__']);
    });

    it("keeps an inherited property's name from resolving to an enum", () => {
      expect(defaultOf('toString @default(A)')).toBe("'A'");
    });
  });

  describe('doc comments', () => {
    it('joins consecutive lines with a line break', () => {
      expect(
        table('/// one\n/// two\nmodel T {\n  id Int @id\n}').comment
      ).toBe('one\ntwo');
    });

    it('keeps a plain comment between doc lines from splitting them', () => {
      expect(
        table('/// one\n// plain\n/// two\nmodel T {\n  id Int @id\n}').comment
      ).toBe('one\ntwo');
    });

    it('detaches a doc comment a blank line separates from its block', () => {
      expect(
        table('/// file header\n\nmodel T {\n  id Int @id\n}').comment
      ).toBe('');
    });

    it('keeps only the last run of doc comments before a block', () => {
      expect(
        table('/// one\n\n/// two\nmodel T {\n  id Int @id\n}').comment
      ).toBe('two');
    });

    it('keeps a doc comment for a field across a blank line, as Prisma does', () => {
      expect(
        fieldOf(table('model T {\n  /// the key\n\n  id Int @id\n}'), 'id')
          .comment
      ).toBe('the key');
    });

    it('keeps only the last run of doc comments before a field', () => {
      expect(
        fieldOf(
          table('model T {\n  /// one\n\n  /// two\n  id Int @id\n}'),
          'id'
        ).comment
      ).toBe('two');
    });

    it('appends a trailing doc comment to the ones before the field', () => {
      expect(
        fieldOf(
          table('model T {\n  /// before\n  id Int @id /// after\n}'),
          'id'
        ).comment
      ).toBe('before\nafter');
    });

    it('reads a trailing doc comment alone', () => {
      expect(field('Int /// trailing').comment).toBe('trailing');
    });

    it('carries a doc comment past a block attribute to the next field', () => {
      expect(
        fieldOf(
          table(
            'model T {\n  id Int @id\n  /// for a\n  @@map("t")\n  a Int\n}'
          ),
          'a'
        ).comment
      ).toBe('for a');
    });

    it('drops a doc comment on the line of the opening brace', () => {
      expect(
        fieldOf(table('model T { /// header\n  id Int @id\n}'), 'id').comment
      ).toBe('');
    });

    it('drops a doc comment at the end of a body', () => {
      expect(
        parse(
          'model A {\n  id Int @id\n  /// dangling\n}\nmodel B {\n  id Int @id\n}'
        ).tables.map(entry => entry.comment)
      ).toEqual(['', '']);
    });

    it('keeps a doc comment above a datasource from reaching the next model', () => {
      expect(
        table(
          '/// the database\ndatasource db {\n  provider = "sqlite"\n}\nmodel T {\n  id Int @id\n}'
        ).comment
      ).toBe('');
    });

    it('reads a block comment as a plain comment', () => {
      expect(
        fieldOf(table('model T {\n  /* the key */\n  id Int @id\n}'), 'id')
          .comment
      ).toBe('');
    });

    it('gives a field left without a doc comment an empty one', () => {
      expect(field('Int').comment).toBe('');
    });
  });

  describe('degrading rather than throwing', () => {
    it('loses only the line of an unclosed argument list', () => {
      expect(
        table(
          'model T {\n  id Int @id\n  a Int @default(\n  b Int\n}\nmodel U {\n  id Int @id\n}'
        ).fields.map(entry => entry.name)
      ).toEqual(['id', 'a']);
    });

    it('keeps the next model after an unclosed argument list', () => {
      expect(
        parse(
          'model T {\n  a Int @default(\n}\nmodel U {\n  id Int @id\n}'
        ).tables.map(entry => entry.name)
      ).toEqual(['T', 'U']);
    });

    it('keeps the next model after an unclosed list', () => {
      const model = parse(
        'model T {\n  a Int[] @default([1\n}\nmodel U {\n  id Int @id\n}'
      );

      expect(model.tables.map(entry => entry.name)).toEqual(['T', 'U']);
      expect(model.tables[0].fields[0].default).toBe('ARRAY[1]');
    });

    it('skips tokens no value starts with inside an argument list', () => {
      expect(field('Int @default(= 5)').default).toBe('5');
      expect(field('Int[] @default([=, 5])').default).toBe('ARRAY[5]');
    });

    it('reads an argument list the source ends inside', () => {
      expect(table('model T {\n  a Int @default(1').fields[0].default).toBe(
        '1'
      );
      expect(table('model T {\n  a Int @default(x:').fields[0].default).toBe(
        ''
      );
    });

    it('reads an array the source ends inside', () => {
      expect(table('model T {\n  a Int @default([1').fields[0].default).toBe(
        'ARRAY[1]'
      );
    });

    it('skips a stray closing brace at the top level', () => {
      expect(
        parse('}\nmodel T {\n  id Int @id\n}').tables.map(entry => entry.name)
      ).toEqual(['T']);
    });

    it('reads a truncated document without throwing', () => {
      expect(parsePrismaModel('model T {\n  id Int @id @default(').ok).toBe(
        true
      );
    });
  });
});
