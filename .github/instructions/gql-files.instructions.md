---
description: 'Use when creating, editing, or understanding .http files for the gql-client tool. Covers JetBrains HTTP Client format, request sections, variable declarations, substitution syntax, and integration with okta-client tokens.'
applyTo: '**/*.http'
---

# .http File Format

`gql-client` uses the JetBrains HTTP Client extended format for `.http` files.

## File Structure

```
[optional variable declarations]

###
[request 1]

###
[request 2]
```

- Requests are separated by `###` on its own line
- Variable declarations go at the top (before the first `###`)
- Each request section begins with the HTTP method and URL

## Variable Declarations

```http
@HOST_URL: "https://api.example.com/graphql"
@API_KEY: "my-api-key-here"
```

- Syntax: `@NAME: value`
- Quoted values: quotes are stripped during substitution
- Unquoted values are also supported: `@ENV: production`

## Request Format

```http
###
POST {{ HOST_URL }} HTTP/1.1
Authorization: Bearer {{ API_KEY }}
Content-Type: application/json

query GetUsers {
  users {
    id
    name
    email
  }
}
```

- First line: `METHOD URL [HTTP/version]` (version is optional)
- Headers follow immediately after the request line
- Body follows a blank line

## Variable Substitution

```http
{{ VARIABLE_NAME }}
```

Variables are resolved in this order:

1. Declared `@VAR` in the file
2. Environment variables (not currently used)

```http
@HOST_URL: "https://api.example.com/graphql"

###
POST {{ HOST_URL }} HTTP/1.1
```

## Command Substitution

Requires `--allow-commands` flag to be passed to `gql-client execute`.

```http
@TOKEN: {{ $( okta-client get access-token ) }}
```

Syntax: `{{ $( shell command here ) }}`

The shell command's stdout (trimmed) becomes the variable value.

**Common usage** — inject fresh Okta token:

```http
@HOST_URL: "https://api.example.com/graphql"
@TOKEN: {{ $( okta-client get access-token ) }}

###
POST {{ HOST_URL }} HTTP/1.1
Authorization: Bearer {{ TOKEN }}
Content-Type: application/json

query Me {
  me {
    id
    email
  }
}
```

Run with:

```bash
gql-client execute queries.http --allow-commands
```

## Multiple Requests in One File

```http
@HOST_URL: "https://api.example.com/graphql"
@TOKEN: {{ $( okta-client get access-token ) }}

###
POST {{ HOST_URL }} HTTP/1.1
Authorization: Bearer {{ TOKEN }}
Content-Type: application/json

query GetUsers {
  users { id name }
}

###
POST {{ HOST_URL }} HTTP/1.1
Authorization: Bearer {{ TOKEN }}
Content-Type: application/json

query GetOrgs {
  organizations { id name }
}
```

Execute all requests:

```bash
gql-client execute queries.http --allow-commands
```

Execute only the second request:

```bash
gql-client execute queries.http -n 2 --allow-commands
```

List requests without executing:

```bash
gql-client execute queries.http --list
```

## GraphQL Variables

Pass GraphQL variables as a JSON body alongside the query:

```http
###
POST {{ HOST_URL }} HTTP/1.1
Authorization: Bearer {{ TOKEN }}
Content-Type: application/json

{
  "query": "query GetUser($id: ID!) { user(id: $id) { name email } }",
  "variables": { "id": "usr_123" }
}
```

Or use the plain query syntax (gql-client wraps it in `{"query":"..."}` automatically):

```http
###
POST {{ HOST_URL }} HTTP/1.1

query GetUser {
  user(id: "usr_123") {
    name
    email
  }
}
```

## Output Format Selection

```bash
gql-client execute query.http -o yaml      # default: YAML array
gql-client execute query.http -o json      # indented JSON
gql-client execute query.http -o compact   # single-line JSON (pipeline-friendly)
gql-client execute query.http -o pretty    # human-readable with banners
```

## Filtering Output

Field selection (dot-path):

```bash
gql-client execute query.http --field data.users
```

jq filter (requires `--allow-commands`):

```bash
gql-client execute query.http --select '.[] | .data.users[]'
```

## Naming Conventions

- One logical domain per file: `users.http`, `organizations.http`
- Kebab-case filenames: `get-user-by-id.http`
- Group related queries in one file; separate unrelated domains into separate files
- Store files in a `queries/` or `requests/` directory at repo root or in `src/`

## Security Notes

- Never commit real access tokens in `.http` files — always use `{{ $( okta-client get access-token ) }}`
- Never hardcode API keys; use command substitution or prompt the user
- Add `*.http` to `.env` exclusions but keep `.http` files in version control (they contain query structure, not secrets)
