import { Token, tokenize, TokenKind } from './tokenizer';
import {
  PrismaEnum,
  PrismaField,
  PrismaIndex,
  PrismaIndexField,
  PrismaModel,
  PrismaParseResult,
  PrismaTable,
} from './types';

type Value =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: string }
  | { kind: 'name'; value: string }
  | { kind: 'call'; name: string; args: Argument[] }
  | { kind: 'array'; items: Value[] };

type Argument = {
  label: string;
  value: Value;
};

type Attribute = {
  /** id, or db.VarChar for a native type. */
  name: string;
  args: Argument[];
};

type Reader = {
  peek: (offset?: number) => Token | null;
  next: () => Token | null;
  atEnd: () => boolean;
};

/** Doc comment lines waiting for the next field, value or block. */
type Docs = {
  lines: string[];
  /** A blank line followed the last doc comment. */
  detached: boolean;
};

type PendingDefault = {
  field: PrismaField;
  value: Value;
};

const AUTO_INCREMENT_FUNCTIONS = ['autoincrement', 'sequence'];
const QUOTE = /'/g;

export function parsePrismaModel(source: string): PrismaParseResult {
  try {
    return { ok: true, model: parseDocument(tokenize(source)) };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Invalid Prisma schema',
    };
  }
}

function createReader(tokens: Token[]): Reader {
  let index = 0;

  return {
    peek: (offset = 0) => tokens[index + offset] ?? null,
    next: () => tokens[index++] ?? null,
    atEnd: () => index >= tokens.length,
  };
}

function parseDocument(tokens: Token[]): PrismaModel {
  const reader = createReader(tokens);
  const model: PrismaModel = {
    provider: '',
    tables: [],
    // No prototype, so __proto__ lands as a key and toString finds no enum.
    enums: Object.create(null),
    compositeTypes: [],
  };
  const defaults: PendingDefault[] = [];
  const docs = createDocs();
  let hasDatasource = false;

  while (!reader.atEnd()) {
    if (readNewlines(reader, docs)) {
      continue;
    }

    const token = reader.peek() as Token;

    if (token.kind === TokenKind.docComment) {
      reader.next();
      pushDoc(docs, token.value);
      continue;
    }

    // A blank line between a doc comment and its block detaches it at the top
    // level, which is where Prisma tells a file header from a model's doc.
    const comment = docs.detached ? '' : takeDocs(docs);
    clearDocs(docs);

    const keyword = token.kind === TokenKind.identifier ? token.value : '';

    switch (keyword) {
      case 'model':
      case 'view': {
        reader.next();
        const table = parseTable(reader, keyword === 'view', defaults);
        if (table) {
          table.comment = comment;
          model.tables.push(table);
        }
        break;
      }
      case 'enum': {
        reader.next();
        const prismaEnum = parseEnum(reader);
        if (prismaEnum) {
          prismaEnum.comment = comment;
          model.enums[prismaEnum.name] = prismaEnum;
        }
        break;
      }
      case 'type': {
        reader.next();
        const name = readName(reader);
        if (name) {
          model.compositeTypes.push(name);
        }
        skipElement(reader);
        break;
      }
      case 'datasource': {
        reader.next();
        readName(reader);
        const provider = parseDatasource(reader);
        if (!hasDatasource) {
          hasDatasource = true;
          model.provider = provider;
        }
        break;
      }
      default:
        // generator, and anything Prisma does not know, has nothing to import.
        reader.next();
        skipElement(reader);
    }
  }

  defaults.forEach(({ field, value }) => {
    field.default = renderDefault(value, model.enums[field.typeName] ?? null);
  });

  return model;
}

function parseTable(
  reader: Reader,
  view: boolean,
  defaults: PendingDefault[]
): PrismaTable | null {
  const name = readName(reader);
  if (name === '' || !consumeBrace(reader)) {
    skipElement(reader);
    return null;
  }

  const table: PrismaTable = {
    name,
    dbName: '',
    schemaName: '',
    comment: '',
    view,
    fields: [],
    primaryKey: [],
    indexes: [],
  };

  readBody(reader, docs => {
    const token = reader.peek() as Token;

    if (isPunctuation(token, '@@')) {
      reader.next();
      applyTableAttribute(table, readAttribute(reader));
      return;
    }

    const field = parseField(reader, defaults);
    if (field) {
      field.comment = joinDocs(takeDocs(docs), readTrailingDoc(reader));
      table.fields.push(field);
    }
  });

  return table;
}

function parseField(
  reader: Reader,
  defaults: PendingDefault[]
): PrismaField | null {
  const name = readName(reader);
  const typeToken = reader.peek();

  if (name === '' || !typeToken || typeToken.kind !== TokenKind.identifier) {
    skipLine(reader);
    return null;
  }
  reader.next();

  const field: PrismaField = {
    name,
    dbName: '',
    comment: '',
    typeName: typeToken.value,
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
  };

  const open = reader.peek();
  if (typeToken.value === 'Unsupported' && open && isPunctuation(open, '(')) {
    reader.next();
    const [argument] = readArguments(reader);
    field.unsupported = true;
    field.typeName = argument ? stringOf(argument.value) : '';
  }

  readTypeModifiers(reader, field);

  while (!reader.atEnd()) {
    const token = reader.peek() as Token;
    if (!isPunctuation(token, '@')) break;

    reader.next();
    const attribute = readAttribute(reader);
    const value = applyFieldAttribute(field, attribute);
    if (value) {
      defaults.push({ field, value });
    }
  }

  return field;
}

function readTypeModifiers(reader: Reader, field: PrismaField) {
  while (!reader.atEnd()) {
    const token = reader.peek() as Token;

    if (isPunctuation(token, '?')) {
      reader.next();
      field.optional = true;
      continue;
    }

    const closing = reader.peek(1);
    if (isPunctuation(token, '[') && closing && isPunctuation(closing, ']')) {
      reader.next();
      reader.next();
      field.list = true;
      continue;
    }

    return;
  }
}

/** Returns the @default value, which waits until every enum is known. */
function applyFieldAttribute(
  field: PrismaField,
  { name, args }: Attribute
): Value | null {
  switch (name) {
    case 'id':
      field.primaryKey = true;
      return null;
    case 'unique':
      field.unique = true;
      return null;
    case 'map':
      field.dbName = stringOf(argumentOf(args, 'name'));
      return null;
    case 'relation': {
      field.relationName = stringOf(argumentOf(args, 'name'));
      field.relationFields = namesOf(labelledArgument(args, 'fields'));
      field.relationReferences = namesOf(labelledArgument(args, 'references'));
      return null;
    }
    case 'default': {
      const value = argumentOf(args, 'value');
      if (value?.kind === 'call' && isAutoIncrement(value.name)) {
        field.autoIncrement = true;
        return null;
      }
      return value;
    }
  }

  // A native type is written after the datasource's name, which is db only by
  // convention, so any prefix is read as one.
  const dot = name.indexOf('.');
  if (dot !== -1) {
    field.nativeType = {
      name: name.slice(dot + 1),
      args: args.map(argument => sourceOf(argument.value)),
    };
  }

  return null;
}

function applyTableAttribute(table: PrismaTable, { name, args }: Attribute) {
  switch (name) {
    case 'id':
      table.primaryKey = indexFieldsOf(args).map(field => field.name);
      break;
    case 'unique':
      addIndex(table, args, true, '');
      break;
    case 'index':
      // name is the legacy spelling of map on @@index alone; on @@unique it
      // names the compound key in the client, not in the database.
      addIndex(table, args, false, stringOf(labelledArgument(args, 'name')));
      break;
    case 'fulltext':
      addIndex(table, args, false, '');
      break;
    case 'map':
      table.dbName = stringOf(argumentOf(args, 'name'));
      break;
    case 'schema':
      table.schemaName = stringOf(argumentOf(args, 'name'));
      break;
  }
}

function addIndex(
  table: PrismaTable,
  args: Argument[],
  unique: boolean,
  legacyName: string
) {
  const fields = indexFieldsOf(args);
  if (fields.length === 0) return;

  const index: PrismaIndex = {
    name: stringOf(labelledArgument(args, 'map')) || legacyName,
    unique,
    fields,
  };
  table.indexes.push(index);
}

function indexFieldsOf(args: Argument[]): PrismaIndexField[] {
  const value = argumentOf(args, 'fields');
  if (!value) return [];

  const items = value.kind === 'array' ? value.items : [value];

  return items.flatMap(item => {
    if (item.kind === 'name') {
      return [{ name: item.value, descending: false }];
    }
    if (item.kind === 'call') {
      const sort = labelledArgument(item.args, 'sort');
      const descending = sort?.kind === 'name' && sort.value === 'Desc';
      return [{ name: item.name, descending }];
    }
    return [];
  });
}

function parseEnum(reader: Reader): PrismaEnum | null {
  const name = readName(reader);
  if (name === '' || !consumeBrace(reader)) {
    skipElement(reader);
    return null;
  }

  const prismaEnum: PrismaEnum = {
    name,
    dbName: '',
    schemaName: '',
    comment: '',
    values: [],
  };

  readBody(reader, docs => {
    const token = reader.peek() as Token;

    if (isPunctuation(token, '@@')) {
      reader.next();
      const attribute = readAttribute(reader);
      if (attribute.name === 'map') {
        prismaEnum.dbName = stringOf(argumentOf(attribute.args, 'name'));
      } else if (attribute.name === 'schema') {
        prismaEnum.schemaName = stringOf(argumentOf(attribute.args, 'name'));
      }
      return;
    }

    const valueName = readName(reader);
    if (valueName === '') {
      skipLine(reader);
      return;
    }

    let dbName = '';
    while (!reader.atEnd() && isPunctuation(reader.peek() as Token, '@')) {
      reader.next();
      const attribute = readAttribute(reader);
      if (attribute.name === 'map') {
        dbName = stringOf(argumentOf(attribute.args, 'name'));
      }
    }

    prismaEnum.values.push({
      name: valueName,
      dbName,
      comment: joinDocs(takeDocs(docs), readTrailingDoc(reader)),
    });
  });

  return prismaEnum;
}

function parseDatasource(reader: Reader): string {
  let provider = '';

  if (!consumeBrace(reader)) {
    skipElement(reader);
    return provider;
  }

  readBody(reader, () => {
    const key = readName(reader);
    const equals = reader.peek();

    if (key !== '' && equals && isPunctuation(equals, '=')) {
      reader.next();
      const value = readValue(reader);
      if (key === 'provider' && value) {
        provider = stringOf(value);
      }
    }

    skipLine(reader);
  });

  return provider;
}

/**
 * Reads a block body up to its closing brace, handing each entry to read with
 * the doc comments gathered before it; read consumes the entry's own line.
 */
function readBody(reader: Reader, read: (docs: Docs) => void) {
  const docs = createDocs();

  // A doc comment on the opening brace's line documents nothing, as in Prisma.
  if (reader.peek()?.kind === TokenKind.docComment) {
    reader.next();
  }

  while (!reader.atEnd()) {
    if (readNewlines(reader, docs)) {
      continue;
    }

    const token = reader.peek() as Token;

    if (isPunctuation(token, '}')) {
      reader.next();
      return;
    }

    if (token.kind === TokenKind.docComment) {
      reader.next();
      pushDoc(docs, token.value);
      continue;
    }

    read(docs);
    skipLine(reader);
  }
}

function readAttribute(reader: Reader): Attribute {
  let name = readName(reader);

  const dot = reader.peek();
  if (dot && isPunctuation(dot, '.')) {
    reader.next();
    name = `${name}.${readName(reader)}`;
  }

  const open = reader.peek();
  if (open && isPunctuation(open, '(')) {
    reader.next();
    return { name, args: readArguments(reader) };
  }

  return { name, args: [] };
}

/** Reads up to and including the closing parenthesis. */
function readArguments(reader: Reader): Argument[] {
  const args: Argument[] = [];

  while (!reader.atEnd()) {
    const token = reader.peek() as Token;

    if (isPunctuation(token, ')')) {
      reader.next();
      break;
    }

    if (endsUnclosedList(token)) {
      break;
    }

    if (isPunctuation(token, ',')) {
      reader.next();
      continue;
    }

    let label = '';
    const colon = reader.peek(1);
    if (
      token.kind === TokenKind.identifier &&
      colon &&
      isPunctuation(colon, ':')
    ) {
      reader.next();
      reader.next();
      label = token.value;
    }

    const value = readValue(reader);
    if (value) {
      args.push({ label, value });
      continue;
    }

    const stray = reader.peek();
    if (stray && !isPunctuation(stray, ')') && !endsUnclosedList(stray)) {
      reader.next();
    }
  }

  return args;
}

function readValue(reader: Reader): Value | null {
  const token = reader.peek();
  if (!token) return null;

  switch (token.kind) {
    case TokenKind.string:
      reader.next();
      return { kind: 'string', value: token.value };
    case TokenKind.number:
      reader.next();
      return { kind: 'number', value: token.value };
    case TokenKind.identifier: {
      reader.next();
      let name = token.value;

      // A dotted path names a composite type's field in an index.
      let dot = reader.peek();
      while (dot && isPunctuation(dot, '.')) {
        reader.next();
        name = `${name}.${readName(reader)}`;
        dot = reader.peek();
      }

      const open = reader.peek();
      if (open && isPunctuation(open, '(')) {
        reader.next();
        return { kind: 'call', name, args: readArguments(reader) };
      }

      return { kind: 'name', value: name };
    }
  }

  if (isPunctuation(token, '[')) {
    reader.next();
    return { kind: 'array', items: readArrayItems(reader) };
  }

  return null;
}

function readArrayItems(reader: Reader): Value[] {
  const items: Value[] = [];

  while (!reader.atEnd()) {
    const token = reader.peek() as Token;

    if (isPunctuation(token, ']')) {
      reader.next();
      break;
    }

    if (endsUnclosedList(token)) {
      break;
    }

    const value = readValue(reader);
    if (value) {
      items.push(value);
    } else {
      reader.next();
    }
  }

  return items;
}

function renderDefault(value: Value, prismaEnum: PrismaEnum | null): string {
  switch (value.kind) {
    case 'string':
      return quote(value.value);
    case 'number':
      return value.value;
    case 'name': {
      const member = prismaEnum?.values.find(
        candidate => candidate.name === value.value
      );
      if (member) {
        return quote(member.dbName || member.name);
      }
      if (value.value === 'true' || value.value === 'false') {
        return value.value;
      }
      return quote(value.value);
    }
    case 'array':
      // ARRAY[] alone has no element type PostgreSQL can infer; '{}' has.
      return value.items.length === 0
        ? "'{}'"
        : `ARRAY[${value.items
            .map(item => renderDefault(item, prismaEnum))
            .join(', ')}]`;
    case 'call':
      return renderFunctionDefault(value.name, value.args);
  }
}

/**
 * cuid, uuid, ulid and nanoid are generated by the Prisma client and auto by
 * MongoDB, so, like a function this parser does not know, they set no default.
 */
function renderFunctionDefault(name: string, args: Argument[]): string {
  switch (name) {
    case 'now':
      return 'CURRENT_TIMESTAMP';
    case 'dbgenerated': {
      const [argument] = args;
      return argument ? stringOf(argument.value) : '';
    }
    default:
      return '';
  }
}

function isAutoIncrement(name: string): boolean {
  return AUTO_INCREMENT_FUNCTIONS.includes(name);
}

function quote(value: string): string {
  return `'${value.replace(QUOTE, "''")}'`;
}

/** The labelled argument, or else the first unlabelled one. */
function argumentOf(args: Argument[], label: string): Value | null {
  return (
    labelledArgument(args, label) ??
    args.find(argument => argument.label === '')?.value ??
    null
  );
}

function labelledArgument(args: Argument[], label: string): Value | null {
  return args.find(argument => argument.label === label)?.value ?? null;
}

function stringOf(value: Value | null): string {
  return value?.kind === 'string' ? value.value : '';
}

function namesOf(value: Value | null): string[] {
  if (!value) return [];

  const items = value.kind === 'array' ? value.items : [value];

  return items.flatMap(item => (item.kind === 'name' ? [item.value] : []));
}

/** The argument as written, for the native type arguments kept verbatim. */
function sourceOf(value: Value): string {
  switch (value.kind) {
    case 'string':
      return `"${value.value}"`;
    case 'number':
    case 'name':
      return value.value;
    case 'call':
      return `${value.name}(${value.args
        .map(argument => sourceOf(argument.value))
        .join(', ')})`;
    case 'array':
      return `[${value.items.map(sourceOf).join(', ')}]`;
  }
}

function createDocs(): Docs {
  return { lines: [], detached: false };
}

function pushDoc(docs: Docs, line: string) {
  // Only the last run of doc comments before an entry documents it.
  if (docs.detached) {
    clearDocs(docs);
  }
  docs.lines.push(line);
}

function takeDocs(docs: Docs): string {
  const text = docs.lines.join('\n');
  clearDocs(docs);
  return text;
}

function clearDocs(docs: Docs) {
  docs.lines = [];
  docs.detached = false;
}

function joinDocs(before: string, trailing: string): string {
  return before && trailing ? `${before}\n${trailing}` : before || trailing;
}

/** A doc comment closing an entry's line documents that entry. */
function readTrailingDoc(reader: Reader): string {
  const token = reader.peek();
  if (token && token.kind === TokenKind.docComment) {
    reader.next();
    return token.value;
  }
  return '';
}

/** Consumes a run of line breaks; two or more hold a blank line. */
function readNewlines(reader: Reader, docs: Docs): boolean {
  let count = 0;

  while (reader.peek()?.kind === TokenKind.newline) {
    reader.next();
    count += 1;
  }

  if (count > 1 && docs.lines.length !== 0) {
    docs.detached = true;
  }

  return count !== 0;
}

function readName(reader: Reader): string {
  const token = reader.peek();
  if (!token || token.kind !== TokenKind.identifier) {
    return '';
  }
  reader.next();

  return token.value;
}

function consumeBrace(reader: Reader): boolean {
  let offset = 0;

  while (reader.peek(offset)?.kind === TokenKind.newline) {
    offset += 1;
  }

  const token = reader.peek(offset);
  if (!token || !isPunctuation(token, '{')) {
    return false;
  }

  for (let step = 0; step <= offset; step += 1) {
    reader.next();
  }

  return true;
}

function skipBlock(reader: Reader) {
  let depth = 1;

  while (!reader.atEnd() && depth !== 0) {
    const token = reader.next() as Token;

    if (isPunctuation(token, '{')) {
      depth += 1;
    } else if (isPunctuation(token, '}')) {
      depth -= 1;
    }
  }
}

function skipElement(reader: Reader) {
  if (consumeBrace(reader)) {
    skipBlock(reader);
    return;
  }

  while (!reader.atEnd()) {
    const token = reader.next() as Token;
    if (token.kind === TokenKind.newline) {
      return;
    }
    if (isPunctuation(token, '{')) {
      skipBlock(reader);
      return;
    }
  }
}

/** Skips to the end of the line, leaving a closing brace for the body. */
function skipLine(reader: Reader) {
  while (!reader.atEnd()) {
    const token = reader.peek() as Token;
    if (token.kind === TokenKind.newline || isPunctuation(token, '}')) {
      return;
    }
    reader.next();
  }
}

/**
 * The tokenizer closes an open bracket at a brace, so a line break or brace
 * inside an argument list means its closing bracket is missing.
 */
function endsUnclosedList(token: Token): boolean {
  return (
    token.kind === TokenKind.newline ||
    isPunctuation(token, '{') ||
    isPunctuation(token, '}')
  );
}

function isPunctuation(token: Token, value: string): boolean {
  return token.kind === TokenKind.punctuation && token.value === value;
}
