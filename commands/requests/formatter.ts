import { stringify as yamlStringify } from '@std/yaml';
import type { ParsedGqlFile } from '../../utils/gql-parser.ts';

/** List all requests from a parsed GraphQL file in various formats. */
export function listRequests(
  requests: ParsedGqlFile['requests'],
  format: 'yaml' | 'json' | 'pretty' | 'compact' | 'table',
): void {
  const items = requests.map((r, i) => ({
    index: i + 1,
    type: r.type,
    title: r.name ?? '(unnamed)',
  }));

  if (format === 'table') {
    const numWidth = String(requests.length).length;
    const header = `  ${'#'.padStart(numWidth)}  ${'Type'.padEnd(8)}  Title`;
    console.error(header);
    console.error('  ' + '-'.repeat(header.length - 2));
    for (const { index, type, title } of items) {
      console.error(`  ${String(index).padStart(numWidth)}  ${type.padEnd(8)}  ${title}`);
    }
    return;
  }

  if (format === 'yaml') {
    console.log(yamlStringify(items as unknown as Record<string, unknown>[]));
    return;
  }

  // json / pretty / compact
  console.log(format === 'compact' ? JSON.stringify(items) : JSON.stringify(items, null, 2));
}
