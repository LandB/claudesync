# Security Policy

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email: stancevicbranko@gmail.com

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

You'll receive a response within 72 hours. If confirmed, a fix will be prioritised and you'll be credited in the release notes (unless you prefer otherwise).

## Scope

| Area | In scope |
|---|---|
| Authentication bypass (agent token, Supabase JWT) | Yes |
| RLS policy bypass (accessing another user's files) | Yes |
| Storage bucket access control | Yes |
| XSS in dashboard | Yes |
| Hardcoded credentials in source | Yes |
| Edge function injection | Yes |

## Out of scope

- Vulnerabilities in Supabase infrastructure itself — report those to Supabase
- Self-hosted deployments with misconfigured environment variables
- Social engineering

## Security model

- Each user has a UUID bearer token stored in `profiles.token`. Agent requests authenticate with this token; edge functions validate it against the database (not Supabase JWT).
- Dashboard uses Supabase Auth (JWT). Dashboard-facing edge functions use `verify_jwt = true`.
- All database tables have Row Level Security — users can only read and write their own rows.
- Files are stored in a private Supabase Storage bucket (`claude-env`), scoped per user ID.
- The agent never runs code from the server — it only reads and writes files to `~/.claude`.
