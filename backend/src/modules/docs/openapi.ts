import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

/** The API contract (copied from the Go service until it is removed; a test keeps them equal). */
export const OPENAPI_FILE = join(import.meta.dirname, '../../../contract/openapi.yaml');

export const openApiYaml = (): string => readFileSync(OPENAPI_FILE, 'utf8');
export const openApiDocument = (): Record<string, unknown> => parse(openApiYaml()) as Record<string, unknown>;
