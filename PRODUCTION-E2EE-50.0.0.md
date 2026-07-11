# Liotan 50.0.0 — MLS E2EE production candidate

This release replaces the custom static conversation-secret protocol for all
new writes. Legacy v3 rows remain read-only for migration.

WebRTC calls are disabled in this release. The previous insertable-stream code
was only preparatory and did not provide a reviewed MLS-authenticated call
handshake; leaving it enabled would overstate the interception guarantees.
Voice messages continue to work as ordinary MLS encrypted media.

## Ten implemented security changes

1. All new one-to-one, Saved Messages, and group conversations use MLS 1.0
   (RFC 9420) through Wire CoreCrypto. The selected ciphersuite is X25519,
   AES-128-GCM, SHA-256, and Ed25519.
2. MLS epochs provide forward secrecy and post-compromise key updates. Active
   conversations perform a self-update at least every seven days (and after
   membership/device changes). The
   delivery service rejects messages at stale/future epochs and blocks writes
   during every membership transition.
3. Each account has a random-recovery-key-derived Ed25519 root. The server sees
   only the root public key and cannot replace it after pinning.
4. Every browser installation is a distinct MLS client. Its manifest and MLS
   RFC 7638 credential thumbprint are root-signed; receivers verify manifests, pin contact
   roots, and compare the local MLS roster/credential thumbprints. Expiration
   immediately disables device authentication and blocks affected conversations
   until an MLS removal/update completes.
5. Crypto REST requests carry an Ed25519 device signature over method, exact
   path, timestamp, one-time nonce, and canonical body hash. Cookies alone are
   insufficient to publish packages, change epochs, send ciphertext, or fetch
   MLS media.
6. KeyPackages are root-signed in batches, claimed atomically once, expire, and
   are returned only inside a membership operation. MongoDB transactions are
   mandatory in production.
7. Text and control events use an inner MLS envelope bound to conversation,
   sender user/device, client message UUID, type, and reply target. The client
   checks it against outer delivery metadata and CoreCrypto's authenticated
   sender; replayed message UUIDs are rejected.
8. Media uses a random 256-bit file key, 1 MiB independently authenticated
   AES-GCM chunks, unique 96-bit nonces, and AAD bound to conversation,
   message, upload binding, chunk index, and count. Keys and private metadata
   exist only inside the MLS envelope. Uploads are ciphertext-only and their
   signed SHA-256 binding is checked before private R2 storage. Device
   authentication and signed multipart metadata are verified before the upload
   parser may create a temporary file; streaming storage writes no bytes until
   the MLS ciphertext magic is validated.
9. Group add/remove/leave and device revocation immediately block sends. A
   removal commit is completed before additions, preserving old history for
   legitimate existing members while excluding removed devices from new
   epochs.
10. Password-derived identity backup is gone. A random 256-bit recovery key is
    wrapped locally by a non-extractable WebCrypto key; separate HKDF outputs
    encrypt CoreCrypto storage and the local plaintext cache. A new browser
    must supply the recovery key and still needs an existing MLS member to add
    it to established conversations.

## Honest security boundary

This is a production candidate, not a cryptographic certification. Root-key
pinning is trust-on-first-use until users compare an out-of-band safety number.
A malicious first-contact server can substitute a root before it is pinned;
after pinning, replacement is blocked. JavaScript E2EE also cannot protect a
session after same-origin malicious JavaScript executes. Use a strict CSP,
immutable reviewed client assets, dependency pinning, and an independent
protocol/implementation audit before advertising a formally audited product.

No server can prove that bytes supplied by an actively malicious endpoint are
really ciphertext without learning the plaintext/key or adding a specialized
proof system. Liotan rejects unauthenticated, stale-client, wrong-framing,
wrong-hash, and unsigned uploads before R2; a compromised active endpoint can
still deliberately manufacture ciphertext-looking bytes. Endpoint integrity is
therefore part of the security boundary.

Deletion-for-everyone is an authenticated MLS tombstone. No protocol can force
an already-receiving device to erase a saved copy. The server retains only
ciphertext but necessarily observes delivery metadata, membership, timing, and
approximate ciphertext size.

Forward secrecy also means the server cannot reconstruct old plaintext for a
fresh device. Existing decrypted history is kept only in that device's locally
encrypted cache; clearing browser storage or losing every member device loses
access to old epochs by design. New group members receive messages only from
their Welcome epoch onward.

## Required deployment invariants

- Node.js 22 and a MongoDB replica set are mandatory.
- `LIOTAN_CRYPTO_DOMAIN` is immutable after launch; changing it changes MLS
  ClientIds and requires a planned device migration.
- Serve the emitted `.wasm` file as `application/wasm` and never rewrite it to
  HTML. Cache versioned JS/WASM immutably; do not cache `index.html`.
- Keep `R2_MEDIA_*` and `R2_AVATAR_*` credentials bucket-scoped and different.
  The private media bucket must have no `r2.dev` URL or public custom domain.
- Retain the CSP `script-src 'self' 'wasm-unsafe-eval'`; do not add third-party
  scripts, inline scripts, tag managers, or remote support widgets to the app
  origin.
- Run `npm run release:check`, then perform an independent security review and
  a two-device interoperability test before rollout.
