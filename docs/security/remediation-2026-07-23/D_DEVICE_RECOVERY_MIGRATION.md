# Device and recovery migration

## Product decision implemented

Recovery follows option B: recovery may enroll a **new, distinct, visible
device**. It never recreates or impersonates an old device identity.

## Versioned state

| Version | Device request authentication | Recovery behavior |
|---|---|---|
| v1 | Request credential could be derived from recovery/account material. | Could reproduce a credential associated with existing device state. |
| v2 | Fresh 32-byte random device request secret, wrapped by a non-extractable WebCrypto key in IndexedDB. | Restores account recovery material, creates a new device/client identity, and emits a security event. |

The v2 wrapping AAD is
`liotan-device-auth-wrap-v2:<username>:<deviceId>`. The request-auth secret is
separate from the MLS identity and recovery wrapping record. It is not stored in
`localStorage`.

## Client migration sequence

1. Load the existing recovery and MLS identity records.
2. Detect the v1 device-auth state.
3. Generate a fresh random device request secret locally.
4. Create/load a non-extractable AES-GCM wrapping key in IndexedDB.
5. Persist the wrapped v2 secret with account/device-bound AAD.
6. Register a v2 manifest through an authenticated current session.
7. Preserve the existing MLS identity only for the in-place device migration.
8. Stop using v1 proof construction after successful v2 registration.
9. On account recovery, create a new device instead of performing step 7.

The server accepts the bounded migration path but prevents downgrade after v2
state is established. Manifests and signed requests bind username, client ID,
session ID, expiry and request body.

## Failure and replay behavior

- missing or corrupt v2 local state fails closed and requires explicit
  re-enrollment/recovery;
- expired manifests and requests are rejected;
- a proof from another session is rejected;
- a proof for another body/path/device is rejected;
- replayed enrollment/request nonces are rejected;
- v1 requests cannot overwrite established v2 device state;
- recovery creates an auditable device-security event.

## Compatibility and rollback

The migration is dual-read only for the bounded v1-to-v2 transition. New writes
are v2. Rolling application code back after devices have moved to v2 is unsafe:
old clients cannot be allowed to reinterpret v2 records or recreate recovery-
derived proofs.

Safe rollback therefore means:

1. keep v2 models/fields and server rejection rules;
2. roll back only presentation or unrelated application code;
3. do not restore v1 writes;
4. if the new client is unavailable, show a hard upgrade/re-enrollment path
   rather than plaintext or v1 fallback.

## Session rebind and v1 retirement in 57.4.0

Logout/login does not recreate or recover a device credential. The server
issues a short-lived one-time rebind challenge for an existing active v2 device;
the client signs it with the stored local-only request key and separately
root-signs the updated v2 manifest/directory. A JWT alone is insufficient.

`DEVICE_AUTH_V1_REQUESTS_DISABLED_AT` retires normal v1 requests, registration,
approval and renewal independently from the old enrollment cutoff. The only
remaining v1 operation is an atomic v1-to-v2 migration with old-key and fresh
local v2-key proofs. `auditDeviceAuthV1Inventory.js` is permanently count-only.

Before the v2 frontend is public, candidate failure may restore the verified
previous backend. After client-facing cutover, rollback requires compatible
protocol-generation metadata; otherwise deployment stops the backend
fail-closed for a forward fix.

## Evidence

- `client/src/crypto/accountKeys.jsx`
- `client/src/crypto/recoveryStore.jsx`
- `client/src/crypto/cryptoApi.jsx`
- `server/security/deviceAuthProtocol.js`
- `server/middleware/cryptoDeviceAuth.js`
- `server/models/CryptoDeviceSecurityEvent.js`
- `server/models/CryptoDeviceRebindChallenge.js`
- `server/test/unit/securityFoundations.test.js`
- `server/test/integration/cryptoV4.integration.test.js`
- `client/test/browser/mls-core.spec.js`
