# new-command Skill

## When to Use

Trigger phrases: "add command", "new command", "create command", "new subcommand".

Use this skill when adding a new CLI subcommand to `gql-client`.

---

## Architecture Paradigm

Every new command follows the layering order: **Capability → Data → Function → Composition**.

1. **Types first** — define the types/interfaces for inputs and outputs in a domain module
2. **Functions next** — implement pure functions that transform those types in `commands/<domain>/`
3. **Compose last** — the command file imports types and functions, wires them in the action handler

The command file is the **composition layer**. It never contains business logic directly.

---

## Checklist

1. [ ] Define types and functions in `commands/<domain>/` modules
2. [ ] Create `commands/<verb>.ts` — compose the domain modules
3. [ ] Export the command as a named `const`
4. [ ] Register it in `main.ts`
5. [ ] Add a smoke test in `main_test.ts`
6. [ ] Add command reference to `README.md`

---

## Step 1 — Define Domain Types and Functions

Before writing the command, create focused modules for the capability.

File: `commands/<domain>/<module>.ts`

```typescript
// --- Types (capability + data structure) ---
export interface MyInput {
  filePath: string;
  verbose: boolean;
}

export interface MyResult {
  data: string;
}

// --- Function (operates on types above) ---
export function processInput(input: MyInput): MyResult {
  // pure transformation — no CLI/IO concerns
  return { data: 'value' };
}
```

## Step 2 — Create the Command File (Composition)

File: `commands/<name>.ts`

The command imports types and functions, composes them in the action handler.

```typescript
import { Command } from '@cliffy/command';
import { Logger, LogLevel } from '../utils/logger.ts';
import { processInput } from './<domain>/<module>.ts';
import type { MyInput } from './<domain>/<module>.ts';

export const myCommand = new Command()
  .name('my-command')
  .description('Short description of what this command does')
  .option('-o, --output <format:string>', 'Output format (yaml|json|compact|pretty)', {
    default: 'yaml',
  })
  .option('--verbose', 'Enable verbose output')
  .arguments('<file:string>')
  .action(async (options, file) => {
    // Logger writes to stderr — stdout is reserved for data output
    const logger = new Logger(
      options.verbose
        ? LogLevel.Debug
        : options.output === 'compact'
        ? LogLevel.None
        : LogLevel.Info,
    );
    try {
      logger.info(`Processing: ${file}`);

      // Compose domain functions — no business logic here
      const input: MyInput = { filePath: file, verbose: !!options.verbose };
      const result = processInput(input);

      // Output to stdout
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(
        '❌ my-command failed:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });
```

**Naming conventions:**

- File: verb or verb-noun (`run.ts`, `list.ts`)
- Export: camelCase (`runCommand`, `listCommand`)
- Command name: same as file without `.ts`

## Step 3 — Register in main.ts

```typescript
// In main.ts — add import
import { myCommand } from './commands/my-command.ts';

// Add to root command
const mainCommand = new Command()
  .name('gql-client')
  // ... existing commands ...
  .command('my-command', myCommand);
```

## Step 4 — Global Option Pattern

Declare options directly on the command — they are not auto-inherited in Cliffy:

```typescript
export const myCommand = new Command()
  .option('-o, --output <format:string>', 'Output format', { default: 'yaml' })
  .option('--verbose', 'Enable verbose output');
```

## Step 5 — Smoke Test in main_test.ts

```typescript
Deno.test('my-command subcommand exists', () => {
  const cmd = mainCommand.getCommand('my-command');
  assertExists(cmd);
  assertEquals(cmd.getName(), 'my-command');
});
```

## Step 6 — Subcommands Pattern

For commands with sub-operations (like `auth status`, `auth clear`, `config show`):

```typescript
export const myCommand = new Command()
  .description('Parent command description')
  .action((_options) => {
    console.log('Run: gql-client my-command <subcommand>');
  });

myCommand.command('status', 'Show status')
  .action(async (_options) => {
    // ...
  });

myCommand.command('clear', 'Clear state')
  .action(async (_options) => {
    // ...
  });
```

## stdout / stderr Invariant

This is critical for pipeline compatibility:

| Output type       | Stream        | How                                     |
| ----------------- | ------------- | --------------------------------------- |
| Data (JSON, YAML) | stdout        | `console.log(...)`                      |
| Progress/info     | stderr        | `logger.info(...)`                      |
| Debug detail      | stderr        | `logger.debug(...)`                     |
| Errors            | stderr + exit | `console.error('❌ ...'); Deno.exit(1)` |

**Never** use `console.log` for diagnostic messages — use `logger.info()` or `logger.debug()`.

## --allow-commands Pattern

If the command needs shell substitution (for `.http` variables):

```typescript
.option('--allow-commands', 'Enable shell command substitution in variables')
.action(async (options, file) => {
  const parser = new GqlParser({ allowCommands: options.allowCommands ?? false });
  ...
})
```

## Error Handling Rules

- Catch at the command action level
- Use `error instanceof Error ? error.message : String(error)`
- Print `❌ <command-name> failed: <message>` to stderr (`console.error`)
- Exit with `Deno.exit(1)` on error

## Output Format Implementation

```typescript
function formatOutput(results: Result[], format: string): string {
  switch (format) {
    case 'json':
    case 'pretty':
      return JSON.stringify(results, null, 2);
    case 'compact':
      return JSON.stringify(results);
    case 'yaml':
    default:
      return stringifyYaml(results);
  }
}
```
