# gql-client — Workspace Guidelines

## Tool Purpose

`gql-client` is a standalone Deno CLI for executing GraphQL queries and mutations
from `.http` files. It integrates with `nfauth` by reading tokens from
`~/.nuewframe/credential.json` and injecting them as `Authorization: Bearer` headers.

## Architecture

The codebase follows a strict layering paradigm: **Capability → Data Structure → Function → Composition → Integration**.

| Layer           | What it defines                               | Examples in this repo                                               |
| --------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| **Capability**  | Types and interfaces — what the system can do | `GqlContent`, `ParsedGqlFile`, `RunOutputFormat`                    |
| **Data**        | Concrete shapes flowing through the pipeline  | Parsed requests, config schemas, result objects                     |
| **Function**    | Stateless transforms on data structures       | `loadGqlFile()`, `executeCommandTokens()`, `emitOutput()`           |
| **Composition** | CLI commands that wire functions together     | `commands/run.ts`, `commands/config.ts`                             |
| **Integration** | Contracts connecting layers and external deps | Shared types, stdout/stderr contract, `~/.nuewframe/` file contract |

Commands are the composition layer — they import types and functions, wire them in the
`.action()` handler, and route output. They never contain business logic directly.

```
main.ts                        ← CLI entry point; registers commands with Cliffy
commands/
  run.ts                       ← Composition: run command wires executor + formatter
  config.ts                    ← Composition: config management subcommands
  validate.ts                  ← Composition: .http file validation
  environment/resolver.ts      ← Function: resolve env variables
  errors/gql-client-error.ts   ← Capability: error type guard
  files/resolver.ts            ← Function: resolve .http file path
  output/formatter.ts          ← Function: serialize results (YAML/JSON)
  output/field-extractor.ts    ← Function: extract nested fields by dot-path
  requests/executor.ts         ← Function + Capability: types + run pipeline
  requests/formatter.ts        ← Function: format request list
  tokens/substitution.ts       ← Function: execute {{ $( command ) }} tokens
  validation/validator.ts      ← Function: emit validation diagnostics
utils/
  gql-parser.ts                ← Capability + Data + Function: types + parser
  logger.ts                    ← Capability: Logger class (writes to stderr)
```

**Integration contract**: reads `~/.nuewframe/credential.json` (written by `nfauth`).
The `access_token` field is used as the `Authorization: Bearer` header. When the credential
file is absent, auth is silently skipped unless the file explicitly declares an auth header
via `{{ TOKEN }}` substitution.

## Build & Test

```bash
deno task dev --help            # run from source
deno task test                  # run all tests
deno task lint                  # deno lint
deno task fmt                   # deno fmt
deno task build:all             # compile all platform targets → dist/
deno task release               # bump version + tag
```

## Code Style

Enforced by `deno fmt` and `deno lint`. Settings in `deno.json`:

- 2-space indent, single quotes, semicolons, 100-char line width
- `strict: true`, libs: `ES2022` + `DOM` + `deno.ns`

## Conventions

### Imports

- JSR and npm packages: declared in `deno.json` `imports` map, used bare
- Internal: relative with `.ts` extension (`./config.ts` or `../utils/logger.ts`)
- Never use `https://` URLs or `jsr:`/`npm:` directly in source files

### Naming

- Commands: verb or verb-noun (`run.ts`, `list.ts`)
- Tests: `<original>_test.ts` (underscore, not dot)

### Error Handling

- Catch at command handler level
- Surface with `console.error('❌ ...')` and `Deno.exit(1)`
- Log lines (info/debug) to **stderr** via `logger.*()` — stdout is reserved for program output

### Logger

The `Logger` class in `utils/logger.ts` writes all diagnostic lines to **stderr**.
This is intentional: it allows `gql-client run ... | jq` pipelines to work
without mixing status lines into the JSON output.

### Output Formats

The `run` command supports multiple output formats:

- `yaml` (default): YAML array of `{query, data}` objects
- `json` / `pretty`: indented JSON array
- `compact`: single-line JSON — status lines are silenced automatically
- `pretty` (human): per-request banners + pretty-printed JSON

### Permissions

`--allow-read --allow-write --allow-env --allow-net --allow-run`

`--allow-run` is required for `{{ $( command ) }}` variable substitution.
Only enabled when `--allow-commands` flag is passed by the user.

## .http File Format

Files follow the JetBrains HTTP Client extended format. Requests are separated by `###`.
Variable declarations use `@VAR: value` syntax. Substitutions use `{{ VAR }}`.

```http
@HOST_URL: "https://api.example.com/graphql"
@TOKEN: {{ $( nfauth token access ) }}

###
POST {{ HOST_URL }} HTTP/1.1
Authorization: Bearer {{ TOKEN }}
Content-Type: application/json

query GetUser($id: ID!) {
  user(id: $id) { id name email }
}
```

## Config File Location

`~/.nuewframe/gql-client/config.json` — JSON file. Schema:

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
