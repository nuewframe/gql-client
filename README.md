# gql-client

[![CI](https://github.com/nuewframe/gql-client/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/nuewframe/gql-client/actions/workflows/ci.yml)

A Deno CLI for executing GraphQL queries and mutations from `.http` files. Integrates with [`okta-client`](https://github.com/nuewframe/okta-client) to inject `Authorization: Bearer` headers automatically.

Refer to the `okta-client` README section ["Integration with gql-client"](https://github.com/nuewframe/okta-client#integration-with-gql-client) for the latest token usage and examples.

## Why

GraphQL queries live in source control as `.http` files. `gql-client` runs them from the command line — with automatic Okta auth, output formatting, and `jq`-compatible piping — without needing Postman, Insomnia, or a browser.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/nuewframe/gql-client/main/install.sh | sh
```

Auto-detects your platform (macOS arm64/x64, Linux x64) and installs to `/usr/local/bin`.
Set `INSTALL_DIR` or `VERSION` to override:

```bash
VERSION=v1.2.0 INSTALL_DIR=~/.local/bin \
  curl -fsSL https://raw.githubusercontent.com/nuewframe/gql-client/main/install.sh | sh
```

### From source (Deno required)

```bash
git clone https://github.com/nuewframe/gql-client.git
cd gql-client
deno task dev --help
```

## Quick Start

```bash
# 1. Create a .http file
cat > query.http << 'EOF'
@HOST_URL: "https://api.example.com/graphql"

###
POST {{ HOST_URL }} HTTP/1.1
Content-Type: application/json

query { __typename }
EOF

# 2. Execute it
gql-client run query.http

# 3. With Okta auth (requires okta-client installed and logged in)
cat > query.http << 'EOF'
@HOST_URL: "https://api.example.com/graphql"
@TOKEN: {{ $( okta-client token access ) }}

###
POST {{ HOST_URL }} HTTP/1.1
Authorization: Bearer {{ TOKEN }}
Content-Type: application/json

query GetMe { me { id email } }
EOF

gql-client run query.http --allow-commands
```

## Command Reference

### `run <file>`

Execute one or all requests from a `.http` file.

```bash
gql-client run <file> [options]
```

| Option                    | Default                               | Description                                                 |
| ------------------------- | ------------------------------------- | ----------------------------------------------------------- |
| `-n, --request <n>`       | all                                   | Execute only the Nth request                                |
| `-o, --output <fmt>`      | yaml                                  | Output format: `yaml`, `json`, `compact`, `pretty`, `table` |
| `--list`                  | —                                     | List requests without executing                             |
| `--allow-commands`        | —                                     | Enable `{{ $(cmd) }}` variable substitution                 |
| `--fail-on-errors`        | —                                     | Exit 1 if any response contains GraphQL errors              |
| `--field <path>`          | —                                     | Extract a dot-path field from results                       |
| `-e, --endpoint <url>`    | —                                     | Override GraphQL endpoint URL                               |
| `--env-file <configPath>` | `~/.nuewframe/gql-client/config.json` | Config file containing environment variables                |
| `--env <name>`            | `defaultEnv` from config              | Environment name to use from config                         |
| `--log-level <level>`     | `info`                                | Log level: `none`, `info`, `debug`                          |

**Examples**:

```bash
# Execute all requests
gql-client run queries.http --allow-commands

# Execute the 2nd request only
gql-client run queries.http -n 2 --allow-commands

# List all requests in the file
gql-client run queries.http --list

# Compact JSON output (pipeline-friendly)
gql-client run queries.http -o compact --allow-commands | jq '.[0].data'

# Extract a field
gql-client run queries.http --field data.users --allow-commands

# CI smoke test
gql-client run smoke.http --fail-on-errors --allow-commands
```

### `config`

Manage `~/.nuewframe/gql-client/config.json`.

```bash
gql-client config show -o json                     # print config as JSON
gql-client config set-default production           # set default environment
gql-client config set-default production --env-file ./config.json
```

## .http File Format

Files follow the [JetBrains HTTP Client](https://www.jetbrains.com/help/idea/http-client-in-product-code-editor.html) extended format.

```http
@HOST_URL: "https://api.example.com/graphql"
@TOKEN: {{ $( okta-client token access ) }}

###
POST {{ HOST_URL }} HTTP/1.1
Authorization: Bearer {{ TOKEN }}
Content-Type: application/json

query GetUsers {
  users {
    id
    name
    email
  }
}

###
POST {{ HOST_URL }} HTTP/1.1
Authorization: Bearer {{ TOKEN }}
Content-Type: application/json

query GetOrgs {
  organizations { id name }
}
```

See [`tool-spec.md`](tool-spec.md) for the full format reference.

## Output Formats

| Format    | Description                | Best for        |
| --------- | -------------------------- | --------------- |
| `yaml`    | YAML array (default)       | Human review    |
| `json`    | Indented JSON              | File output     |
| `compact` | Single-line JSON           | Piping to `jq`  |
| `pretty`  | Per-request banners + JSON | Interactive use |

## Pipeline Patterns

Because `gql-client` writes diagnostics to **stderr** and data to **stdout**, you can pipe freely:

```bash
# Extract user list
gql-client run users.http -o compact --allow-commands | jq '.[0].data.users'

# Count results
gql-client run users.http -o compact --allow-commands | jq '.[0].data.users | length'

# Save to file
gql-client run users.http -o json --allow-commands > results.json

# CI assertion
gql-client run health.http --fail-on-errors --allow-commands || echo "Health check failed"
```

## Configuration

`~/.nuewframe/gql-client/config.json`:

```json
{
  "defaultEnv": "production",
  "environments": {
    "production": {
      "HOST_URL": "https://api.example.com/graphql",
      "TOKEN": "{{$(okta-client token access)}}"
    }
  }
}
```

Use with run:

```bash
# Authenticate first (pick one)
okta-client login browser --env production
okta-client login password wael@example.com --env production

# Then execute requests against env variables from config
gql-client run sample.http --env production --allow-commands
gql-client run sample.http --env-file ./config.json --env production --allow-commands
```

In your .http file, use command substitution for TOKEN and reuse it in Authorization:

```http
@TOKEN: {{$(okta-client token access)}}

###
POST {{HOST_URL}} HTTP/1.1
Authorization: Bearer {{TOKEN}}
Content-Type: application/json

query { __typename }
```

## Development

```bash
deno task dev --help          # run from source
deno task test                # run all tests (13 tests)
deno task lint                # deno lint
deno task fmt                 # deno fmt
deno task build:all           # compile all platform binaries
```

## Troubleshoot

Within an organization peer certificate may cause an `UnknownIssuer` error.

```bash
> gql-client run ./query.http --allow-commands
❌ Execution failed: error sending request for url (https://dev.domain.io): client error (Connect): invalid peer certificate: UnknownIssuer
```

Direct TLS CA Store to `System`.

```bash
export DENO_TLS_CA_STORE=system
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
