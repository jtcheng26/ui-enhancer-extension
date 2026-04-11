import type { SchemaDiscoveryOptions, SchemaDiscoveryResult } from '../types';
import { schemaStore } from '../storage/schema-store';
import { logger } from '../utils/logger';
import { buildSchemaCandidates, fetchSchemaDocument } from './discovery';
import { parseSchemaDocument } from './parser';

export async function discoverAndStoreSchema(
  options: SchemaDiscoveryOptions,
): Promise<SchemaDiscoveryResult> {
  const candidates = buildSchemaCandidates(options.baseUrl, options.customUrl);
  const attemptedUrls: string[] = [];
  const errors: string[] = [];

  for (const candidate of candidates) {
    attemptedUrls.push(candidate.url);
    const response = await fetchSchemaDocument(candidate.url);

    if (!response.ok || !('rawDocument' in response)) {
      errors.push(`${candidate.url}: ${response.error}`);
      continue;
    }

    const parsedSchema = parseSchemaDocument(
      response.rawDocument,
      candidate.url,
      response.contentType ?? 'unknown',
    );

    if (options.persistResult !== false) {
      await schemaStore.upsert(parsedSchema);
    }

    logger.info('Discovered schema candidate.', {
      url: candidate.url,
      format: parsedSchema.format,
      warnings: parsedSchema.warnings,
    });

    // TODO: Add richer schema validation, dereferencing, and operation indexing.
    return {
      schema: parsedSchema,
      attemptedUrls,
      errors,
    };
  }

  logger.warn('Schema discovery did not find a usable document.', {
    attemptedUrls,
    errors,
  });

  return {
    attemptedUrls,
    errors,
  };
}
