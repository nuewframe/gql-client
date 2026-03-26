# new-command Skill

## When to Use

Trigger phrases: "add command", "new command", "create command", "new subcommand".

Use this skill when adding a new CLI subcommand to `gql-client`.

---

## Checklist

1. [ ] Create `commands/<verb>.ts`
2. [ ] Export the command as a named `const`
3. [ ] Register it in `main.ts`
4. [ ] Add a smoke test in `main_test.ts`
5. [ ] Add command reference to `README.md`

---

## Step 1 — Create the Command File

File: `commands/<name>.ts`

```typescript
import { Command } from '@cliffy/command';
import { Logger, LogLevel } from '../utils/logger.ts';

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

      // --- implementation here ---
      const result = { data: 'value' };

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

- File: verb or verb-noun (`execute.ts`, `list.ts`)
- Export: camelCase (`executeCommand`, `listCommand`)
- Command name: same as file without `.ts`

## Step 2 — Register in main.ts

```typescript
// In main.ts — add import
import { myCommand } from './commands/my-command.ts';

// Add to root command
const mainCommand = new Command()
  .name('gql-client')
  // ... existing commands ...
  .command('my-command', myCommand);
```

## Step 3 — Global Option Pattern

Declare options directly on the command — they are not auto-inherited in Cliffy:

```typescript
export const myCommand = new Command()
  .option('-o, --output <format:string>', 'Output format', { default: 'yaml' })
  .option('--verbose', 'Enable verbose output');
```

## Step 4 — Smoke Test in main_test.ts

```typescript
Deno.test('my-command subcommand exists', () => {
  const cmd = mainCommand.getCommand('my-command');
  assertExists(cmd);
  assertEquals(cmd.getName(), 'my-command');
});
```

## Step 5 — Subcommands Pattern

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
