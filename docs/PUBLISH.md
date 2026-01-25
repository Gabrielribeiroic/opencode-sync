# Publishing to npm

## Quick Command

```bash
npm version patch && git push && git push --tags
```

## Version Bump Options

| Command | Example |
|---------|---------|
| `npm version patch` | 0.1.0 → 0.1.1 |
| `npm version minor` | 0.1.0 → 0.2.0 |
| `npm version major` | 0.1.0 → 1.0.0 |

## What Happens

1. `npm version` bumps `package.json` version, commits, and creates a `v*` tag
2. `git push --tags` triggers the GitHub Actions publish workflow
3. Workflow authenticates via OIDC (no npm token needed)
4. Publishes to npm with provenance attestation

## Verify

```bash
gh run list --limit 1
npm view oc-sync version
```

## Security

- Uses OIDC trusted publishing (configured on npmjs.com)
- No long-lived NPM_TOKEN secret required
- Provenance links package to source commit
