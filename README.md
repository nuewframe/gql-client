# gql-client

A Deno CLI for executing GraphQL queries and mutations from `.http` files. Integrates with [`okta-client`](https://github.com/nuewframe/okta-client) to inject `Authorization: Bearer` headers automatically.

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
gql-client execute query.http

# 3. With Okta auth (requires okta-client installed and logged in)
cat > query.http << 'EOF'
@HOST_URL: "https://api.example.com/graphql"
@TOKEN: {{ $( okta-client get access-token ) }}

###
POST {{ HOST_URL }} HTTP/1.1
Authorization: Bearer {{ TOKEN }}
Content-Type: application/json

query GetMe { me { id email } }
EOF

gql-client execute query.http --allow-commands
```

## Command Reference

### `execute <file>`

Execute one or all requests from a `.http` file.

```bash
gql-client execute <file> [options]
```

| Option                 | Default | Description                                                 |
| ---------------------- | ------- | ----------------------------------------------------------- |
| `-n, --number <n>`     | all     | Execute only the Nth request                                |
| `-o, --output <fmt>`   | yaml    | Output format: `yaml`, `json`, `compact`, `pretty`, `table` |
| `--list`               | —       | List requests without executing                             |
| `--allow-commands`     | —       | Enable `{{ $(cmd) }}` variable substitution                 |
| `--fail-on-errors`     | —       | Exit 1 if any response contains GraphQL errors              |
| `--field <path>`       | —       | Extract a dot-path field from results                       |
| `--select <jq>`        | —       | Apply jq filter to results                                  |
| `--skip-auth`          | —       | Skip injecting Authorization header                         |
| `-e, --endpoint <url>` | —       | Override GraphQL endpoint URL                               |
| `--verbose`            | —       | Enable debug logging                                        |

**Examples**:

```bash
# Execute all requests
gql-client execute queries.http --allow-commands

# Execute the 2nd request only
gql-client execute queries.http -n 2 --allow-commands

# List all requests in the file
gql-client execute queries.http --list

# Compact JSON output (pipeline-friendly)
gql-client execute queries.http -o compact --allow-commands | jq '.[0].data'

# Extract a field
gql-client execute queries.http --field data.users --allow-commands

# CI smoke test
gql-client execute smoke.http --fail-on-errors --allow-commands
```

### `list [dir]`

Recursively list all `.http` files in a directory.

```bash
gql-client list [dir]                 # default: current directory
gql-client list queries/
```

### `config`

Manage `~/.gql-client/config.json`.

```bash
gql-client config show                # print config as JSON
gql-client config set-env production  # set default environment
```

### `auth`

Inspect or remove okta-client credentials.

```bash
gql-client auth status                # show credential status
gql-client auth clear                 # remove stored credentials
```

## .http File Format

Files follow the [JetBrains HTTP Client](https://www.jetbrains.com/help/idea/http-client-in-product-code-editor.html) extended format.

```http
@HOST_URL: "https://api.example.com/graphql"
@TOKEN: {{ $( okta-client get access-token ) }}

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
gql-client execute users.http -o compact --allow-commands | jq '.[0].data.users'

# Count results
gql-client execute users.http -o compact --allow-commands | jq '.[0].data.users | length'

# Save to file
gql-client execute users.http -o json --allow-commands > results.json

# CI assertion
gql-client execute health.http --fail-on-errors --allow-commands || echo "Health check failed"
```

## Configuration

`~/.gql-client/config.json`:

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

## Integration with okta-client

```bash
# 1. Authenticate with Okta
okta-client login user@example.com --env dev

# 2. Execute queries with auto-injected token
gql-client execute queries.http --allow-commands
```

The `access_token` from `~/.nuewframe/credential.json` (written by `okta-client`) is automatically read and injected as `Authorization: Bearer <token>`.

## Development

```bash
deno task dev --help          # run from source
deno task test                # run all tests (13 tests)
deno task lint                # deno lint
deno task fmt                 # deno fmt
deno task build:all           # compile all platform binaries
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
