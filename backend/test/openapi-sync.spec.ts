import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Until the Go API is removed, the contract copy served by Nest must match the Go one.
it('contract/openapi.yaml equals the Go service copy', () => {
  const nest = readFileSync(join(import.meta.dirname, '../contract/openapi.yaml'), 'utf8');
  const go = readFileSync(join(import.meta.dirname, '../../seatiko/services/api/internal/apidocs/openapi.yaml'), 'utf8');
  expect(nest).toBe(go);
});
