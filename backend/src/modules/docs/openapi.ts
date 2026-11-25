import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

/** The API contract (copied from the Go service until it is removed; a test keeps them equal). */
export const OPENAPI_FILE = join(__dirname, '../../../contract/openapi.yaml');

const FALLBACK_OPENAPI = 'openapi: 3.0.3\ninfo:\n  title: Seatiko API\n  version: 0.0.1\npaths: {}\n';

function resolveOpenApiFile(): string | undefined {
  const candidates = [
    OPENAPI_FILE,
    join(process.cwd(), 'contract/openapi.yaml'),
    join(process.cwd(), 'backend/contract/openapi.yaml'),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

export const openApiYaml = (): string => {
  const file = resolveOpenApiFile();
  return file ? readFileSync(file, 'utf8') : FALLBACK_OPENAPI;
};

export const openApiDocument = (): Record<string, unknown> => parse(openApiYaml()) as Record<string, unknown>;
