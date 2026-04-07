import { relative } from '@std/path';
import { stringify as yamlStringify } from '@std/yaml';
import { validateHttpFile } from '../../utils/gql-parser.ts';
import type { ValidationResult } from '../../utils/gql-parser.ts';

/** Run the validator on a file and write structured YAML diagnostics to stderr. */
export async function emitValidationDiagnostics(filePath: string): Promise<void> {
  const content = await Deno.readTextFile(filePath);
  const issues = validateHttpFile(content);
  if (issues.length === 0) return;
  const relPath = relative(Deno.cwd(), filePath) || filePath;
  const result: ValidationResult = {
    file: relPath,
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    issues,
  };
  console.error(yamlStringify(result as unknown as Record<string, unknown>));
}
