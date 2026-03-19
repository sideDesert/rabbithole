# Prerequisites

Rabbithole currently installs as a locally hosted app with cloud service dependencies.

## Required Local Tools

- `python3` 3.12 or newer
- `uv`
- `node` 20 or newer
- `pnpm`
- `curl`
- `tar`

## Required Credentials

- OpenRouter API key
- EverMemOS API key
- MongoDB Atlas username
- MongoDB Atlas password

These values are written to `backend/config.json` during setup.

## Runtime Model

- The frontend runs locally on port `3000`
- The backend runs locally on port `8000`
- EverMemOS, MongoDB Atlas, and OpenRouter remain remote services

## Install Modes

### Local Repo Install

```bash
sh ./install.sh
sh ./run-local.sh
```

### Release Install

```bash
curl -fsSL https://raw.githubusercontent.com/sideDesert/rabbithole/main/scripts/install-release.sh | sh
```

The release installer downloads a GitHub release archive, installs it into `~/.local/share/rabbithole/app`, and installs a launcher at `~/.local/bin/rabbithole`.
