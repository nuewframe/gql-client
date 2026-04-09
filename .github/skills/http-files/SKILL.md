---
name: http-files
description: Guidance for creating, editing, and running .http files with gql-client.
---

# http-files Skill

## When to Use

Trigger phrases: "http file", ".http", "gql file", "sample.http", "run query", "run request", "filter response", "create .http file".

Use this skill when creating, editing, running, or filtering `.http` files in the gql-client workflow.

---

## .http File Basics

A `.http` file holds one or more GraphQL requests in the JetBrains HTTP Client format.

```http
@HOST_URL: "https://api.example.com/graphql"
@TOKEN: {{ $( nfauth token access ) }}

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
```

`###` separates requests. Variables declared at the top apply to all requests in the file.

---

## Creating a New .http File

### Minimal template

```http
@HOST_URL: "https://api.example.com/graphql"

###
POST {{ HOST_URL }} HTTP/1.1
Content-Type: application/json

query {
  __typename
}
```

### With nfauth authentication

```http
@HOST_URL: "https://api.example.com/graphql"
@TOKEN: {{ $( nfauth token access ) }}

###
POST {{ HOST_URL }} HTTP/1.1
Authorization: Bearer {{ TOKEN }}
Content-Type: application/json

query GetMe {
  me {
    id
    email
    displayName
  }
}
```

### With GraphQL variables

```http
@HOST_URL: "https://api.example.com/graphql"
@TOKEN: {{ $( nfauth token access ) }}

###
POST {{ HOST_URL }} HTTP/1.1
Authorization: Bearer {{ TOKEN }}
Content-Type: application/json

{
  "query": "query GetUser($id: ID!) { user(id: $id) { id name email } }",
  "variables": { "id": "usr_abc123" }
}
```

---

## Variable Syntax

| Syntax               | Meaning                                               |
| -------------------- | ----------------------------------------------------- |
| `@VAR: "value"`      | Declare variable (quotes stripped)                    |
| `@VAR: value`        | Declare variable (no quotes needed for simple values) |
| `{{ VAR }}`          | Substitute declared variable                          |
| `{{ $( command ) }}` | Command substitution (requires `--allow-commands`)    |

---

## Multi-Request Files

```http
@HOST_URL: "https://api.example.com/graphql"
@TOKEN: {{ $( nfauth token access ) }}

###
POST {{ HOST_URL }} HTTP/1.1
Authorization: Bearer {{ TOKEN }}
Content-Type: application/json

query ListUsers {
  users { id name }
}

###
POST {{ HOST_URL }} HTTP/1.1
Authorization: Bearer {{ TOKEN }}
Content-Type: application/json

query ListOrgs {
  organizations { id name memberCount }
}
```

---

## Executing with gql-client

```bash
# Run all requests (default: yaml output)
gql-client run queries.http

# Run with token substitution enabled
gql-client run queries.http --allow-commands

# Run only the second request
gql-client run queries.http -n 2 --allow-commands

# List all requests without executing
gql-client run queries.http --list

# JSON output
gql-client run queries.http -o json --allow-commands

# Compact JSON (pipeline-friendly)
gql-client run queries.http -o compact --allow-commands

# Pretty output with banners
gql-client run queries.http -o pretty --allow-commands
```

---

## Filtering Output

### Field selection (dot-path)

```bash
# Extract a nested field from all results
gql-client run queries.http -o yaml --field data.users --allow-commands
```

### jq filtering (shell pipeline)

```bash
# Extract user names from all results
gql-client run queries.http -o compact --allow-commands | jq '.[] | .data.users[] | .name'

# Pipe to jq separately
gql-client run queries.http -o compact --allow-commands | jq '.[] | .data'
```

---

## Piping to Downstream Tools

Because `gql-client` sends diagnostics to stderr and data to stdout, you can pipe freely:

```bash
# To jq
gql-client run users.http -o compact --allow-commands | jq '.[0].data.users'

# To yq
gql-client run users.http --allow-commands | yq '.[] | .data'

# Save to file
gql-client run users.http -o json --allow-commands > results.json

# Count results
gql-client run users.http -o compact --allow-commands | jq '.[0].data.users | length'
```

---

## File Naming and Organization

```
queries/
  users.http          — User-related queries
  organizations.http  — Org queries
  mutations/
    create-user.http  — Mutations in a subdirectory
```

Naming rules:

- Kebab-case filenames: `get-user-by-id.http`
- One domain per file
- Mutations in a `mutations/` subdirectory when there are many

List all `.http` files in a directory:

```bash
gql-client list queries/
```

---

## Using Environment-Specific Endpoints

```http
# development.http — use dev endpoint
@HOST_URL: "https://dev-api.example.com/graphql"
@TOKEN: {{ $( nfauth token access ) }}

###
POST {{ HOST_URL }} HTTP/1.1
Authorization: Bearer {{ TOKEN }}
Content-Type: application/json

query { __typename }
```

Or use `gql-client config` to set a default endpoint, then omit `@HOST_URL`:

```bash
gql-client config set-default production
```

---

## Security: Never Hardcode Tokens

```http
# ✅ Correct — command substitution
@TOKEN: {{ $( nfauth token access ) }}

# ✅ Correct — short-lived token injected at runtime  
@TOKEN: {{ $( cat /tmp/dev-token.txt ) }}

# ❌ Wrong — never commit real tokens
@TOKEN: "eyJhbGciOiJSUzI1NiJ9.real-token-here..."
```

Add `.env`, but **not** `.http` files, to secrets scanning exclusions. The `.http` files contain query structure and should be in version control.

---

## Fail-Safe Execution

```bash
# Exit non-zero if any request returns GraphQL errors
gql-client run queries.http --fail-on-errors --allow-commands

# Use in CI scripts
if ! gql-client run smoke-test.http --fail-on-errors --allow-commands; then
  echo "Smoke test failed"
  exit 1
fi
```
