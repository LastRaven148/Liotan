# Production read-only verification checklist

This checklist is prepared but was not executed against production. Every
command below is read-only. Production use requires the literal
`--production-read-only` flag; omission must fail or print only a safe plan.
Store outputs in an access-controlled evidence location and do not paste
environment values, Mongo URIs, IP addresses, object keys, usernames or raw
records into the PR.

## Inputs to record before starting

- reviewed 40-character release SHA;
- approved public API URL and DNS hostname;
- absolute active release root;
- absolute backup directory, if backup evidence is in scope;
- PM2 process name;
- optional direct-origin probe URL held privately by the operator.

The operator should use a MongoDB account with read-only database permissions
and R2 credentials that can list/head but cannot put or delete.

## 1. Safe plan

From `server/`:

```powershell
npm run audit:production-read-only
```

Expected: JSON with `mode: "dry-run"`, `mutatesProduction: false`, no network or
production access, and the exact flag required for execution.

## 2. Deployed SHA, PM2, Nginx, backups, edge, CSP/CORS/TLS/DNS

Run on the authorized host, substituting reviewed values:

```powershell
npm run audit:production-read-only -- `
  --production-read-only `
  --expected-sha=<40-char-reviewed-sha> `
  --release-root=<absolute-active-release-root> `
  --backup-root=<absolute-backup-root> `
  --pm2-process=<approved-process-name> `
  --inspect-nginx `
  --public-url=https://api.liotan.com/health `
  --domain=api.liotan.com
```

Optional direct-origin reachability check:

```powershell
npm run audit:production-read-only -- `
  --production-read-only `
  --expected-sha=<40-char-reviewed-sha> `
  --public-url=https://api.liotan.com/health `
  --domain=api.liotan.com `
  --origin-url=<operator-private-origin-url>
```

Expected evidence:

- deployment and client manifests both match the reviewed SHA and version;
- the client transparency public key is pinned;
- production build contains zero `.map` files;
- required secret names are present and pairwise distinct, without values being
  printed;
- legacy shared R2 variables are absent and media/avatar buckets differ;
- PM2 process is found, online and reports the reviewed revision;
- Nginx forwards validated host, real IP, scheme and WebSocket upgrade headers;
- backup output contains aggregate count/bytes/oldest/newest timestamps only;
- Cloudflare, CSP, HSTS and minimized server-header observations are recorded;
- an invalid origin is not wildcard-allowed;
- DNS output contains record counts, not addresses;
- TLS is authorized with the observed protocol/cipher/expiry;
- direct origin is unreachable or returns the configured rejection status.

Any mismatch blocks deployment acceptance. The script never edits Nginx, PM2,
backups, DNS, Cloudflare or the active release.

## 3. Mongo aggregate inventory

From `server/`, with a read-only Mongo credential:

```powershell
$env:NODE_ENV = "production"
npm run audit:data-inventory -- --production-read-only
```

Expected: `outputMode: "aggregate-counts-only"` and counts for accounts,
sessions, legacy data, MLS state, uploads, deletion workflows, storage lifecycle
and transparency. No raw identifiers are emitted.

Use the legacy counts only to make the binary decision documented in
`F_LEGACY_RETIREMENT_PLAN.md`. Do not run retirement apply as part of
verification.

## 4. R2 orphan aggregates

With read-only Mongo and list-only R2 credentials:

```powershell
$env:NODE_ENV = "production"
npm run audit:r2-orphans -- --production-read-only
```

Expected: aggregate `scanned`, `referencedInDatabase`, `detached`, and
`truncatedByLimit` values for private media and public avatars;
`containsRawObjectKeys: false`; no delete capability is imported.

If `truncatedByLimit` is true, increase `LIOTAN_R2_AUDIT_MAX_OBJECTS` within the
documented cap and rerun. Do not use legacy cleanup scripts as evidence because
some of them can print object-key samples.

## 5. Quota and avatar reconciliation dry runs

```powershell
$env:NODE_ENV = "production"
npm run reconcile:media-quota -- --production-read-only
npm run reconcile:avatars -- --production-read-only
```

Expected: dry-run aggregates only. Do not add `--apply` or `--yes` during
verification.

## 6. GitHub platform checks

In the Draft PR:

- CodeQL branch scan completes for the remediation SHA;
- Dependency Review completes;
- required checks are attached to the protected target through a ruleset;
- CodeQL merge protection is configured for the owner’s accepted severity;
- no open alert is dismissed merely to make the check green;
- artifact attestation identifies the exact reviewed SHA.

These settings/results are `BLOCKED BY PRODUCTION ACCESS` from the local
workspace and must be verified by the repository owner.

## 7. External private reporting decision

GitHub Private Vulnerability Reporting is currently disabled. The owner must
either:

- enable **Settings → Security → Private vulnerability reporting**; or
- publish and operate another private channel.

Until then, `SECURITY.md` truthfully documents only the private draft-advisory
channel available to maintainers.

## Sign-off record

Record only:

- verification timestamp and operator;
- reviewed SHA;
- pass/fail per numbered section;
- aggregate counts and boolean mismatches;
- ticket/reference for either explicit product decision.

Do not record secrets, URLs containing credentials, origin addresses, raw
object keys or user-level database output.
