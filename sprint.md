**Findings (Ordered by Severity)**

1. High: The env option is effectively a no-op in execute flow

- Evidence: execute.ts, execute.ts computes env but never uses it.
- Evidence of intended design: config.ts defines environments with endpoint and
  headers.
- Why this matters: CLI users expect --env to select endpoint and default
  headers; current behavior is misleading and can cause wrong-target calls.
- Best-practice fix: Resolve effective environment once, then merge precedence
  clearly:
  1. CLI flags
  2. Request-level values
  3. File-level values
  4. Environment defaults

2. High: User file path resolution includes source-relative fallback, which can
   execute unintended files

- Evidence: execute.ts, execute.ts.
- Why this matters: Common CLI pattern is deterministic resolution from caller
  context (cwd or absolute path). Source-relative fallback can hide mistakes and
  create surprising behavior.
- Best-practice fix: Resolve only absolute path or cwd-relative path, and fail
  fast with one clear path in the error.

3. Medium: Parser has a correctness bug risk when JSON variable block starts on
   duplicated lines

- Evidence: gql-parser.ts, gql-parser.ts.
- Why this matters: lines.indexOf(line) returns first matching line, not current
  loop position, so repeated lines can shift parsing start and corrupt extracted
  variables/query.
- Best-practice fix: Iterate with explicit index (for i from 0..n) and use i
  directly.

4. Medium: Utility layer mixes side effects and command concerns (logging and
   command execution)

- Evidence: auth.ts, auth.ts utility emits console errors directly.
- Evidence: gql-parser.ts, gql-parser.ts parser executes shell commands.
- Why this matters: For maintainable CLI architecture, utilities should stay
  mostly pure and command boundaries should own user messaging and high-risk
  side effects.
- Best-practice fix: Keep parser focused on parse/validate; move command
  execution policy to command layer; return typed diagnostics/errors from
  helpers instead of printing in helpers.

5. Medium: Config module uses synchronous file I/O in command path

- Evidence: config.ts, config.ts, config.ts.
- Why this matters: Sync I/O in CLIs is sometimes acceptable, but this repo’s
  own conventions favor async and it improves consistency/testability for future
  growth.
- Best-practice fix: Replace with async read/write and propagate async API
  through callers.

6. Low: Output and UX conventions are inconsistent across commands

- Evidence: list.ts, list.ts, list.ts mixes decorative text with data on stdout.
- Evidence: config.ts, config.ts human-only output without machine format
  options.
- Why this matters: CLI best practice is predictable machine-readable output
  modes and stderr-only diagnostics across all commands, not only
  execute/validate.
- Best-practice fix: Add shared output strategy (yaml/json/compact/table where
  relevant) and keep stdout data-only.

---

**Open Questions / Assumptions**

1. Should --env apply only endpoint, or endpoint plus default headers from
   config environments? it should apply both
2. Do you want config to become fully pipeline-friendly (structured
   output modes), or stay human-focused? I recommend pipeline-friendly for all commands for consistency and automation.
3. Is command substitution intended to remain in parser, or are you open to
   moving it to execute command for cleaner separation of concerns? cleaner separation of concerns would be ideal

---

**Residual Risk / Testing Gap**

- No explicit tests yet for env-resolution semantics (currently no-op) and for
  duplicate-line JSON variable parsing edge case.
- Limited cross-command contract tests for stdout/stderr invariants outside
  execute/validate.

1. I can implement a focused remediation patch for the top 3 findings (env
   wiring, path resolution cleanup, parser index bug).
2. I can also add a shared output utility and migrate list/config/auth to
   consistent CLI output contracts.

---

**Sprint 2 — Auth removal + env file support (2026-04-06)**

Design decision: remove the implicit nfauth credential auto-injection
entirely. Users declare their own auth variables in `.http` files or supply
them via an external env file. This removes the nfauth coupling and
makes auth behaviour explicit and transparent.

Changes:

- Removed `commands/auth.ts` and `loadCredentials()`. The concept of
  automatically reading `~/.nuewframe/credential.json` is gone.
- Changed `--env <name>` from a named-environment selector (backed by
  `~/.nuewframe/gql-client/config.json` environments) to `--env <file>` — a path to
  a simple `KEY=value` env file. The env file supports:
  - Hard-coded values: `TOKEN=mysecret`
  - System env vars: `TOKEN=$GITHUB_TOKEN` or `TOKEN=${GITHUB_TOKEN}`
  - Command substitution (requires --allow-commands):
    `TOKEN={{ $( nfauth token access ) }}`
- Variables from the env file are injected as base variables into the parser
  (lowest precedence). Inline `@VAR` declarations in the `.http` file
  override them.
- Removed `GqlConfig.defaultEnv` and `GqlConfig.environments` from
  `commands/config.ts` (replaced by env file approach). Removed `set-env`
  subcommand.
- Removed `--skip-auth` flag from execute command.
- Removed `normalizeAccessToken()`, `resolveAuthPlaceholders()`, and
  `resolveEnvConfig()` helpers from execute.ts.
- Added `loadEnvFile()` in execute.ts: parses `KEY=value` pairs, resolves
  `$VAR`/`${VAR}` system env refs, and optionally runs command tokens.
