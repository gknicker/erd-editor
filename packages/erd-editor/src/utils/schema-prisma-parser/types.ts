/**
 * tokenizer.ts and parser.ts own every Prisma syntax concern, resolving
 * attributes into the flat fields below; names stay the Prisma ones, since
 * relations, indexes and field types refer to models and fields by them.
 */

export type PrismaNativeType = {
  /** VarChar for @db.VarChar(255), whatever the datasource prefix. */
  name: string;
  /** Raw argument text, so NVarChar(Max) keeps Max and Decimal(10, 2) two. */
  args: string[];
};

export type PrismaField = {
  name: string;
  /** The @map column name; empty when the column is the field name. */
  dbName: string;
  comment: string;
  /** A scalar, enum, model or composite type name, or Unsupported's raw type. */
  typeName: string;
  /** Unsupported("circle"), whose typeName is the database type circle. */
  unsupported: boolean;
  optional: boolean;
  list: boolean;
  primaryKey: boolean;
  unique: boolean;
  autoIncrement: boolean;
  /** SQL spelling; empty for none and for values the Prisma client generates. */
  default: string;
  nativeType: PrismaNativeType | null;
  relationName: string;
  /** Fields on this model. */
  relationFields: string[];
  /** Fields on the model typeName names. */
  relationReferences: string[];
};

export type PrismaIndexField = {
  name: string;
  descending: boolean;
};

/** One @@index, @@unique or @@fulltext; a field-level @unique is a flag. */
export type PrismaIndex = {
  /** The map argument, the database name; empty when Prisma derives one. */
  name: string;
  unique: boolean;
  fields: PrismaIndexField[];
};

/** One model or view block; PrismaModel is the whole document, as DBMLModel is. */
export type PrismaTable = {
  name: string;
  /** The @@map table name; empty when the table is the model name. */
  dbName: string;
  schemaName: string;
  comment: string;
  view: boolean;
  fields: PrismaField[];
  /** The @@id field names; a single @id is a flag on its field instead. */
  primaryKey: string[];
  indexes: PrismaIndex[];
};

export type PrismaEnumValue = {
  name: string;
  /** The @map stored spelling; empty when it is the name. */
  dbName: string;
  comment: string;
};

export type PrismaEnum = {
  name: string;
  dbName: string;
  schemaName: string;
  comment: string;
  values: PrismaEnumValue[];
};

export type PrismaModel = {
  /** The datasource provider, such as postgresql; empty without a datasource. */
  provider: string;
  tables: PrismaTable[];
  /** Keyed by the Prisma name, which is what a field's typeName holds. */
  enums: Record<string, PrismaEnum>;
  /** MongoDB composite type names, so a field of one can be told from a typo. */
  compositeTypes: string[];
};

export type PrismaParseResult =
  | { ok: true; model: PrismaModel }
  | { ok: false; message: string };
