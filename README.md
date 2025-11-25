# DownloadGithubDir

Simple, client-side tool to download any GitHub repository folder as a ZIP. No backend, free to host
on GitHub Pages, built for clarity and speed.

## Features
- Paste a GitHub URL or `owner/repo/path` and fetch only that folder.
- Optional branch override and personal access token to avoid rate limits or access private repos.
- Parallel downloads with JSZip packaging in the browser; cancel support and live progress.
- Clean, responsive UI with sample shortcuts; no data leaves your browser.
- Ready-to-ship GitHub Actions workflow for Pages deployment.

## Quick start (local)
```bash
python -m http.server 8000
# open http://localhost:8000
```

## Usage
1. Paste a GitHub folder URL or `owner/repo/path`.
2. (Optional) Enter branch or tag, and a token if you hit rate limits or need private access.
3. Click **Download ZIP**. Watch progress; cancel anytime.

## Deploy to GitHub Pages
1. Push this repository to GitHub on the `main` branch.
2. Pages workflow `.github/workflows/pages.yml` uploads the static files and deploys via Actions.
3. Enable GitHub Pages in repository settings → Pages → Source: "GitHub Actions".

## Tokens and privacy
- Tokens are used only in your browser requests and are never stored or sent anywhere else.
- For private repos, use a token with minimal `repo` scope.

## Limits
- Soft cap of 4000 files to keep API and memory usage safe.
- If you see `403`, add a token or narrow the folder.

## Tech
- Vanilla JS + Fetch API + JSZip + FileSaver.
- Static HTML/CSS; no build step required.

## License
MIT

