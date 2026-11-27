# Security Policy

## Supported versions

Only the latest release receives security fixes. The app updates itself automatically at launch.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting instead:
**Security** tab → **Report a vulnerability** on
[tristan-spinnewyn/Achievement-tracker](https://github.com/tristan-spinnewyn/Achievement-tracker/security/advisories/new).

You should get an answer within 7 days. Please include the affected version, steps to reproduce and the impact.

## Hardening in place

- Tauri webview with a strict Content-Security-Policy and all web permissions denied. The window stays on the app pages, and external links open in the browser only over HTTPS.
- The page may only call the app commands and listen to the app events (Tauri capabilities). It can load local files only from the icon cache folder.
- Command arguments and backup files (imported or auto-restored from Documents) are validated in the Rust backend: unknown settings dropped, ids constrained to positive integers, undo history and record keys checked.
- Updates are signed: the app installs only an installer signed with the project key for the announced version, and verifies it before installing.
- CI: actions pinned by SHA, least-privilege tokens, dependency review, `npm audit` and registry signature checks; releases carry SHA-256 checksums and SLSA build provenance.
