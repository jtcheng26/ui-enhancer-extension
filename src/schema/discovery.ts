import type { SchemaDiscoveryCandidate } from '../types';

const DEFAULT_SCHEMA_PATHS = ['/openapi.json', '/swagger.json'];

interface SchemaFetchSuccess {
  ok: true;
  url: string;
  contentType: string;
  rawDocument: string;
}

interface SchemaFetchFailure {
  ok: false;
  url: string;
  error: string;
}

export type SchemaFetchResult = SchemaFetchSuccess | SchemaFetchFailure;

export function buildSchemaCandidates(
  baseUrl: string,
  customUrl?: string,
): SchemaDiscoveryCandidate[] {
  const origin = new URL(baseUrl).origin;
  const defaults = DEFAULT_SCHEMA_PATHS.map((path) => ({
    url: new URL(path, origin).toString(),
    source: 'default' as const,
  }));

  if (!customUrl) {
    return defaults;
  }

  return [
    {
      url: new URL(customUrl, origin).toString(),
      source: 'custom',
    },
    ...defaults,
  ];
}

export async function fetchSchemaDocument(url: string): Promise<SchemaFetchResult> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json, application/yaml, text/yaml, text/plain',
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `Request failed with status ${response.status}`,
        url,
      };
    }

    return {
      ok: true,
      url,
      contentType: response.headers.get('content-type') ?? 'unknown',
      rawDocument: await response.text(),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown fetch failure',
      url,
    };
  }
}
