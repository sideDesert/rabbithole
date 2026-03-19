# Static Site Bundle

Deploy the contents of this folder as a static site for `rabbitholeai.xyz`.

Public files:

- `index.html`
- `install.sh`
- `_headers`
- `screenshots/*`

Recommended install command:

```bash
curl -fsSL https://rabbitholeai.xyz/install.sh | sh
```

The hosted `install.sh` delegates to the GitHub-hosted release installer in:

- `scripts/install-release.sh`

## Vercel

Use the `site/` directory as the project root.

Settings:

- Framework preset: `Other`
- Root directory: `site`
- Build command: leave empty
- Output directory: leave empty

`vercel.json` already sets the `Content-Type` header for `install.sh`.

## Cloudflare Pages

Use the `site/` directory as the publish directory.

Settings:

- Framework preset: `None`
- Build command: leave empty
- Build output directory: `site`

Cloudflare Pages will honor the `_headers` file in this directory.

## Before Publishing

1. Create a GitHub release asset named `rabbithole-<tag>.tar.gz`
2. Confirm `https://raw.githubusercontent.com/sideDesert/rabbithole/main/scripts/install-release.sh` is reachable
3. Confirm `install.sh` is served over HTTPS from your domain
4. Add `rabbitholeai.xyz` as the custom domain on Vercel or Cloudflare Pages
