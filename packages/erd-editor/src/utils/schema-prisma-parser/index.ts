import {
  ERDEditorSchemaV3,
  schemaV3Parser,
  toJson,
} from '@dineug/erd-editor-schema';

import { EngineContext } from '@/engine/context';
import { canvasSizeInRange } from '@/utils/validation';

import { convertToSchema } from './convert';
import { providerDatabase } from './dataType';
import { parsePrismaModel } from './parser';
import { PrismaModel } from './types';

const EMPTY_MODEL: PrismaModel = {
  provider: '',
  tables: [],
  enums: {},
  compositeTypes: [],
};

export function schemaPrismaParserToSchemaJson(
  prisma: string,
  ctx: EngineContext,
  prepare?: (schema: ERDEditorSchemaV3) => ERDEditorSchemaV3
): string {
  const result = parsePrismaModel(prisma);
  const model = result.ok ? result.model : EMPTY_MODEL;
  const schema = schemaV3Parser({});
  const canvasSize = canvasSizeInRange(model.tables.length * 100);
  schema.settings.width = canvasSize;
  schema.settings.height = canvasSize;

  // The editor's dialect reaches this function through prepare, but a file
  // naming its provider is written for that database, whose native types
  // mean nothing elsewhere, so the provider's dialect wins.
  const { settings } = prepare ? prepare(schema) : schema;
  settings.database = providerDatabase(model.provider, settings.database);
  const converted = convertToSchema(model, ctx, settings.database);
  converted.settings = settings;

  return toJson(converted);
}
