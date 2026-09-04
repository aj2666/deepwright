# Security

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x | Yes |
| Earlier versions | No |

## Report a vulnerability

Authorized collaborators can open a private draft advisory from the
repository's [Security Advisories](https://github.com/aj2666/deepwright/security/advisories/new)
page. If that option is unavailable, contact the repository owner through an
existing private channel. Do not open a public issue containing exploit
details, credentials, or private repository data.

## Security model

Deepwright ships instructions and local helper scripts. It does not bundle credentials or a remote service. Review a requested external action—push, pull request, merge, deployment, message, or account change—against the user's authorization before executing it.
