# Security Policy

## Supported versions

Only the latest release receives security fixes. The app updates itself automatically at launch.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting instead:
**Security** tab → **Report a vulnerability** on
[tristan-spinnewyn/Achievement-tracker](https://github.com/tristan-spinnewyn/Achievement-tracker/security/advisories/new).

You should get an answer within 7 days. Please include the affected version, steps to reproduce and the impact.

## Hardening in place

- Renderer sandboxed (`sandbox`, `contextIsolation`, no `nodeIntegration`), strict Content-Security-Policy, all web permissions denied.
- IPC calls accepted only from the application page; external links opened only over HTTPS.
- IPC arguments and backup files (imported or auto-restored from Documents) are validated in the main process: unknown settings dropped, ids constrained to positive integers, undo history and record keys checked, so no input can reach `Object.prototype`.
- Electron fuses: `runAsNode`, `NODE_OPTIONS` and `--inspect` disabled, ASAR integrity validation enforced.
- CI: actions pinned by SHA, least-privilege tokens, dependency review, `npm audit` and registry signature checks; releases carry SHA-256 checksums and SLSA build provenance.
