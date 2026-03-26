# Contributing to gql-client

Thank you for your interest in contributing!

## Development Setup

1. Install [Deno](https://deno.land/) ≥ 2.0
2. Clone the repo:
   ```bash
   git clone https://github.com/nuewframe/gql-client.git
   cd gql-client
   ```
3. Run from source:
   ```bash
   deno task dev --help
   ```
4. Run tests:
   ```bash
   deno task test
   ```

## Code Style

This project uses `deno fmt` and `deno lint` with the settings in `deno.json`:

- 2-space indentation
- Single quotes
- Semicolons
- 100-character line width

Always run before submitting:

```bash
deno task lint
deno task fmt
```

## Project Structure

```
commands/     One file per CLI subcommand
config/       Config loading/saving utilities
utils/        Shared utilities (parser, logger)
```

## stdout / stderr Rule

All diagnostic output (progress, info, debug) must go to **stderr** via the `Logger` class.
Stdout is reserved exclusively for program data output. This keeps `jq` pipelines clean.

Never use `console.log` for status messages — use `logger.info()` instead.

## Adding a New Command

See `.github/skills/new-command/SKILL.md` for the step-by-step guide.

## Working with .http Files

See `.github/skills/http-files/SKILL.md` for the full format reference and execution examples.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add --fail-on-errors flag to execute command
fix: resolve variables before injecting auth header
docs: update .http file format examples
chore: bump graphql-request to 7.5.0
test: add parser test for multi-line query body
```

## Security Rules

- Never commit access tokens or API keys in `.http` example files
- Use `{{ $( okta-client get access-token ) }}` for token injection
- Report security issues privately — see SECURITY.md (coming soon)

## Commit Message Convention

This repo uses [Conventional Commits](https://www.conventionalcommits.org/). The release
automation (`release-please`) reads commit messages to determine version bumps and generate
the CHANGELOG automatically.

| Prefix              | Effect              | Example                                            |
| ------------------- | ------------------- | -------------------------------------------------- |
| `feat:`             | minor version bump  | `feat: add --table output format`                  |
| `fix:`              | patch version bump  | `fix: handle missing credential file gracefully`   |
| `feat!:` or `fix!:` | major version bump  | `feat!: change default output from yaml to json`   |
| `docs:`             | no bump (docs only) | `docs: add .http file examples`                    |
| `chore:`            | no bump             | `chore: update dependencies`                       |
| `refactor:`         | no bump             | `refactor: simplify variable substitution logic`   |
| `test:`             | no bump             | `test: add parser edge cases for multiline bodies` |

Breaking changes must also include a `BREAKING CHANGE:` footer in the commit body:

```
feat!: rename --select flag to --jq

BREAKING CHANGE: the --select flag has been renamed to --jq for clarity
```

> **Tip:** Squash your PR commits so each PR produces one clean conventional commit on `main`.

## Pull Request Process

1. Fork and create a branch: `git checkout -b feat/my-feature`
2. Make changes with tests
3. Run `deno task test` — all 13 tests must pass
4. Run `deno task lint && deno task fmt`
5. Ensure your commits follow the Conventional Commits convention above
6. Push and open a PR against `main` — fill in the PR template checklist
7. A maintainer from `@nuewframe/maintainers` will review and approve
8. Once approved and CI is green, squash-merge to `main`

## Release Process

Releases are **fully automated** — no manual steps required:

1. Your squash-merged commit to `main` is inspected by `release-please`
2. If the commit warrants a release (`feat:`, `fix:`, or breaking change), release-please
   opens or updates a Release PR that bumps the version and updates `CHANGELOG.md`
3. A maintainer reviews and merges the Release PR
4. The merge triggers binary builds for all platforms; artifacts are attached to the GitHub Release automatically

See [RELEASE.md](RELEASE.md) for the full release process and [BRANCH_PROTECTION.md](BRANCH_PROTECTION.md) for the governance model.
