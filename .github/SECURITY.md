# Security Policy

## Supported Versions

Only the latest release receives security updates.

| Version | Supported |
| ------- | --------- |
| Latest  | ✅        |
| Older   | ❌        |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please disclose privately using one of these channels:

1. **GitHub Private Advisory** (preferred) — go to the
   [Security → Advisories tab](../../security/advisories/new) and open a draft advisory.
2. **Email** — send details to [security@nuewframe.com](mailto:security@nuewframe.com).

You will receive an acknowledgement within **5 business days**. Critical vulnerabilities
will be patched and released within **30 days** of confirmation.

## Security Scope

This tool reads `.http` files, executes network requests, and optionally runs shell commands
via variable substitution. In-scope issues:

- Token or credential leakage via stdout, logs, or error messages
- Command injection via `.http` file command substitution (`{{ $( cmd ) }}`)
- Path traversal in `.http` file or config resolution
- Unintended `--allow-run` execution (e.g., commands triggered without `--allow-commands`)
- Credential file read without explicit user consent

## Out of Scope

- Vulnerabilities in Okta's own platform or APIs — report directly to Okta
- Issues in third-party dependencies — report to the respective maintainer
- Theoretical attacks with no practical exploit path
