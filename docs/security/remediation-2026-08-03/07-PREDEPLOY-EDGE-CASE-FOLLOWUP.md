# Pre-deployment edge-case follow-up

Date: 2026-08-03 (Europe/Moscow)

This follow-up records the review of the Stage 0–1 implementation after version
57.4.6. It supplements, and does not rewrite, the historical command evidence in
the preceding documents.

## Closed review items

- Downloadable MLS media now uses a positive, bounded `ciphertextBytes`, or the
  positive bounded legacy `size` when `ciphertextBytes` is absent or zero. A
  record with no trustworthy local length returns the same 404 as an unknown
  object; the configured maximum is never treated as an object's exact size.
- Every newly issued email code has a random generation. A wrong-attempt update
  is conditional on that generation, the exact stored hash and creation time,
  the expiry cutoff, and the attempt ceiling. Work started against an older
  generation cannot consume the attempt budget of a replacement code.
- Explicit email-change cancellation cleanup has a durable worker. It claims a
  bounded batch with a lease, safely repeats lock clearing and session/socket
  revocation, records a bounded exponential backoff plus failure metadata, runs
  shortly after startup, and then runs periodically. Historical cancelled
  records without `cancellationRequestedAt` remain intentionally excluded.
- A factor consumed immediately before TOTP disable carries an internal binding
  to the exact encrypted TOTP state. The disable update must match that state,
  so a stale request cannot clear a replacement TOTP configuration. The binding
  is not returned in an HTTP response.
- The low-level R2 regression now covers an overflow split across multiple
  chunks and proves that the held earlier chunk is not forwarded.

## Accepted fail-closed availability tradeoffs

### Media settlement before the held final fragment

The quota reservation is completed before the final ciphertext fragment is
written to the HTTP response. If finalization then fails because the client
disconnects or the response target closes, usage remains charged even though the
client did not receive the complete object. This ordering is deliberate: it
prevents a complete uncharged transfer and favors quota integrity over refunding
an ambiguous failed download. Operational metrics should distinguish completed
reservations from client-observed success.

### Multi-step account operations

Email-code consumption and the subsequent business mutation are not one MongoDB
transaction in every flow. A failure after one-time code consumption but before
password reset, registration, session creation, or pending-email-change
completion can require the user to request a new code. The operation fails
closed: it does not reuse the consumed capability or silently report an
uncommitted account mutation as successful.

## Exact-HEAD evidence rule

The final release gate is run only after the last tracked commit. Its ignored log
must contain, inside the file itself:

```text
HEAD_BEFORE=<full commit SHA>
STATUS_BEFORE_BEGIN
<git status --porcelain output, empty for a clean tree>
STATUS_BEFORE_END
...
EXIT_CODE=<release:check exit code>
HEAD_AFTER=<full commit SHA>
STATUS_AFTER_BEGIN
<git status --porcelain output, empty for a clean tree>
STATUS_AFTER_END
```

The wrapper exits with the same code as `npm run release:check`. A passing log is
valid only when both SHAs are identical, both status sections are empty, and the
exit code is zero.
