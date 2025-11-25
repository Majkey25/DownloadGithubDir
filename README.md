# DirFetch – GitHub directory downloader

Single-page, client-side tool to download any GitHub repository folder as a ZIP. No backend, no rate limits beyond GitHub defaults, works on GitHub Pages for free.

## Features
- Paste a GitHub URL or `owner/repo/path` and download only that folder.
- Optional branch override and personal access token to avoid rate limits.
- Clean, responsive UI; runs entirely in the browser with JSZip.
- Safe for private repos when you provide a token (token stays in-browser).

## Running locally
Serve the folder with any static server:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## Deploying to GitHub Pages
1. Commit and push this repository to GitHub.
2. Enable Actions and Pages.
3. The workflow in `.github/workflows/pages.yml` builds (no build step) and publishes `index.html` plus assets to Pages.

## Usage
1. Open the site.
2. Paste e.g. `https://github.com/torvalds/linux/tree/master/Documentation`.
3. Click **Download ZIP**. Progress and status appear at the bottom of the form.
4. Optionally set a branch or token if you hit the rate limit.

## Notes
- Large folders: capped at 4000 files to avoid API and memory limits.
- Errors like `403` usually mean GitHub rate limiting; add a token to continue.
- Everything runs in your browser; nothing is stored or sent elsewhere.

