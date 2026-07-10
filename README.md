# Traffic Guard support site

Public support, privacy, terms, and App Store information for Traffic Guard, plus the Cloudflare Pages feedback endpoint.

## Local verification

```bash
node tools/test_feedback_worker.mjs
node tools/build.mjs
```

The feedback worker supports three payload contracts:

- New app versions with `includesDiagnostics: false` omit usage diagnostics.
- New app versions with `includesDiagnostics: true` include the user-approved diagnostic fields.
- Older app versions without the flag retain their existing behavior.

## Cloudflare deployment

Apply pending D1 migrations before deploying a worker that references new columns:

```bash
npx wrangler d1 execute traffic-guard-feedback --remote \
  --file migrations/0002_feedback_diagnostics_consent.sql
node tools/build.mjs
npx wrangler pages deploy .deploy --project-name tinyneed-traffic-guard --branch main
```

The production domain is <https://traffic-guard.tinyneed.com/>.
