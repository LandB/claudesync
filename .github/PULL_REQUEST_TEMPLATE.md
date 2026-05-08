## What

Brief description of the change.

## Why

The motivation — bug fix, feature, refactor.

## Testing

How you verified this works. Include platform if relevant (macOS / Linux / Windows).

## Checklist

- [ ] Tested against a real Supabase instance
- [ ] No secrets or hardcoded URLs added
- [ ] New migrations are additive-only (no edits to existing migration files)
- [ ] Edge functions that agents call have `verify_jwt = false` in `config.toml`
