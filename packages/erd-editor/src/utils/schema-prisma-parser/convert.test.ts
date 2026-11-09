import { ERDEditorSchemaV3 } from '@dineug/erd-editor-schema';
import { describe, expect, it } from 'vite-plus/test';

import { COLUMN_MIN_WIDTH } from '@/constants/layout';
import {
  ColumnOption,
  ColumnUIKey,
  Database,
  OrderType,
  RelationshipType,
  StartRelationshipType,
} from '@/constants/schema';
import { createEngineContext } from '@/engine/context';
import { Column, Relationship, Table } from '@/internal-types';
import { bHas } from '@/utils/bit';
import { convertToSchema } from '@/utils/schema-prisma-parser/convert';
import { parsePrismaModel } from '@/utils/schema-prisma-parser/parser';

const ctx = createEngineContext({ toWidth: text => text.length * 10 });

function convert(
  source: string,
  database: number = Database.PostgreSQL
): ERDEditorSchemaV3 {
  const result = parsePrismaModel(source);
  if (!result.ok) throw new Error(result.message);
  return convertToSchema(result.model, ctx, database);
}

const tablesOf = (schema: ERDEditorSchemaV3): Table[] =>
  schema.doc.tableIds.map(id => schema.collections.tableEntities[id]);

const tableNames = (schema: ERDEditorSchemaV3): string[] =>
  tablesOf(schema).map(table => table.name);

function tableOf(schema: ERDEditorSchemaV3, name: string): Table {
  const table = tablesOf(schema).find(entry => entry.name === name);
  if (!table) throw new Error(`no table named ${name}`);
  return table;
}

const columnsOf = (schema: ERDEditorSchemaV3, name: string): Column[] =>
  tableOf(schema, name).columnIds.map(
    id => schema.collections.tableColumnEntities[id]
  );

const columnNames = (schema: ERDEditorSchemaV3, name: string): string[] =>
  columnsOf(schema, name).map(column => column.name);

function columnOf(
  schema: ERDEditorSchemaV3,
  tableName: string,
  columnName: string
): Column {
  const column = columnsOf(schema, tableName).find(
    entry => entry.name === columnName
  );
  if (!column) throw new Error(`no column named ${columnName}`);
  return column;
}

/** The column a, declared in model T after an id. */
function column(
  declaration: string,
  rest = '',
  database: number = Database.PostgreSQL
): Column {
  return columnOf(
    convert(
      `model T {\n  id Int @id\n  a ${declaration}\n}\n${rest}`,
      database
    ),
    'T',
    'a'
  );
}

const has = (value: Column, option: number) => bHas(value.options, option);

const relationshipsOf = (schema: ERDEditorSchemaV3): Relationship[] =>
  schema.doc.relationshipIds.map(
    id => schema.collections.relationshipEntities[id]
  );

/** Each relationship as parent(columns) -> child(columns), by column name. */
const edgesOf = (schema: ERDEditorSchemaV3): string[] =>
  relationshipsOf(schema).map(relationship => {
    const names = (tableId: string, columnIds: string[]) =>
      `${schema.collections.tableEntities[tableId].name}(${columnIds
        .map(id => schema.collections.tableColumnEntities[id].name)
        .join(',')})`;

    return `${names(
      relationship.start.tableId,
      relationship.start.columnIds
    )} -> ${names(relationship.end.tableId, relationship.end.columnIds)}`;
  });

function relationshipOf(source: string, database?: number): Relationship {
  const [relationship, ...rest] = relationshipsOf(convert(source, database));
  if (!relationship || rest.length) {
    throw new Error('expected exactly one relationship');
  }
  return relationship;
}

/** Each index as table(column[ DESC], ...), with UNIQUE and its name when set. */
const indexesOf = (schema: ERDEditorSchemaV3): string[] =>
  schema.doc.indexIds.map(id => {
    const index = schema.collections.indexEntities[id];
    const table = schema.collections.tableEntities[index.tableId];
    const columns = index.indexColumnIds.map(indexColumnId => {
      const indexColumn = schema.collections.indexColumnEntities[indexColumnId];
      const name =
        schema.collections.tableColumnEntities[indexColumn.columnId].name;
      return indexColumn.orderType === OrderType.DESC ? `${name} DESC` : name;
    });

    return `${index.unique ? 'UNIQUE ' : ''}${index.name || '-'} ${table.name}(${columns.join(', ')})`;
  });

const SHOP = `datasource db {
  provider = "postgresql"
}

/// Someone who buys
model Customer {
  id        Int       @id @default(autoincrement())
  email     String    @unique @db.VarChar(254)
  fullName  String    @map("full_name")
  /// When they signed up
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  tags      String[]
  orders    Order[]
  profile   Profile?

  @@map("customers")
}

model Profile {
  customerId Int      @id @map("customer_id")
  bio        String?
  customer   Customer @relation(fields: [customerId], references: [id])

  @@map("profiles")
}

enum OrderState {
  DRAFT
  PAID  @map("paid")
}

model Order {
  id         BigInt     @id @default(autoincrement())
  customerId Int        @map("customer_id")
  state      OrderState @default(PAID)
  placedAt   DateTime?  @map("placed_at")
  search     Unsupported("tsvector")?
  customer   Customer   @relation(fields: [customerId], references: [id])
  lines      OrderLine[]

  @@index([customerId, placedAt(sort: Desc)], map: "idx_orders_customer")
  @@map("orders")
}

model OrderLine {
  orderId  BigInt  @map("order_id")
  lineNo   Int     @map("line_no") @db.SmallInt
  sku      String  @db.VarChar(40)
  quantity Int     @default(1)
  order    Order   @relation(fields: [orderId], references: [id])

  @@id([orderId, lineNo])
  @@unique([orderId, sku])
  @@map("order_lines")
}
`;

describe('schema-prisma-parser/convert', () => {
  it('produces an empty document for an empty model', () => {
    const schema = convert('');

    expect(schema.doc.tableIds).toEqual([]);
    expect(schema.doc.relationshipIds).toEqual([]);
    expect(schema.doc.indexIds).toEqual([]);
  });

  describe('a whole schema', () => {
    const schema = convert(SHOP);

    it('creates a table per model under its database name, in order', () => {
      expect(tableNames(schema)).toEqual([
        'customers',
        'profiles',
        'orders',
        'order_lines',
      ]);
    });

    it('creates a column per scalar, enum and Unsupported field', () => {
      expect(columnNames(schema, 'customers')).toEqual([
        'id',
        'email',
        'full_name',
        'created_at',
        'tags',
      ]);
      expect(columnNames(schema, 'orders')).toEqual([
        'id',
        'customer_id',
        'state',
        'placed_at',
        'search',
      ]);
    });

    it('reads a column in full', () => {
      expect(columnOf(schema, 'customers', 'created_at')).toMatchObject({
        comment: 'When they signed up',
        dataType: 'timestamptz(6)',
        default: 'CURRENT_TIMESTAMP',
      });
    });

    it('draws a relationship per foreign key, and no column for one', () => {
      expect(edgesOf(schema)).toEqual([
        'customers(id) -> profiles(customer_id)',
        'customers(id) -> orders(customer_id)',
        'orders(id) -> order_lines(order_id)',
      ]);
      expect(tableNames(schema)).toHaveLength(4);
    });

    it('reads every index', () => {
      expect(indexesOf(schema)).toEqual([
        'idx_orders_customer orders(customer_id, placed_at DESC)',
        'UNIQUE - order_lines(order_id, sku)',
      ]);
    });

    it('registers every column and index column it creates', () => {
      const columnIds = tablesOf(schema).flatMap(table => table.columnIds);

      expect(
        Object.keys(schema.collections.tableColumnEntities).sort()
      ).toEqual([...columnIds].sort());
      expect(Object.keys(schema.collections.indexColumnEntities)).toHaveLength(
        4
      );
    });
  });

  describe('tables', () => {
    it('names a table after its model without @@map', () => {
      expect(tableNames(convert('model User {\n  id Int @id\n}'))).toEqual([
        'User',
      ]);
    });

    it('carries the model doc comment', () => {
      expect(
        tableOf(convert('/// people\nmodel User {\n  id Int @id\n}'), 'User')
          .comment
      ).toBe('people');
    });

    it('imports a view as a table', () => {
      expect(
        columnNames(
          convert('view Summary {\n  id Int @unique\n  total Int\n}'),
          'Summary'
        )
      ).toEqual(['id', 'total']);
    });

    it('measures the name and the comment', () => {
      const table = tableOf(
        convert('/// the people table\nmodel user_account {\n  id Int @id\n}'),
        'user_account'
      );

      expect(table.ui.widthName).toBe(120);
      expect(table.ui.widthComment).toBe(160);
    });

    it('never measures below the column minimum', () => {
      expect(
        tableOf(convert('model U {\n  id Int @id\n}'), 'U').ui.widthName
      ).toBe(COLUMN_MIN_WIDTH);
    });

    it('fills seqColumnIds alongside columnIds', () => {
      const table = tableOf(
        convert('model U {\n  id Int @id\n  name String\n}'),
        'U'
      );

      expect(table.seqColumnIds).toEqual(table.columnIds);
      expect(table.columnIds).toHaveLength(2);
    });

    it('keeps a table with no column, as a model of relation fields is', () => {
      expect(
        columnNames(
          convert(
            'model A {\n  b B[]\n}\nmodel B {\n  id Int @id\n  as A[]\n}'
          ),
          'A'
        )
      ).toEqual([]);
    });
  });

  describe('schema qualification', () => {
    it('drops the schema when the file uses only one', () => {
      expect(
        tableNames(
          convert(
            'model A {\n  id Int @id\n  @@schema("auth")\n}\nmodel B {\n  id Int @id\n  @@schema("auth")\n}'
          )
        )
      ).toEqual(['A', 'B']);
    });

    it('prefixes the schema when the file spreads models over several', () => {
      expect(
        tableNames(
          convert(`model User {
  id Int @id
  @@map("users")
  @@schema("auth")
}
model Board {
  id Int @id
  @@schema("forum")
}`)
        )
      ).toEqual(['auth_users', 'forum_Board']);
    });

    it('never prefixes a default schema', () => {
      expect(
        tableNames(
          convert(`model A {
  id Int @id
  @@schema("public")
}
model B {
  id Int @id
  @@schema("dbo")
}
model C {
  id Int @id
  @@schema("auth")
}`)
        )
      ).toEqual(['A', 'B', 'auth_C']);
    });
  });

  describe('which fields become columns', () => {
    it('skips a relation field on either side', () => {
      const schema = convert(`model User {
  id    Int    @id
  posts Post[]
}
model Post {
  id       Int  @id
  authorId Int
  author   User @relation(fields: [authorId], references: [id])
}`);

      expect(columnNames(schema, 'User')).toEqual(['id']);
      expect(columnNames(schema, 'Post')).toEqual(['id', 'authorId']);
    });

    it('skips a relation field to a view', () => {
      expect(
        columnNames(
          convert(
            'model A {\n  id Int @id\n  s S\n}\nview S {\n  id Int @unique\n}'
          ),
          'A'
        )
      ).toEqual(['id']);
    });

    it('skips a composite type field', () => {
      expect(
        columnNames(
          convert(
            'type Address {\n  city String\n}\nmodel A {\n  id Int @id\n  address Address\n}'
          ),
          'A'
        )
      ).toEqual(['id']);
    });

    it('skips a field whose type no block declares', () => {
      expect(
        columnNames(convert('model A {\n  id Int @id\n  b Missing\n}'), 'A')
      ).toEqual(['id']);
    });

    it('keeps an enum field', () => {
      expect(
        column('Role', 'enum Role {\n  USER\n}', Database.MySQL).dataType
      ).toBe("ENUM('USER')");
    });

    it('keeps an Unsupported field', () => {
      expect(column('Unsupported("circle")?').dataType).toBe('circle');
    });
  });

  describe('columns', () => {
    it('names a column after @map', () => {
      expect(
        columnNames(
          convert('model A {\n  id Int @id @map("a_id")\n  b Int\n}'),
          'A'
        )
      ).toEqual(['a_id', 'b']);
    });

    it('types a column for the dialect given', () => {
      expect(column('String', '', Database.MySQL).dataType).toBe(
        'VARCHAR(191)'
      );
      expect(column('String', '', Database.PostgreSQL).dataType).toBe('text');
    });

    it('makes a required field NOT NULL', () => {
      expect(has(column('Int'), ColumnOption.notNull)).toBe(true);
    });

    it('leaves an optional field nullable', () => {
      expect(has(column('Int?'), ColumnOption.notNull)).toBe(false);
    });

    it('leaves a list nullable, as Prisma creates it', () => {
      const list = column('String[]');

      expect(list.dataType).toBe('text[]');
      expect(has(list, ColumnOption.notNull)).toBe(false);
    });

    it('reads @unique', () => {
      expect(has(column('String @unique'), ColumnOption.unique)).toBe(true);
      expect(has(column('String'), ColumnOption.unique)).toBe(false);
    });

    it('reads autoincrement()', () => {
      const entry = column('Int @default(autoincrement())');

      expect(has(entry, ColumnOption.autoIncrement)).toBe(true);
      expect(entry.default).toBe('');
    });

    it('reads the default', () => {
      expect(column('String @default("draft")').default).toBe("'draft'");
    });

    it('spells the default for the dialect', () => {
      expect(
        column('DateTime @default(now())', '', Database.MySQL).default
      ).toBe('CURRENT_TIMESTAMP(3)');
      expect(column('Boolean @default(true)', '', Database.MSSQL).default).toBe(
        '1'
      );
    });

    it('joins the doc comment and what the type cannot say', () => {
      expect(
        column('Role /// who they are', 'enum Role {\n  USER\n  ADMIN\n}')
          .comment
      ).toBe('who they are Role: USER | ADMIN');
    });

    it('measures every cell', () => {
      const entry = column('String @default("draft") /// a note');

      expect(entry.ui.widthName).toBe(COLUMN_MIN_WIDTH);
      expect(entry.ui.widthDataType).toBe(COLUMN_MIN_WIDTH);
      expect(entry.ui.widthDefault).toBe(70);
      expect(entry.ui.widthComment).toBe(COLUMN_MIN_WIDTH);
    });
  });

  describe('primary keys', () => {
    it('marks an @id column in options and in its key icon', () => {
      const id = columnOf(convert('model A {\n  id Int @id\n}'), 'A', 'id');

      expect(has(id, ColumnOption.primaryKey)).toBe(true);
      expect(id.ui.keys).toBe(ColumnUIKey.primaryKey);
    });

    it('marks every column of an @@id', () => {
      const schema = convert(
        'model A {\n  a Int\n  b Int\n  c Int\n  @@id([a, b])\n}'
      );

      expect(
        columnsOf(schema, 'A').map(entry => has(entry, ColumnOption.primaryKey))
      ).toEqual([true, true, false]);
      expect(columnOf(schema, 'A', 'c').ui.keys).toBe(0);
    });

    it('finds an @@id column by its Prisma name under @map', () => {
      expect(
        has(
          columnOf(
            convert('model A {\n  a Int @map("a_col")\n  @@id([a])\n}'),
            'A',
            'a_col'
          ),
          ColumnOption.primaryKey
        )
      ).toBe(true);
    });

    it('makes a primary key NOT NULL, which Prisma requires', () => {
      expect(
        has(
          columnOf(convert('model A {\n  id Int @id\n}'), 'A', 'id'),
          ColumnOption.notNull
        )
      ).toBe(true);
    });
  });

  describe('indexes', () => {
    const indexes = (attribute: string, database?: number) =>
      indexesOf(
        convert(
          `model T {\n  id Int @id\n  a Int @map("a_col")\n  b Int\n  ${attribute}\n}`,
          database
        )
      );

    it('reads @@index by Prisma name, naming the columns by database name', () => {
      expect(indexes('@@index([a, b])')).toEqual(['- T(a_col, b)']);
    });

    it('reads the map name', () => {
      expect(indexes('@@index([b], map: "idx_b")')).toEqual(['idx_b T(b)']);
    });

    it('reads @@unique', () => {
      expect(indexes('@@unique([a, b])')).toEqual(['UNIQUE - T(a_col, b)']);
    });

    it('reads a descending column', () => {
      expect(indexes('@@index([a(sort: Desc), b])')).toEqual([
        '- T(a_col DESC, b)',
      ]);
    });

    it('reads @@fulltext as an index', () => {
      expect(indexes('@@fulltext([a, b])', Database.MySQL)).toEqual([
        '- T(a_col, b)',
      ]);
    });

    it('drops a field that is no column, keeping the rest', () => {
      expect(indexes('@@index([a, nope])')).toEqual(['- T(a_col)']);
    });

    it('drops an index left with no column', () => {
      expect(indexes('@@index([nope])')).toEqual([]);
    });

    it('keeps the index order across tables', () => {
      expect(
        indexesOf(
          convert(
            'model A {\n  id Int @id\n  x Int\n  @@index([x])\n}\nmodel B {\n  id Int @id\n  y Int\n  @@index([y])\n}'
          )
        )
      ).toEqual(['- A(x)', '- B(y)']);
    });
  });

  describe('relationships', () => {
    const USER_POSTS = `model User {
  id    Int    @id @map("user_id")
  posts Post[]
  @@map("users")
}
model Post {
  id       Int  @id
  authorId Int  @map("author_id")
  author   User @relation(fields: [authorId], references: [id])
  @@map("posts")
}`;

    it('draws the referenced columns to the foreign key, by database name', () => {
      expect(edgesOf(convert(USER_POSTS))).toEqual([
        'users(user_id) -> posts(author_id)',
      ]);
    });

    it('reads a list back-relation as one-to-many', () => {
      expect(relationshipOf(USER_POSTS).relationshipType).toBe(
        RelationshipType.ZeroN
      );
    });

    it('reads a singular back-relation as one-to-one', () => {
      expect(
        relationshipOf(`model User {
  id      Int      @id
  profile Profile?
}
model Profile {
  id     Int  @id
  userId Int  @unique
  user   User @relation(fields: [userId], references: [id])
}`).relationshipType
      ).toBe(RelationshipType.ZeroOne);
    });

    it('starts with a dash when the foreign key is required', () => {
      expect(relationshipOf(USER_POSTS).startRelationshipType).toBe(
        StartRelationshipType.dash
      );
    });

    it('starts with a ring when the foreign key is optional', () => {
      expect(
        relationshipOf(`model User {
  id    Int    @id
  posts Post[]
}
model Post {
  id       Int   @id
  authorId Int?
  author   User? @relation(fields: [authorId], references: [id])
}`).startRelationshipType
      ).toBe(StartRelationshipType.ring);
    });

    it('marks the foreign key column', () => {
      const schema = convert(USER_POSTS);

      expect(columnOf(schema, 'posts', 'author_id').ui.keys).toBe(
        ColumnUIKey.foreignKey
      );
      expect(relationshipOf(USER_POSTS).identification).toBe(false);
    });

    it('identifies a foreign key that is the primary key, keeping both marks', () => {
      const source = `model User {
  id      Int      @id
  profile Profile?
}
model Profile {
  userId Int  @id
  user   User @relation(fields: [userId], references: [id])
}`;

      expect(columnOf(convert(source), 'Profile', 'userId').ui.keys).toBe(
        ColumnUIKey.primaryKey | ColumnUIKey.foreignKey
      );
      expect(relationshipOf(source).identification).toBe(true);
    });

    it('draws a composite foreign key in order', () => {
      expect(
        edgesOf(
          convert(`model Order {
  storeId Int
  number  Int
  lines   Line[]
  @@id([storeId, number])
}
model Line {
  id          Int   @id
  orderNumber Int
  orderStore  Int
  order       Order @relation(fields: [orderStore, orderNumber], references: [storeId, number])
}`)
        )
      ).toEqual(['Order(storeId,number) -> Line(orderStore,orderNumber)']);
    });

    it('tells two relations between one pair apart by name', () => {
      const schema = convert(`model User {
  id           Int    @id
  pinnedPost   Post?  @relation("Pinned")
  writtenPosts Post[] @relation("Written")
}
model Post {
  id         Int   @id
  authorId   Int
  author     User  @relation("Written", fields: [authorId], references: [id])
  pinnedById Int?  @unique
  pinnedBy   User? @relation("Pinned", fields: [pinnedById], references: [id])
}`);

      expect(edgesOf(schema)).toEqual([
        'User(id) -> Post(authorId)',
        'User(id) -> Post(pinnedById)',
      ]);
      expect(
        relationshipsOf(schema).map(
          relationship => relationship.relationshipType
        )
      ).toEqual([RelationshipType.ZeroN, RelationshipType.ZeroOne]);
    });

    it('draws a self-relation on either cardinality', () => {
      const schema = convert(`model Person {
  id        Int      @id
  managerId Int?
  manager   Person?  @relation("Management", fields: [managerId], references: [id])
  reports   Person[] @relation("Management")
  partnerId Int?     @unique
  partner   Person?  @relation("Partnership", fields: [partnerId], references: [id])
  partnerOf Person?  @relation("Partnership")
}`);

      expect(edgesOf(schema)).toEqual([
        'Person(id) -> Person(managerId)',
        'Person(id) -> Person(partnerId)',
      ]);
      expect(
        relationshipsOf(schema).map(
          relationship => relationship.relationshipType
        )
      ).toEqual([RelationshipType.ZeroN, RelationshipType.ZeroOne]);
    });

    describe('without a back-relation field, which Prisma requires', () => {
      const owner = (declaration: string, rest = '') =>
        relationshipOf(`model User {
  id Int @id
}
model Post {
  id     Int  @id
  userId Int  ${declaration}
  user   User @relation(fields: [userId], references: [id])
  ${rest}
}`).relationshipType;

      it('reads a plain foreign key as one-to-many', () => {
        expect(owner('')).toBe(RelationshipType.ZeroN);
      });

      it('reads a unique foreign key as one-to-one', () => {
        expect(owner('@unique')).toBe(RelationshipType.ZeroOne);
      });

      it('reads a foreign key that is the primary key as one-to-one', () => {
        expect(
          relationshipOf(`model User {
  id Int @id
}
model Post {
  userId Int  @id
  user   User @relation(fields: [userId], references: [id])
}`).relationshipType
        ).toBe(RelationshipType.ZeroOne);
      });

      it('reads a foreign key a unique index covers as one-to-one', () => {
        expect(owner('', '@@unique([userId])')).toBe(RelationshipType.ZeroOne);
      });

      it('reads one a wider unique index covers as one-to-many', () => {
        expect(owner('', '@@unique([userId, id])')).toBe(
          RelationshipType.ZeroN
        );
      });

      it('ignores a non-unique index', () => {
        expect(owner('', '@@index([userId])')).toBe(RelationshipType.ZeroN);
      });
    });

    it('references the primary key when references is missing', () => {
      expect(
        edgesOf(
          convert(`model User {
  id    Int    @id
  posts Post[]
}
model Post {
  id     Int  @id
  userId Int
  user   User @relation(fields: [userId])
}`)
        )
      ).toEqual(['User(id) -> Post(userId)']);
    });

    it('draws nothing for a field or a reference that is no column', () => {
      const source = (fields: string, references: string) => `model User {
  id    Int    @id
  posts Post[]
}
model Post {
  id     Int  @id
  userId Int
  user   User @relation(fields: [${fields}], references: [${references}])
}`;

      expect(relationshipsOf(convert(source('nope', 'id')))).toEqual([]);
      expect(relationshipsOf(convert(source('userId', 'nope')))).toEqual([]);
      expect(relationshipsOf(convert(source('userId, id', 'id')))).toEqual([]);
    });

    it('draws nothing to a model the file does not declare', () => {
      const schema = convert(`model Post {
  id     Int  @id
  userId Int
  user   User @relation(fields: [userId], references: [id])
}`);

      expect(schema.doc.relationshipIds).toEqual([]);
      expect(columnNames(schema, 'Post')).toEqual(['id', 'userId']);
    });

    it('draws nothing for a back-relation whose owner is missing', () => {
      expect(
        relationshipsOf(
          convert(
            'model User {\n  id Int @id\n  posts Post[]\n}\nmodel Post {\n  id Int @id\n}'
          )
        )
      ).toEqual([]);
    });

    it('draws a relation once when both of its fields name the keys', () => {
      expect(
        edgesOf(
          convert(`model User {
  id        Int      @id
  profileId Int?     @unique
  profile   Profile? @relation(fields: [profileId], references: [id])
}
model Profile {
  id     Int   @id
  userId Int?  @unique
  user   User? @relation(fields: [userId], references: [id])
}`)
        )
      ).toEqual(['Profile(id) -> User(profileId)']);
    });

    it('draws two relations over the same keys once', () => {
      expect(
        edgesOf(
          convert(`model User {
  id      Int    @id
  written Post[] @relation("a")
  read    Post[] @relation("b")
}
model Post {
  id     Int  @id
  userId Int
  writer User @relation("a", fields: [userId], references: [id])
  reader User @relation("b", fields: [userId], references: [id])
}`)
        )
      ).toEqual(['User(id) -> Post(userId)']);
    });

    it("ignores a list holding the keys, MongoDB's embedded many-to-many", () => {
      expect(
        relationshipsOf(
          convert(`model Post {
  id     Int   @id
  tagIds Int[]
  tags   Tag[] @relation(fields: [tagIds], references: [id])
}
model Tag {
  id    Int    @id
  posts Post[]
}`)
        )
      ).toEqual([]);
    });

    it('draws to the first of two models sharing a name, which Prisma refuses', () => {
      expect(
        edgesOf(
          convert(`model User {
  id    Int    @id
  posts Post[]
  @@map("first")
}
model User {
  id Int @id
  @@map("second")
}
model Post {
  id     Int  @id
  userId Int
  user   User @relation(fields: [userId], references: [id])
}`)
        )
      ).toEqual(['first(id) -> Post(userId)']);
    });

    it('reads a relation to a view', () => {
      expect(
        edgesOf(
          convert(`view Summary {
  id    Int    @unique
  posts Post[]
}
model Post {
  id        Int     @id
  summaryId Int
  summary   Summary @relation(fields: [summaryId], references: [id])
}`)
        )
      ).toEqual(['Summary(id) -> Post(summaryId)']);
    });
  });

  describe('implicit many-to-many', () => {
    const POST_TAG = `model Tag {
  id    Int    @id @map("tag_id")
  posts Post[]
  @@map("tags")
}
model Post {
  id   String @id @db.Uuid
  tags Tag[]
  @@map("posts")
}`;

    it("creates the table Prisma does, after the models' sorted Prisma names", () => {
      const schema = convert(POST_TAG);

      expect(tableNames(schema)).toEqual(['tags', 'posts', '_PostToTag']);
      expect(tableOf(schema, '_PostToTag').comment).toBe(
        'Implicit many-to-many table Prisma creates for posts <-> tags'
      );
    });

    it('types A and B after the ids they hold', () => {
      const columns = columnsOf(convert(POST_TAG), '_PostToTag');

      expect(columns.map(entry => `${entry.name} ${entry.dataType}`)).toEqual([
        'A uuid',
        'B integer',
      ]);
      expect(columns.every(entry => has(entry, ColumnOption.notNull))).toBe(
        true
      );
    });

    it('draws each model to its column', () => {
      const schema = convert(POST_TAG);

      expect(edgesOf(schema)).toEqual([
        'posts(id) -> _PostToTag(A)',
        'tags(tag_id) -> _PostToTag(B)',
      ]);
      expect(
        relationshipsOf(schema).map(relationship => [
          relationship.relationshipType,
          relationship.startRelationshipType,
        ])
      ).toEqual([
        [RelationshipType.ZeroN, StartRelationshipType.dash],
        [RelationshipType.ZeroN, StartRelationshipType.dash],
      ]);
    });

    it('keys the pair with a primary key on PostgreSQL', () => {
      const schema = convert(POST_TAG, Database.PostgreSQL);

      expect(
        columnsOf(schema, '_PostToTag').map(entry => entry.ui.keys)
      ).toEqual([
        ColumnUIKey.primaryKey | ColumnUIKey.foreignKey,
        ColumnUIKey.primaryKey | ColumnUIKey.foreignKey,
      ]);
      expect(
        relationshipsOf(schema).every(
          relationship => relationship.identification
        )
      ).toBe(true);
      expect(indexesOf(schema)).toEqual(['_PostToTag_B_index _PostToTag(B)']);
    });

    it.each([Database.MySQL, Database.SQLite, Database.MSSQL])(
      'keys the pair with a unique index on %i',
      database => {
        const schema = convert(POST_TAG, database);

        expect(
          columnsOf(schema, '_PostToTag').map(entry => [
            entry.ui.keys,
            has(entry, ColumnOption.primaryKey),
          ])
        ).toEqual([
          [ColumnUIKey.foreignKey, false],
          [ColumnUIKey.foreignKey, false],
        ]);
        expect(indexesOf(schema)).toEqual([
          'UNIQUE _PostToTag_AB_unique _PostToTag(A, B)',
          '_PostToTag_B_index _PostToTag(B)',
        ]);
      }
    );

    it('keys the pair with a unique index on CockroachDB, though PostgreSQL', () => {
      expect(
        indexesOf(
          convert(
            `datasource db {\n  provider = "cockroachdb"\n}\n${POST_TAG}`,
            Database.PostgreSQL
          )
        )
      ).toEqual([
        'UNIQUE _PostToTag_AB_unique _PostToTag(A, B)',
        '_PostToTag_B_index _PostToTag(B)',
      ]);
    });

    it('names the table after a relation name', () => {
      expect(
        tableNames(
          convert(`model Post {
  id   Int   @id
  tags Tag[] @relation("Tagging")
}
model Tag {
  id    Int    @id
  posts Post[] @relation("Tagging")
}`)
        )
      ).toEqual(['Post', 'Tag', '_Tagging']);
    });

    it('draws a self-relation to both columns', () => {
      expect(
        edgesOf(
          convert(`model User {
  id        Int    @id
  followers User[] @relation("Follows")
  following User[] @relation("Follows")
}`)
        )
      ).toEqual(['User(id) -> _Follows(A)', 'User(id) -> _Follows(B)']);
    });

    it("puts the table in the first model's schema", () => {
      expect(
        tableNames(
          convert(`model User {
  id    Int     @id
  teams Team[]
  @@schema("auth")
}
model Team {
  id    Int    @id
  users User[]
  @@schema("org")
}`)
        )
      ).toEqual(['auth_User', 'org_Team', 'org__TeamToUser']);
    });

    it('renames the table when a model already holds its name', () => {
      expect(
        tableNames(
          convert(`model Post {
  id   Int   @id
  tags Tag[]
}
model Tag {
  id    Int    @id
  posts Post[]
}
model Other {
  id Int @id
  @@map("_PostToTag")
}`)
        )
      ).toEqual(['Post', 'Tag', '_PostToTag', '_PostToTag1']);
    });

    it('creates nothing for a model without a single-field id', () => {
      expect(
        tableNames(
          convert(`model Post {
  a    Int
  b    Int
  tags Tag[]
  @@id([a, b])
}
model Tag {
  id    Int    @id
  posts Post[]
}`)
        )
      ).toEqual(['Post', 'Tag']);
    });

    it('creates nothing for a list whose opposite is not a list', () => {
      const schema = convert(`model Post {
  id   Int  @id
  tags Tag[]
}
model Tag {
  id   Int   @id
  post Post?
}`);

      expect(tableNames(schema)).toEqual(['Post', 'Tag']);
      expect(schema.doc.relationshipIds).toEqual([]);
    });
  });
});
