---
description: 'Use when writing, editing, or reviewing TypeScript source files in the gql-client Deno workspace. Covers import patterns, type conventions, permission declarations, config file formats, and error handling.'
applyTo: '**/*.ts'
---

# TypeScript / Deno Conventions

## Architecture Paradigm

All code follows a strict layering order: **Capability → Data Structure → Function → Composition → Integration**.

1. **Capability** — Define *what* the system can do via TypeScript types and interfaces.
   Types are declared before any implementation. They are the source of truth.
2. **Data Structure** — Concrete types that flow through the system (parsed files, configs,
   results, errors). Data structures implement capabilities.
3. **Function** — Pure, stateless functions that transform data structures. Each function
   lives in a focused module under `commands/<domain>/` or `utils/`.
4. **Composition** — CLI commands (`commands/run.ts`, `commands/config.ts`) compose
   functions into workflows. A command never contains business logic directly — it wires
   capability, data, and functions together and exposes them to the user.
5. **Integration** — Contracts that connect layers: shared types imported across modules,
   the `ParsedGqlFile → GqlContent[]` pipeline, stdout/stderr output contract, and the
   `~/.nuewframe/` file-system contract with `okta-client`.

When adding new code, work top-down through these layers. Define the types first, implement
the functions that operate on them, then compose everything in the command handler.

## Deno Version Target

Minimum Deno 2.0. Use native Deno APIs and JSR packages.

## TypeScript Settings

From `deno.json`:

- `strict: true`
- `lib: ["ES2022", "DOM", "deno.ns"]`
- `2-space indent, single quotes, semicolons, 100-char line width`

Never use `// @ts-ignore` or `// @ts-nocheck` without an explanatory comment.

## Import Rules

### Correct patterns

```typescript
// JSR packages — bare (declared in deno.json "imports" map)
import { Command } from '@cliffy/command';
import { stringify as stringifyYaml } from '@std/yaml';
import { assertEquals } from '@std/assert';
import { dirname, fromFileUrl, resolve } from '@std/path';
import { exists } from '@std/fs';
import { request } from 'graphql-request';

// Internal — relative path with .ts extension
import { parseHttpFile } from '../utils/gql-parser.ts';
import { Logger } from '../utils/logger.ts';
import { getConfig } from '../commands/config.ts';
```

### Forbidden patterns

```typescript
// ❌ Never import via https://
import { parse } from 'https://deno.land/std/yaml/mod.ts';

// ❌ Never use jsr: or npm: directly in source files
import { Command } from 'jsr:@cliffy/command';
import { request } from 'npm:graphql-request';

// ❌ Never use extensionless internal paths
import { Logger } from '../utils/logger';
```

### Updating imports map

When adding new packages, update `deno.json` **and** vendor the cache:

```bash
deno cache --vendor main.ts
```

## File Naming Conventions

| Type          | Pattern              | Example                      |
| ------------- | -------------------- | ---------------------------- |
| Command       | verb or verb-noun    | `run.ts`, `list.ts`          |
| Config module | descriptive          | `config.ts`                  |
| Utility       | descriptive noun     | `gql-parser.ts`, `logger.ts` |
| Test          | `<original>_test.ts` | `gql-parser_test.ts`         |

## Config File — `~/.nuewframe/gql-client/config.json`

Loaded and saved by `commands/config.ts`. Schema:

```json
{
  "defaultEnv": "production",
  "environments": {
    "production": {
      "endpoint": "https://api.example.com/graphql",
      "headers": { "X-App-Version": "1.0" }
    }
  }
}
```

Load with:

```typescript
import { getConfig, saveConfig } from '../commands/config.ts';
const config = getConfig(); // returns {} if file missing
```

## Credential File — `~/.nuewframe/credential.json`

Written by `okta-client`. The `access_token` is the `Authorization: Bearer` header value.

```typescript
import { loadCredentials } from '../utils/credentials.ts';
const creds = await loadCredentials(); // null if absent — auth is silently skipped
if (creds?.access_token) {
  headers['Authorization'] = `Bearer ${creds.access_token}`;
}
```

Never throw if credential file is absent — treat it as unauthenticated.

## Permissions Model

```
--allow-read     # read .http files and config/credential files
--allow-write    # write config and credential files
--allow-env      # home directory resolution
--allow-net      # HTTP calls to GraphQL endpoints
--allow-run      # ONLY when --allow-commands is passed: {{ $(cmd) }} substitution
```

Grant `--allow-run` only when the user explicitly passes `--allow-commands` flag.

## Error Handling

**At command boundary:**

```typescript
try {
  // implementation
} catch (error) {
  console.error('❌ run failed:', error instanceof Error ? error.message : String(error));
  Deno.exit(1);
}
```

**In utilities and parser** — throw descriptive errors, don't log:

```typescript
if (!endpoint) {
  throw new Error(`No HOST_URL variable found in ${file}. Declare @HOST_URL: "https://..."`);
}
```

## Logger Usage

The `Logger` class in `utils/logger.ts` writes **only to stderr**. This is intentional — stdout is reserved for program data so pipelines work:

```bash
gql-client run query.http -o compact | jq '.[] | .data'
```

```typescript
import { Logger, LogLevel } from '../utils/logger.ts';

// In commands:
const logger = new Logger(options.verbose ? LogLevel.Debug : LogLevel.None);
logger.info('Executing request 1 of 3...');
logger.debug(`Resolved file: ${resolvedPath}`);

// Never use console.log for status/diagnostic lines
```

## stdout / stderr Invariant

| Output type                      | Stream                                      |
| -------------------------------- | ------------------------------------------- |
| Data (JSON, YAML, query results) | `console.log()` → stdout                    |
| Diagnostics, progress, errors    | `logger.*()` → stderr                       |
| User-facing errors + exit        | `console.error()` → stderr + `Deno.exit(1)` |

## Type Guards

Use consistently:

```typescript
const message = error instanceof Error ? error.message : String(error);
```

## Async File I/O

Use async variants only:

```typescript
const content = await Deno.readTextFile(filePath);
await Deno.writeTextFile(configPath, JSON.stringify(data, null, 2));
```

## Home Directory Resolution

```typescript
const home = Deno.env.get('HOME') ?? Deno.env.get('USERPROFILE') ?? '.';
const credentialPath = resolve(home, '.nuewframe', 'credential.json');
const configDir = resolve(home, '.nuewframe', 'gql-client');
```
