---
description: 'Use when adding, modifying, or reviewing CLI commands in gql-client. Covers Cliffy command structure, option/argument patterns, subcommand registration, output formats, and stderr logger usage.'
applyTo: 'commands/*.ts'
---

# CLI Command Conventions (Cliffy)

## Commands as Composition

A CLI command is the **composition layer** — it wires together capabilities, data
structures, and functions but contains no business logic itself. The pattern:

1. Import types (capability) and functions from domain modules
2. Declare CLI options and arguments (the user-facing interface)
3. In the action handler, compose the imported functions into a pipeline
4. Route output to stdout (data) and stderr (diagnostics)

Business logic lives in `commands/<domain>/` modules (e.g., `requests/executor.ts`,
`tokens/substitution.ts`). The command file (`run.ts`, `config.ts`) only orchestrates.

## Command File Structure

Each command lives in its own file under `commands/` and exports a single `Command` instance:

```typescript
import { Command } from '@cliffy/command';
import { Logger, LogLevel } from '../utils/logger.ts';

export const myCommand = new Command()
  .name('my-command')
  .description('Do something useful')
  .option('-o, --output <format:string>', 'Output format (yaml|json|compact|pretty)', {
    default: 'yaml',
  })
  .arguments('<file:string>')
  .action(async (options, file) => {
    const logger = new Logger(options.verbose ? LogLevel.Debug : LogLevel.None);
    try {
      // implementation — data to stdout, diagnostics to logger (stderr)
    } catch (error) {
      console.error(
        '❌ my-command failed:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });
```

## Registration in main.ts

Add the command to the root `Command` in `main.ts`:

```typescript
import { myCommand } from './commands/my-command.ts';

const mainCommand = new Command()
  .name('gql-client')
  // ...
  .command('my-command', myCommand);
```

## Commands in this repo

| Command      | File        | Description                               |
| ------------ | ----------- | ----------------------------------------- |
| `run <file>` | `run.ts`    | Run one or all requests from a .http file |
| `config`     | `config.ts` | Manage config (subcommand: show)          |

## Output Format Convention

The `run` command supports `-o / --output`:

| Format    | Behavior                                                  |
| --------- | --------------------------------------------------------- |
| `yaml`    | Default; YAML array of `{query, data}` objects            |
| `json`    | Indented JSON array                                       |
| `compact` | Single-line JSON; silences status log lines automatically |
| `pretty`  | Per-request banners + pretty-printed JSON to stdout       |

In the action handler, suppress diagnostics when `compact` is selected:

```typescript
const logger = new Logger(options.output === 'compact' ? LogLevel.None : LogLevel.Info);
```

## stdout vs stderr

**Critical invariant**: all diagnostic output (`logger.*()`) goes to **stderr**.
Stdout is reserved for program data output only. This allows:

```bash
gql-client run query.http | jq '.[] | .data'
gql-client run query.http -o compact | jq
```

Never use `console.log` for debug/status lines — use `logger.info()` / `logger.debug()`.

## --allow-commands Flag

`{{ $( command ) }}` variable substitution in `.http` files requires `--allow-run`.
The command must check for this flag and fail safely if absent:

```typescript
.option('--allow-commands', 'Enable shell command substitution in .http file variables')
.action(async (options, file) => {
  if (options.allowCommands) {
    // proceed with substitution
  } else {
    logger.info('ℹ️  Command substitution disabled. Use --allow-commands to enable.');
  }
})
```

## Auth Subcommand Pattern

```typescript
export const authCommand = new Command()
  .description('Check or clear okta-client credentials');

authCommand.command('status', 'Show credential status')
  .action(async () => {
    const creds = await loadCredentials();
    if (!creds) {
      console.log('❌ No credentials found. Run: okta-client login');
      return;
    }
    console.log('✅ Credentials found');
    console.log(`Token type: ${creds.token_type}`);
  });

authCommand.command('clear', 'Remove stored credentials')
  .action(async () => {
    await clearCredentials();
    console.log('✅ Credentials cleared');
  });
```

## Error Handling Template

```typescript
.action(async (options, file) => {
  const logger = new Logger(LogLevel.Info);
  try {
    // implementation
  } catch (error) {
    console.error('❌ run failed:', error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  }
});
```

## File Path Resolution

When a command receives a file argument, resolve relative to the caller's working directory (not the command file's location):

```typescript
import { resolve } from '@std/path';

function resolveFilePath(file: string): string {
  if (file.startsWith('/')) return file; // absolute path: use as-is
  return resolve(Deno.cwd(), file); // relative: resolve from cwd
}
```

Do NOT use `import.meta.url` for resolving user-provided file paths.
