# Third-party notices

Liotan 50.1.0 is distributed under `GPL-3.0-only`; the complete license is in
`LICENSE`. This choice is required in particular by the GNU GPL v3 licensing of
the MLS implementation supplied by `@wireapp/core-crypto` 10.0.0.

The authoritative dependency versions are pinned by the root, `client`, and
`server` `package-lock.json` files. A machine-readable license inventory is
generated at `artifacts/licenses/license-inventory.json`. CycloneDX 1.6 SBOMs
for all three dependency trees are generated under `artifacts/sbom/`.

Copyright and trademark rights in third-party components remain with their
respective owners. Source recipients can recreate the inventories with
`npm run supply-chain` after installing all three locked dependency trees.
