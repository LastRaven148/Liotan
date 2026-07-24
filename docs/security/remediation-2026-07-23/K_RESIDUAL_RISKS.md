# Residual risks

## RESIDUAL PLATFORM LIMITATION

### Browser key isolation

Non-extractable WebCrypto keys prevent straightforward key export but do not
prevent same-origin malicious JavaScript from invoking cryptographic operations.
Portable web APIs do not promise TPM, Secure Enclave, Android Keystore, device
attestation, or a trusted display. A native client boundary is required for
those guarantees.

### Transparency witness

The server provides signed append-only Merkle checkpoints, inclusion and
consistency proofs, client continuity and checkpoint gossip. There is no
independently operated witness or globally available gossip channel. A server
that can isolate all of a target’s devices/peers may sustain a coordinated split
view.

### Recipient-side erasure

Delete-for-everyone now has authenticated, replay-resistant convergence and
local cleanup. It cannot force a malicious or offline recipient to erase
plaintext, screenshots, exported files, ciphertext plus old key material, or a
modified client cache.

### Third-party MLS implementation

Repository tests cover inputs, state transitions, packaging and observable
invariants around CoreCrypto/WASM. They are not a source audit or formal proof
of the dependency’s cryptographic implementation.

## BLOCKED BY PRODUCTION ACCESS

### Production posture evidence

Deployed SHA, edge rewriting, direct origin exposure, Mongo legacy counts, R2
orphan counts, backups, runtime variables, PM2, source-map exposure, CSP, CORS,
TLS and DNS require authorized read-only production execution. Safe aggregate
scripts and exact instructions are in
`G_PRODUCTION_READ_ONLY_VERIFICATION_CHECKLIST.md`.

## REQUIRES EXPLICIT PRODUCT DECISION

### Legacy deletion

Repository code prevents new legacy writes and supplies dry-run, resumable,
object-first retirement tooling. Real legacy deletion changes user retention
guarantees and is irreversible without a proven backup. The decision recorded
on 2026-07-24 is `RETAIN FOR NOW`; destructive retirement remains disabled and
requires a new explicit decision.

## Ongoing operational risks

- quota values can be mis-tuned even though bypass-resistant dimensions exist;
- proxy trust can be misconfigured if production topology differs from the
  reviewed exact-CIDR model;
- loss or rotation of the transparency signing seed needs an explicit key
  transition plan and client-visible event;
- old, permanently offline clients cannot receive revocations, deletions or
  upgrade cutoffs until they reconnect;
- future dependencies, workflows and newly added dynamic imports require the
  same audit gates.
- 33 historical high CodeQL alerts remain open on `main`; the aggregate
  `CodeQL` context is now required for new changes, but the baseline still
  requires deliberate triage without blanket dismissal.

None of these statements means the application is “fully secure.” They define
the boundary of what the code and current evidence demonstrate.
