---
description: 'Use when writing, running, or reviewing tests in gql-client. Covers Deno.test patterns, @std/assert assertions, test file naming, parser testing patterns, and test organization.'
applyTo: '**/*_test.ts'
---

# Testing Conventions

## Test File Naming

Tests are named after the module under test with `_test.ts` suffix (underscore, not dot):

| Source file           | Test file                  |
| --------------------- | -------------------------- |
| `utils/gql-parser.ts` | `utils/gql-parser_test.ts` |
| `main.ts`             | `main_test.ts`             |

## Deno.test Format

Use the object-style registration:

```typescript
import { assertEquals, assertExists, assertStringIncludes } from '@std/assert';

Deno.test('descriptive test name', async () => {
  // arrange
  const input = `@HOST_URL: "https://api.example.com/graphql"`;

  // act
  const result = parseHttpFile(input);

  // assert
  assertEquals(result.variables['HOST_URL'], 'https://api.example.com/graphql');
});
```

For grouped tests, use `t.step()`:

```typescript
Deno.test('gql-parser', async (t) => {
  await t.step('parses @VAR declarations', () => {
    const content = '@HOST_URL: "https://example.com"';
    const parsed = parseHttpFile(content);
    assertEquals(parsed.variables['HOST_URL'], 'https://example.com');
  });

  await t.step('splits requests on ###', () => {
    const content = 'POST https://a.com\n\n{ q }\n###\nPOST https://b.com\n\n{ q2 }';
    const parsed = parseHttpFile(content);
    assertEquals(parsed.requests.length, 2);
  });
});
```

## Assertions

Use `@std/assert` — never `console.assert` or raw `throw`:

```typescript
import {
  assert,
  assertEquals,
  assertExists,
  assertNotEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from '@std/assert';
```

| Goal               | Assertion                                            |
| ------------------ | ---------------------------------------------------- |
| Truthy             | `assert(value)`                                      |
| Strict equality    | `assertEquals(actual, expected)`                     |
| Not null/undefined | `assertExists(value)`                                |
| String contains    | `assertStringIncludes(str, 'substring')`             |
| Async throws       | `await assertRejects(() => fn(), ErrorClass, 'msg')` |
| Sync throws        | `assertThrows(() => fn(), ErrorClass, 'msg')`        |

## Command Smoke Tests (`main_test.ts`)

Check that all commands are registered with correct names:

```typescript
import { assertEquals, assertExists } from '@std/assert';
import { mainCommand } from './main.ts';

Deno.test('main command is registered', () => {
  assertEquals(mainCommand.getName(), 'gql-client');
});

Deno.test('run subcommand exists', () => {
  const cmd = mainCommand.getCommand('run');
  assertExists(cmd);
  assertEquals(cmd.getName(), 'run');
});

Deno.test('list subcommand exists', () => {
  assertExists(mainCommand.getCommand('list'));
});
```

## Parser Tests (`gql-parser_test.ts`)

Test the parser with inline string fixtures — no real `.http` files:

```typescript
Deno.test('parseHttpFile parses variables and request', () => {
  const content = `
@HOST_URL: "https://api.example.com/graphql"
@TOKEN: mytoken123

###
POST {{ HOST_URL }} HTTP/1.1
Authorization: Bearer {{ TOKEN }}
Content-Type: application/json

{ users { id name } }
`.trim();

  const file = parseHttpFile(content);
  assertEquals(file.variables['HOST_URL'], 'https://api.example.com/graphql');
  assertEquals(file.requests.length, 1);
  assertStringIncludes(file.requests[0].body, 'users');
});
```

## Testing Command Substitution

When testing `{{ $(cmd) }}` substitution, use a safe, deterministic command:

```typescript
Deno.test('resolves command substitution', async () => {
  const content = '@TOKEN: {{ $(echo "test-token") }}';
  const resolved = await resolveVariables(content, { allowCommands: true });
  assertEquals(resolved['TOKEN'], 'test-token');
});
```

## Running Tests

```bash
deno task test           # run all tests
deno test specific_test.ts  # run one file
deno test --filter "parser"  # filter by name pattern
```

## Test Isolation

- Never depend on real `~/.nuewframe/credential.json` or `~/.nuewframe/gql-client/config.json`
- Use inline strings for `.http` file content — don't read actual files on disk
- Clean up any temp files in `try/finally`
- Don't rely on network access in unit tests

## Output in Tests

Tests must not write diagnostic output to stdout — use `console.error` only if you need to debug transiently. Remove all console statements before committing.
