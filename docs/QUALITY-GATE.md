# Repository Quality Gate

Run the full acceptance gate before considering a code, data, route, or presentation change complete:

```bash
npm run check
```

The command rebuilds publication artifacts, validates data and schemas, checks duplicates and routing contracts, compiles Python maintenance scripts, exercises the update pipeline, and runs browser regression coverage.

For faster iteration before browser verification, use:

```bash
npm run check:fast
```

GitHub Actions uses the same full gate. This keeps local and CI expectations aligned.
