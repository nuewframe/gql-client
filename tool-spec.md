# gql-client — Tool Specification

## Commands

### `execute <file>`

Execute one or all GraphQL requests from a `.http` file.

```
gql-client execute <file> [options]
```

| Option                   | Type                               | Default                  | Description                                                |
| ------------------------ | ---------------------------------- | ------------------------ | ---------------------------------------------------------- |
| `-e, --endpoint <url>`   | string                             | from config or @HOST_URL | Override GraphQL endpoint URL                              |
| `-v, --variables <json>` | string                             | —                        | JSON string of GraphQL variables                           |
| `--env <env>`            | string                             | config `defaultEnv`      | Config environment to use                                  |
| `--skip-auth`            | boolean                            | false                    | Skip injecting Authorization header                        |
| `--allow-commands`       | boolean                            | false                    | Enable `{{ $(cmd) }}` variable substitution                |
| `-n, --number <n>`       | number                             | all                      | Execute only the Nth request                               |
| `-o, --output <format>`  | yaml\|json\|compact\|pretty\|table | yaml                     | Output format                                              |
| `--list`                 | boolean                            | false                    | List requests without executing                            |
| `--field <path>`         | string                             | —                        | Extract a dot-path field from results                      |
| `--select <jq>`          | string                             | —                        | Apply jq filter to results (requires `--allow-commands`)   |
| `--fail-on-errors`       | boolean                            | false                    | Exit 1 if any response contains GraphQL errors             |
| `--log-level <level>`    | none\|info\|debug                  | auto                     | Log verbosity (auto-silenced for compact/JSON/YAML output) |
| `--verbose`              | boolean                            | false                    | Equivalent to `--log-level debug`                          |

**Notes**:

- `--field` and `--select` cannot be combined
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
gql-client execute queries.http

# Execute with Okta token injection
gql-client execute queries.http --allow-commands

# Execute only the 2nd request
gql-client execute queries.http -n 2 --allow-commands

# List all requests without executing
gql-client execute queries.http --list

# JSON output piped to jq
gql-client execute queries.http -o compact --allow-commands | jq '.[0].data'

# Extract a field
gql-client execute queries.http --field data.users --allow-commands

# jq filter (requires --allow-commands)
gql-client execute queries.http -o compact --allow-commands \
  --select '.[] | .data.users[] | .name'

# Fail CI if GraphQL errors returned
gql-client execute smoke.http --fail-on-errors --allow-commands
```

---

### `config`

Manage `~/.gql-client/config.json`.

#### `config show`

Print the current config file as JSON.

```bash
gql-client config show
```

**Output**: Indented JSON of the config file to stdout.

#### `config set-env <env>`

Set the default environment used by `execute`.

```
gql-client config set-env <env>
```

**Example**:

```bash
gql-client config set-env production
gql-client config set-env development
```

---

## .http File Format Quick Reference

```http
@HOST_URL: "https://api.example.com/graphql"
@TOKEN: {{ $( okta-client get access-token ) }}

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

`~/.gql-client/config.json`:

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

Location: `~/.nuewframe/credential.json` (written by `okta-client`)

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
gql-client execute query.http -o compact --allow-commands | jq

# Extract user list
gql-client execute users.http -o compact --allow-commands | jq '.[0].data.users'

# Count results
gql-client execute users.http -o compact --allow-commands | jq '.[0].data.users | length'

# Save to file
gql-client execute users.http -o json --allow-commands > results.json

# Use in CI
if ! gql-client execute smoke.http --fail-on-errors --allow-commands; then
  echo "Smoke test failed"; exit 1
fi
```

---

## Quick Reference

```bash
# Run all requests in a file
gql-client execute queries.http --allow-commands

# Run one specific request
gql-client execute queries.http -n 1 --allow-commands

# List requests in a file
gql-client execute queries.http --list

# Set default environment
gql-client config set-env production
```
