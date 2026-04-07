import { stringify as yamlStringify } from '@std/yaml';

/** Normalize user-facing format names down to the three emit understands. */
export function toEmitFormat(fmt: string): 'pretty' | 'compact' | 'yaml' {
  if (fmt === 'json') return 'pretty'; // json = indented, alias for pretty
  if (fmt === 'table') return 'pretty'; // table is list-only; fall back to pretty for data
  return fmt as 'pretty' | 'compact' | 'yaml';
}

/** Print content to stdout. */
export function writeOutput(content: string): void {
  console.log(content);
}

/** Serialize output and write to stdout. */
export function emitOutput(
  output: unknown,
  format: 'pretty' | 'compact' | 'yaml',
): void {
  if (format === 'yaml') {
    writeOutput(yamlStringify(output as Record<string, unknown>));
    return;
  }

  const serialized = format === 'compact'
    ? JSON.stringify(output)
    : JSON.stringify(output, null, 2);
  writeOutput(serialized);
}
