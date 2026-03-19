# Distribution

Rabbithole does not need a custom domain to support one-command installation.

## Recommended First Distribution Path

Use GitHub Releases as both the artifact host and bootstrap source.

### User Install Command

```bash
curl -fsSL https://raw.githubusercontent.com/sideDesert/rabbithole/main/scripts/install-release.sh | sh
```

The bootstrap script:

- resolves the latest GitHub release tag
- downloads `rabbithole-<tag>.tar.gz`
- extracts it to `~/.local/share/rabbithole/app`
- runs `install.sh`
- installs a `rabbithole` launcher into `~/.local/bin`

## Creating a Release Archive

Build a release archive locally:

```bash
sh ./scripts/package-release.sh v0.1.0
```

This produces:

```bash
dist/rabbithole-v0.1.0.tar.gz
```

Upload that file as a GitHub release asset for the matching tag.

## Release Naming Convention

The bootstrap script expects assets named:

```bash
rabbithole-<tag>.tar.gz
```

Examples:

- `rabbithole-v0.1.0.tar.gz`
- `rabbithole-v0.2.0.tar.gz`

## Installed Layout

```text
~/.local/share/rabbithole/app
~/.local/bin/rabbithole
```

## Current Limits

- This is still a technical-user install.
- It requires Python, Node, `uv`, and `pnpm` on the machine.
- It still depends on cloud credentials and remote services.

## Future Upgrade Path

For a non-technical end-user install, move to one of:

- bundled desktop app
- packaged backend binary plus prebuilt frontend
- Docker-based distribution
- native installers for macOS/Linux/Windows
