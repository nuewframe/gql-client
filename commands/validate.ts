import { Command } from '@cliffy/command';
import { stringify as yamlStringify } from '@std/yaml';
import { relative } from '@std/path';
import { validateHttpFile } from '../utils/gql-parser.ts';
import type { ValidationResult } from '../utils/gql-parser.ts';
import { Logger } from '../utils/logger.ts';

export const validateCommand = new Command()
  .name('validate')
  .description('Validate an .http file and report structural issues')
  .arguments('<file:string>')
  .option('--log-level <level:string>', 'Log level (none, info, debug)', { default: 'info' })
  .action(async (options, file) => {
    const logger = new Logger(options.logLevel as 'none' | 'info' | 'debug');

    try {
      const content = await Deno.readTextFile(file);
      const issues = validateHttpFile(content);

      const errors = issues.filter((i) => i.severity === 'error').length;
      const warnings = issues.filter((i) => i.severity === 'warning').length;

      const relPath = relative(Deno.cwd(), file) || file;
      const result: ValidationResult = { file: relPath, errors, warnings, issues };

      if (issues.length === 0) {
        logger.success(`${relPath}: no issues found`);
        return;
      }

      // Structured YAML to stdout (machine-consumable)
      console.log(yamlStringify(result as unknown as Record<string, unknown>));

      if (errors > 0) {
        Deno.exit(1);
      }
    } catch (error) {
      console.error(
        '❌ validate failed:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });
