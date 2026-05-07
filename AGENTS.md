# AGENTS

## Repository Rules

- Use Bun for package management and scripts.
- Use `bunx` for one-off commands.
- Do not use npm, npx, yarn, or pnpm in this repository.
- Keep credentials, `.env` files, Firebase native config, app store keys,
  keystores, service accounts, and provisioning profiles out of git.

## Verification

Before concluding significant code changes, run:

```bash
bun run --cwd mytopia-auferstanden-app lint
bun run --cwd mytopia-auferstanden-app tsc --noEmit
bun run --cwd mytopia-functions build
```

For website changes, also run:

```bash
bun run --cwd mytopia-website build
```

## Release Safety

Production Expo/EAS, Firebase, native app identity, and signing values must live
in ignored local env files or secret managers. Do not hardcode production
project IDs, API URLs, bundle IDs, signing paths, or service account values in
tracked source.

Run the mobile release preflight before publishing OTA updates:

```bash
bun run --cwd mytopia-auferstanden-app release:preflight
```
