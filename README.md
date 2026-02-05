# DownloadGithubDir

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub Pages](https://img.shields.io/github/actions/workflow/status/DownloadGithubDir/DownloadGithubDir/pages.yml?label=pages)](./.github/workflows/pages.yml)

DownloadGithubDir is a fast, client-side tool that lets users download a specific folder from any GitHub repository as a ZIP file. It runs entirely in the browser (no backend), so it is safe to host on GitHub Pages and simple to operate.

## Table of contents
- [Highlights](#highlights)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Usage](#usage)
- [Deploy to GitHub Pages](#deploy-to-github-pages)
- [Configuration](#configuration)
- [Security & privacy](#security--privacy)
- [Limits](#limits)
- [Tech stack](#tech-stack)
- [Release](#release)
- [Contributing](#contributing)
- [License](#license)

## Highlights
- Download any GitHub folder by URL or by `owner/repo/path`.
- Optional branch/tag and GitHub token support (rate limits + private repos).
- Parallel file fetch, JSZip packaging, live progress, cancel support.
- Responsive UI, sample shortcuts, zero data sent to a backend.
- GitHub Pages workflow included for one-click hosting.

## How it works
1. The browser calls the GitHub REST API to list files in the selected folder.
2. Each file is fetched in parallel and assembled in memory.
3. JSZip packages everything into a ZIP and triggers a download.

## Quick start
```bash
python -m http.server 8000
# open http://localhost:8000
```

## Usage
1. Paste a GitHub folder URL or `owner/repo/path` (e.g. `octocat/Hello-World/docs`).
2. Optional: add a branch or tag.
3. Optional: add a GitHub token for higher rate limits or private repos.
4. Click **Download ZIP** and monitor progress.

## Deploy to GitHub Pages
1. Push this repo to GitHub on the `main` branch.
2. In GitHub → **Settings → Pages**, set **Source** to **GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` deploys automatically on each push.

## Configuration
- **Branch/Tag**: Override the default branch to download a specific release or tag.
- **Token**: Provide a fine-scoped Personal Access Token if you see `403` or need private access.

## Security & privacy
- Tokens are used only in browser requests and never stored or transmitted elsewhere.
- The app is static and runs entirely on the client.

## Limits
- Soft cap of 4000 files to prevent excessive memory usage.
- If you hit `403` or API limits, add a token or narrow the folder.

## Tech stack
- Vanilla JS + Fetch API
- JSZip + FileSaver
- Static HTML/CSS with no build step

## Release
- Current release: **v1.0.0** (see [CHANGELOG.md](CHANGELOG.md)).
- Versioning follows [SemVer](https://semver.org/).

## Contributing
1. Fork the repo and create a feature branch.
2. Keep changes small and focused.
3. Open a pull request with a clear description.

## License
MIT
