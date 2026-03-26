# Changelog

All notable changes to `gql-client` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Nothing yet

## [1.0.1] - 2024-01-01

### Added

- Standalone repository — extracted from `okta-gql-clients` monorepo
- `context.md` and `tool-spec.md` for AI-assisted development
- `.github/instructions/` and `.github/skills/` for Copilot integration

### Fixed

- `execute` command: resolved file path now uses 1-level-up from `commands/` (was 3 levels deep from monorepo root)

## [1.0.0] - 2024-01-01

### Added

- `execute <file>` — execute one or all requests from a `.http` file
  - `-n, --number` — execute only the Nth request
  - `-o, --output yaml|json|compact|pretty|table` — output formats
  - `--list` — list requests without executing
  - `--allow-commands` — enable `{{ $(cmd) }}` variable substitution
  - `--fail-on-errors` — exit 1 on GraphQL errors
  - `--field` — dot-path field extraction
  - `--select` — jq filter application
  - `--skip-auth` — bypass credential injection
- `list [dir]` — recursively list `.http` files
- `config show` — display `~/.gql-client/config.json`
- `config set-env` — set default environment
- `auth status` — check okta-client credential status
- `auth clear` — remove stored credentials
- JetBrains HTTP Client format parser with `@VAR` declarations and `{{ VAR }}` substitution
- `{{ $( command ) }}` shell command substitution (with `--allow-commands` guard)
- Automatic `Authorization: Bearer` header injection from `~/.nuewframe/credential.json`
- All diagnostic output to stderr (stdout reserved for data — enables `| jq` pipelines)
