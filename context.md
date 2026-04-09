# gql-client — Project Context

## Purpose

`gql-client` is a standalone Deno CLI for executing GraphQL queries and mutations
from `.http` files. It integrates with `nfauth` by reading tokens from
`~/.nuewframe/credential.json` and injecting them as `Authorization: Bearer` headers.
Results are printed to stdout in multiple formats, enabling pipeline composition with
`jq`, `yq`, and other Unix tools.

## Architecture

```
main.ts                    CLI entry point; registers all commands with Cliffy
commands/
  run.ts                   Run one or all requests from a .http file
  list.ts                  Recursively list .http files in a directory
  config.ts                Manage ~/.nuewframe/gql-client/config.json (show)
  auth.ts                  Check/clear nfauth credentials (status/clear)
config/
  config.ts                Load/save ~/.nuewframe/gql-client/config.json, type definitions
utils/
  gql-parser.ts            Parse JetBrains HTTP Client format .http files
  logger.ts                Logger class (none/info/debug) → stderr ONLY
```

## Integration Contract

This tool **reads** `~/.nuewframe/credential.json` (written by `nfauth`).
The `access_token` field is injected as `Authorization: Bearer <token>`.

When the credential file is absent, auth is silently skipped. If the `.http` file
declares an explicit `Authorization` header (e.g., via `{{ TOKEN }}` substitution),
that takes precedence.

## Config File

Location: `~/.nuewframe/gql-client/config.json`

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

## .http File Format

Files follow JetBrains HTTP Client extended format. See `.github/instructions/gql-files.instructions.md` for full spec.

Key elements:

- `@VAR: "value"` — declare a variable
- `{{ VAR }}` — substitute a variable
- `{{ $( command ) }}` — command substitution (requires `--allow-commands`)
- `###` — request separator

## Key Files

| File                            | Role                                                                    |
| ------------------------------- | ----------------------------------------------------------------------- |
| `deno.json`                     | Package manifest: `@nuewframe/gql-client` v1.0.1, imports map, tasks    |
| `main.ts`                       | Export `mainCommand`; entry point when `import.meta.main`               |
| `commands/run.ts`               | Core command entrypoint: options + delegation to run executor           |
| `commands/requests/executor.ts` | Core run flow: parse → resolve variables → execute → format → print     |
| `utils/gql-parser.ts`           | `parseHttpFile()`, `resolveVariables()`, `parseRequests()`              |
| `commands/config.ts`            | `getConfig()`, `saveConfig()` for `~/.nuewframe/gql-client/config.json` |

## Command Surface Summary

```
gql-client run <file>             Execute all requests in a .http file
  -n, --request <n>                   Execute only the Nth request
  -o, --output yaml|json|compact|pretty  Output format (default: yaml)
  --list                              List requests without executing
  --field <path>                      Extract a field from results (dot-path)
  --fail-on-errors                    Exit 1 if any response has GraphQL errors
  --allow-commands                    Enable {{ $( cmd ) }} substitution
  --env-file <configPath>             Config file path (default ~/.nuewframe/gql-client/config.json)
  --env <name>                        Environment name from config
  --log-level none|info|debug         Logging verbosity

gql-client config show                Show ~/.nuewframe/gql-client/config.json
gql-client config set-default <env>   Set default environment
```

## Output Formats

| Flag                | Output                                                |
| ------------------- | ----------------------------------------------------- |
| `-o yaml` (default) | YAML array of `{query, data}` objects                 |
| `-o json`           | Indented JSON array                                   |
| `-o compact`        | Single-line JSON (silences status logs automatically) |
| `-o pretty`         | Per-request banners + pretty-printed JSON             |

## Technology Stack

| Concern            | Library                              |
| ------------------ | ------------------------------------ |
| CLI framework      | `@cliffy/command@^1.0.0`             |
| HTTP (GraphQL)     | `graphql-request@^7.4.0`             |
| YAML output        | `@std/yaml@^1.0.12`                  |
| File system        | `@std/fs`, `@std/path`               |
| Assertions (tests) | `@std/assert@^1.0.19`                |
| Runtime            | Deno 2.0+, TypeScript 5, strict mode |

## Permissions

| Permission      | Reason                                                     |
| --------------- | ---------------------------------------------------------- |
| `--allow-read`  | Read `.http` files, config, credential files               |
| `--allow-write` | Write config file                                          |
| `--allow-env`   | Home directory resolution                                  |
| `--allow-net`   | HTTP calls to GraphQL endpoints                            |
| `--allow-run`   | `{{ $(cmd) }}` substitution (only with `--allow-commands`) |

## stdout / stderr Invariant

**Critical**: all diagnostic output goes to **stderr** via the `Logger` class.
Stdout carries only program data. This enables:

```bash
gql-client run query.http -o compact --allow-commands | jq '.[0].data'
```

Never use `console.log` for diagnostic messages.

## Test Coverage

| File                       | Tests | Covers                                            |
| -------------------------- | ----- | ------------------------------------------------- |
| `main_test.ts`             | 6     | Command registration, basic parser integration    |
| `utils/gql-parser_test.ts` | 7     | Variable parsing, request splitting, substitution |

Run: `deno task test`\
Total: 13 tests, all passing.

## Security Invariants

1. Tokens in `.http` files must use `{{ $( nfauth token access ) }}`, never hardcoded
2. `--allow-run` is granted only when `--allow-commands` is explicitly passed
3. Credential file absence is a no-op (silently unauthenticated), not an error
4. No token values ever appear in log output

## Modernization Audit (Deno 2 / TypeScript 5)

**Last audited:** 2025-07-25 | **Runtime:** Deno 2.7.x | **TypeScript:** 5.9.x

### Dependency Status

| Package           | Version   | Status                                  |
| ----------------- | --------- | --------------------------------------- |
| `@cliffy/command` | `^1.0.0`  | ✅ Current — Cliffy 1.x stable on JSR   |
| `@std/assert`     | `^1.0.19` | ✅ Current                              |
| `@std/cli`        | `^1.0.0`  | ✅ Current                              |
| `@std/fs`         | `^1.0.23` | ✅ Current                              |
| `@std/path`       | `^1.1.4`  | ✅ Current                              |
| `@std/yaml`       | `^1.0.12` | ✅ Current                              |
| `@std/jsonc`      | `^1.0.2`  | ✅ Current                              |
| `graphql-request` | `^7.4.0`  | ✅ Current — v7 supports fetch natively |

### Deprecated API Sweep

- No usage of `Deno.Buffer`, `Deno.copy`, `Deno.readAll`, `Deno.writeAll`
- No usage of removed `std/encoding`, `std/io` (pre-2.0) modules
- No `https://` import URLs in source — all via `deno.json` imports map
- No `// deno-lint-ignore` or `// deno-ts-ignore` suppressions
- No unsafe `any` types found in source or tests

### Ongoing Recommendations

- Run `deno outdated` periodically to surface new JSR patch versions
- `graphql-request` v8 may drop Node.js-specific fetch polyfill — verify compatibility before upgrading
- Consider adding `"nodeModulesDir": false` to `deno.json` once all npm deps support it (reduces disk footprint in CI)
