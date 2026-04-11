import type { ParsedSchema } from '../types';

function extractEndpointPaths(document: unknown) {
  if (
    document &&
    typeof document === 'object' &&
    'paths' in document &&
    document.paths &&
    typeof document.paths === 'object'
  ) {
    return Object.keys(document.paths as Record<string, unknown>);
  }

  return [];
}

export function parseSchemaDocument(
  rawDocument: string,
  sourceUrl: string,
  contentType: string,
): ParsedSchema {
  try {
    const document = JSON.parse(rawDocument) as Record<string, unknown>;

    return {
      id: crypto.randomUUID(),
      sourceUrl,
      format: 'json',
      title:
        typeof document.info === 'object' &&
        document.info &&
        'title' in document.info &&
        typeof document.info.title === 'string'
          ? document.info.title
          : undefined,
      version:
        typeof document.info === 'object' &&
        document.info &&
        'version' in document.info &&
        typeof document.info.version === 'string'
          ? document.info.version
          : undefined,
      document,
      endpointPaths: extractEndpointPaths(document),
      warnings: [],
      discoveredAt: new Date().toISOString(),
    };
  } catch {
    const looksLikeYaml =
      contentType.includes('yaml') ||
      rawDocument.includes('openapi:') ||
      rawDocument.includes('swagger:');

    return {
      id: crypto.randomUUID(),
      sourceUrl,
      format: looksLikeYaml ? 'yaml' : 'unknown',
      document: rawDocument,
      endpointPaths: [],
      warnings: [
        looksLikeYaml
          ? 'YAML parsing is intentionally stubbed for now. Raw schema text was stored instead.'
          : 'Schema document could not be parsed. Validation is intentionally minimal in this prototype.',
      ],
      discoveredAt: new Date().toISOString(),
    };
  }
}
