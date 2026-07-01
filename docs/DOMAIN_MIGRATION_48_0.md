# Liotan 48.0 Domain Migration

Production domains:

- Frontend: `https://liotan.com`
- Frontend alias: `https://www.liotan.com`
- API / Socket.IO: `https://api.liotan.com`

## Render environment

Backend service (`Liotan-api`):

```env
NODE_ENV=production
CLIENT_URL=https://liotan.com
PUBLIC_CLIENT_URL=https://liotan.com
API_URL=https://api.liotan.com
PUBLIC_API_URL=https://api.liotan.com
ALLOWED_ORIGINS=https://liotan.com,https://www.liotan.com
LEGACY_ALLOWED_ORIGINS=
AUTH_COOKIE_DOMAIN=
```

Frontend static site (`Liotan`):

```env
VITE_API_URL=https://api.liotan.com
```

`AUTH_COOKIE_DOMAIN` is intentionally empty by default. The auth cookie is host-only for `api.liotan.com`, which is safer and still works because all API and Socket.IO requests go to `api.liotan.com` with credentials.

## Cloudflare DNS

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | `@` | `liotan.onrender.com` | DNS only during migration |
| CNAME | `www` | `liotan.com` | DNS only during migration |
| CNAME | `api` | `liotan-api.onrender.com` | DNS only during migration |

Cloudflare proxy can be enabled later after Render custom domains, cookies, CORS, Socket.IO and SSL are confirmed stable.

## Verification

- `https://liotan.com` opens the React app.
- `https://www.liotan.com` redirects or opens the React app.
- `https://api.liotan.com/health` returns minimal OK.
- Login sets an httpOnly cookie from `api.liotan.com`.
- Auth session restores after reload.
- Socket.IO connects from `liotan.com` to `api.liotan.com`.
- Sending messages, uploads and profile updates still work.
