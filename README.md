# Liotan

Liotan is a browser-based, real-time messenger built with React, Node.js,
MongoDB, and Socket.IO. The repository contains the web client, API and
WebSocket server, automated security checks, browser tests, and release
tooling.

The project is under active development. Interfaces, storage formats, and
deployment requirements may change between releases.

## What is implemented

- Account authentication, profiles, sessions, and device management
- Direct and group conversations with real-time delivery
- Replies, pinned messages, unread state, presence, and message history
- File, image, audio, and voice-message handling
- Client-side message and media encryption based on MLS through
  [`@wireapp/core-crypto`](https://github.com/wireapp/core-crypto)
- Per-device cryptographic identities, device approval and revocation, recovery,
  safety-number verification, and server-signed key-transparency checks
- Blocklist, privacy, notification, sound, language, and profile settings
- Responsive layouts for current desktop and mobile browsers

Security properties have explicit limits. Read
[`docs/security/remediation-2026-07-23/K_RESIDUAL_RISKS.md`](docs/security/remediation-2026-07-23/K_RESIDUAL_RISKS.md)
before relying on Liotan in a sensitive environment.

## Technology

| Area | Main components |
| --- | --- |
| Web client | React 19, Vite, Socket.IO Client, Core Crypto/WASM |
| Server | Node.js 22, Express 5, Socket.IO, Mongoose |
| Data | MongoDB, browser IndexedDB/OPFS, object storage for media |
| Verification | Node test runner, Playwright, static security gates, CodeQL |

Liotan is a web application. This repository does not currently contain an
Electron, Android, or iOS application.

## Requirements

- Node.js 22.x
- npm 10.x
- MongoDB accessible from the server
- Playwright browser binaries when running browser tests

Mail delivery and object storage are required only for the features that use
them. Their credentials must be supplied through local environment files or a
secret manager, never committed to the repository.

## Local setup

```bash
git clone https://github.com/LastRaven148/Liotan.git
cd Liotan
npm ci
npm ci --prefix client
npm ci --prefix server
```

Create local configuration files from the tracked templates:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

PowerShell equivalent:

```powershell
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
```

Review every copied value before starting the application. Set the server to a
development environment, provide a local MongoDB connection, and replace all
placeholders. The example files are documentation templates, not ready-to-use
production configuration.

Start the server and client in separate terminals from the repository root:

```bash
npm run server
```

```bash
npm run client
```

The client development server uses the API URL configured in `client/.env`.

## Verification

```bash
# Project test suite
npm test

# Client build and server syntax checks
npm run check

# Tests, checks, dependency-license inventory, and SBOM generation
npm run test:all
```

The complete suite includes Playwright tests for Chromium, Firefox, and WebKit.
Some integration tests require their documented local test dependencies. The
same checks should pass on the exact commit selected for release.

## Repository layout

```text
client/                React application, browser cryptography, and UI
server/                HTTP/WebSocket API, persistence, and background jobs
scripts/               Repository-wide checks and release tooling
docs/architecture/     Data lifecycle and consistency documentation
docs/security/         Security model, limitations, and test evidence
.github/workflows/     CI, analysis, review, and deployment workflows
```

## Security reports

Do not disclose suspected vulnerabilities in a public issue. Follow
[`SECURITY.md`](SECURITY.md) to submit a private report.

## License

Liotan is distributed under the GNU General Public License version 3 only
(`GPL-3.0-only`). See [`LICENSE`](LICENSE) for the complete license,
[`LEGAL.md`](LEGAL.md) for the project notice, and
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) for third-party components.
