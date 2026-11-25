import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Records which routes the suite called and, at the end, lists operations of the
// OpenAPI contract that no test touched.
const OPENAPI = join(import.meta.dirname, '../../contract/openapi.yaml');

function operations(): string[] {
  const yaml = readFileSync(OPENAPI, 'utf8');
  const ops: string[] = [];
  let path = '';
  for (const line of yaml.split('\n')) {
    const p = /^ {2}(\/[^:]+):\s*$/.exec(line);
    if (p) path = p[1];
    const m = /^ {4}(get|post|put|patch|delete):\s*$/.exec(line);
    if (m && path) ops.push(`${m[1].toUpperCase()} ${path}`);
  }
  return ops;
}

/** "GET /api/v1/venues/{id}" → matcher for "GET /api/v1/venues/venue-1". */
function matcher(op: string): RegExp {
  const [method, path] = op.split(' ');
  const pattern = path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\\{[^}]+\\\}|\{[^}]+\}/g, '[^/]+');
  return new RegExp(`^${method} ${pattern}$`);
}

export default function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'contract-'));
  process.env.CONTRACT_HITS_FILE = join(dir, 'hits.txt');
  return () => {
    const file = process.env.CONTRACT_HITS_FILE!;
    const hits = existsSync(file) ? [...new Set(readFileSync(file, 'utf8').split('\n').filter(Boolean))] : [];
    const ops = operations();
    const missing = ops.filter((op) => {
      const re = matcher(op);
      return !hits.some((hit) => re.test(hit));
    });
    console.log(`\nContract coverage: ${ops.length - missing.length}/${ops.length} operations`);
    if (missing.length) console.log('Not covered:\n  ' + missing.join('\n  '));
  };
}
