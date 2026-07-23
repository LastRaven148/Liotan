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

### GitHub CodeQL enforcement

Concrete code sinks were fixed, local workflow/static gates pass, and both the
analysis and aggregate alert checks are green on the remediation head. Read-only
GitHub inspection found 33 historical high alerts on `main`; strict branch
protection requires the `analyze` workflow check but not the aggregate `CodeQL`
alert gate. No alert was changed or silently dismissed. Requiring the accepted
aggregate code-scanning result and triaging the historical baseline are
repository-owner operations.

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
guarantees and is irreversible without a proven backup. The owner must choose
retention or deletion.

### External vulnerability reporting

GitHub Private Vulnerability Reporting is disabled. The owner must enable it or
publish/operate another channel. Until then the policy does not falsely promise
external private intake.

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

None of these statements means the application is “fully secure.” They define
the boundary of what the code and current evidence demonstrate.
