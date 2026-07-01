# Liotan 47.8 Release Checklist

Before sending a ZIP or deploying a release:

1. Run `npm run check`.
2. Run `npm audit --omit=dev` in root, `client`, and `server`.
3. Run `npm run audit:privacy`.
4. Run `npm run make-release` and send only the archive from `release/`.
5. Never send `.env`, `.git`, `node_modules`, `build`, `dist`, or README files in release ZIPs.
6. Confirm Render environment variables are stored only in Render.
7. Confirm MongoDB credentials are not present in any shared artifact.
8. Confirm Cloudinary stores only encrypted media blobs after E2EE media is enabled.

This checklist is developer-only and should not be shipped to users.
