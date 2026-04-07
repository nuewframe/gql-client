# gql-client — Workspace Guidelines

## Tool Purpose

`gql-client` is a standalone Deno CLI for executing GraphQL queries and mutations
from `.http` files. It integrates with `okta-client` by reading tokens from
`~/.nuewframe/credential.json` and injecting them as `Authorization: Bearer` headers.

## Architecture

```
main.ts                   ← CLI entry point; registers all commands with Cliffy
commands/
  execute.ts              ← Execute one or all requests from a .http file
  config.ts               ← Manage and load/save ~/.nuewframe/gql-client/config.json
  auth.ts                 ← Credential loading used by execute
utils/
  gql-parser.ts           ← Parse JetBrains HTTP Client format .http files
  logger.ts               ← Logger class (none/info/debug) that writes to stderr
```

**Integration contract**: reads `~/.nuewframe/credential.json` (written by `okta-client`).
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

- Commands: verb or verb-noun (`execute.ts`, `list.ts`)
- Tests: `<original>_test.ts` (underscore, not dot)

### Error Handling

- Catch at command handler level
- Surface with `console.error('❌ ...')` and `Deno.exit(1)`
- Log lines (info/debug) to **stderr** via `logger.*()` — stdout is reserved for program output

### Logger

The `Logger` class in `utils/logger.ts` writes all diagnostic lines to **stderr**.
This is intentional: it allows `gql-client execute ... | jq` pipelines to work
without mixing status lines into the JSON output.

### Output Formats

The `execute` command supports multiple output formats:

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
@TOKEN: {{ $( okta-client get access-token ) }}

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
