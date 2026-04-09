# gql-client — Tool Specification

## Commands

### `run <file>`

Execute one or all GraphQL requests from a `.http` file.

```
gql-client run <file> [options]
```

| Option                   | Type                               | Default                               | Description                                                 |
| ------------------------ | ---------------------------------- | ------------------------------------- | ----------------------------------------------------------- |
| `-e, --endpoint <url>`   | string                             | from config or @HOST_URL              | Override GraphQL endpoint URL                               |
| `-v, --variables <json>` | string                             | —                                     | JSON string of GraphQL variables                            |
| `--env-file <file>`      | string                             | `~/.nuewframe/gql-client/config.json` | Path to config file with environments                       |
| `--env <env>`            | string                             | config `defaultEnv`                   | Environment name in config to use for variable substitution |
| `--allow-commands`       | boolean                            | false                                 | Enable `{{ $(cmd) }}` variable substitution                 |
| `-n, --request <n>`      | number                             | all                                   | Execute only the Nth request                                |
| `-o, --output <format>`  | yaml\|json\|compact\|pretty\|table | yaml                                  | Output format                                               |
| `--list`                 | boolean                            | false                                 | List requests without executing                             |
| `--field <path>`         | string                             | —                                     | Extract a dot-path field from results                       |
| `--fail-on-errors`       | boolean                            | false                                 | Exit 1 if any response contains GraphQL errors              |
| `--log-level <level>`    | none\|info\|debug                  | auto                                  | Log verbosity (auto-silenced for compact/JSON/YAML output)  |
| `--verbose`              | boolean                            | false                                 | Equivalent to `--log-level debug`                           |

**Notes**:

- Log output is automatically silenced when `-o compact`, `-o json`, `-o yaml`, or `-o table` is used (unless `--list` is active)
- `--allow-commands` requires `--allow-run` permission to be granted (baked into the binary)

**Output formats**:

| Format    | Description                                     |
| --------- | ----------------------------------------------- |
| `yaml`    | YAML array of `{query, data}` objects (default) |
| `json`    | Indented JSON array                             |
| `compact` | Single-line JSON                                |
| `pretty`  | Per-request banners + pretty-printed JSON       |
| `table`   | Tabular format (if available in schema)         |

**Examples**:

```bash
# Execute all requests
gql-client run queries.http

# Execute using default env from config
gql-client run queries.http

# Execute using specific env from config
gql-client run queries.http --env production

# Execute with custom config path
gql-client run queries.http --env-file ./config.json --env production

# Execute only the 2nd request
gql-client run queries.http -n 2 --allow-commands

# List all requests without executing
gql-client run queries.http --list

# JSON output piped to jq
gql-client run queries.http -o compact --allow-commands | jq '.[0].data'

# Extract a field
gql-client run queries.http --field data.users --allow-commands

# Fail CI if GraphQL errors returned
gql-client run smoke.http --fail-on-errors --allow-commands
```

---

### `config`

Manage `~/.nuewframe/gql-client/config.json`.

#### `config show`

Print the current config file as JSON.

```bash
gql-client config show
```

**Output**: Indented JSON of the config file to stdout.

#### `config set-default <env>`

Set the default environment used by `run`.

```
gql-client config set-default <env>
```

**Example**:

```bash
gql-client config set-default production
gql-client config set-default development
gql-client config set-default production --env-file ./config.json
```

---

## .http File Format Quick Reference

```http
@HOST_URL: "https://api.example.com/graphql"
@TOKEN: {{ $( nfauth token access ) }}

###
POST {{ HOST_URL }} HTTP/1.1
Authorization: Bearer {{ TOKEN }}
Content-Type: application/json

query GetUsers {
  users { id name email }
}

###
POST {{ HOST_URL }} HTTP/1.1
Authorization: Bearer {{ TOKEN }}
Content-Type: application/json

query GetOrgs {
  organizations { id name }
}
```

See `.github/instructions/gql-files.instructions.md` for the full format spec.

---

## Config File Schema

`~/.nuewframe/gql-client/config.json`:

```json
{
  "defaultEnv": "production",
  "environments": {
    "production": {
      "endpoint": "https://api.example.com/graphql",
      "headers": {
        "X-App-Version": "1.0"
      }
    },
    "development": {
      "endpoint": "https://dev-api.example.com/graphql"
    }
  }
}
```

---

## Credential File (read-only for gql-client)

Location: `~/.nuewframe/credential.json` (written by `nfauth`)

The `access_token` field is read and injected as `Authorization: Bearer <token>`.
If the file is absent, auth headers are not injected (silently unauthenticated).

---

## Exit Codes

| Code | Meaning                                                             |
| ---- | ------------------------------------------------------------------- |
| `0`  | All requests succeeded                                              |
| `1`  | Runtime error, or GraphQL errors detected (with `--fail-on-errors`) |

---

## Pipeline Patterns

```bash
# Basic pipeline
gql-client run query.http -o compact --allow-commands | jq

# Extract user list
gql-client run users.http -o compact --allow-commands | jq '.[0].data.users'

# Count results
gql-client run users.http -o compact --allow-commands | jq '.[0].data.users | length'

# Save to file
gql-client run users.http -o json --allow-commands > results.json

# Use in CI
if ! gql-client run smoke.http --fail-on-errors --allow-commands; then
  echo "Smoke test failed"; exit 1
fi
```

---

## Quick Reference

```bash
# Run all requests in a file
gql-client run queries.http --allow-commands

# Run one specific request
gql-client run queries.http -n 1 --allow-commands

# List requests in a file
gql-client run queries.http --list

# Set default environment
gql-client config set-default production
```
