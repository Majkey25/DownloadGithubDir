import {
  APP_NAME,
  TAGLINE,
  API_BASE,
  DEFAULT_CONCURRENCY,
  MAX_FILES,
  LOGO_SRC,
  FOOTER_TEXT,
  FOOTER_LINK,
  SAMPLES
} from './config.js';

const inputEl = document.getElementById('input');
const branchEl = document.getElementById('branch');
const tokenEl = document.getElementById('token');
const formEl = document.getElementById('download-form');
const submitEl = document.getElementById('submit');
const statusTextEl = document.getElementById('status-text');
const progressEl = document.getElementById('progress');
const samplesEl = document.getElementById('sample-links');
const brandLogoEl = document.getElementById('brand-logo');
const brandTextEl = document.getElementById('brand-text');
const heroTitleEl = document.getElementById('hero-title');
const heroTaglineEl = document.getElementById('hero-tagline');
const eyebrowEl = document.getElementById('eyebrow');
const faviconEl = document.getElementById('favicon');
const footerLinkEl = document.getElementById('footer-link');
const footerTextEl = document.getElementById('footer-text');

let abortCurrent = null;

setBranding();
initSamples();
window.addEventListener('DOMContentLoaded', () => document.body.classList.add('ready'));
formEl.addEventListener('submit', onSubmit);

function setBranding() {
  brandTextEl.textContent = APP_NAME;
  brandLogoEl.src = LOGO_SRC;
  brandLogoEl.alt = `${APP_NAME} logo`;
  if (faviconEl) {
    faviconEl.href = `${LOGO_SRC}?v=3`;
  }
  document.title = APP_NAME;
  heroTitleEl.textContent = 'Download any GitHub folder';
  heroTaglineEl.textContent = TAGLINE;
  eyebrowEl.textContent = `${APP_NAME} - Client-side`;
  footerLinkEl.href = FOOTER_LINK;
  footerTextEl.textContent = FOOTER_TEXT;
}

function initSamples() {
  SAMPLES.forEach(sample => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = sample;
    chip.addEventListener('click', () => {
      inputEl.value = `https://github.com/${sample}`;
    });
    samplesEl.appendChild(chip);
  });
}

async function onSubmit(event) {
  event.preventDefault();
  if (abortCurrent) {
    abortCurrent();
    abortCurrent = null;
    setStatus('Canceled', 0);
    return;
  }

  const token = tokenEl.value.trim();
  const input = inputEl.value.trim();
  const branchOverride = branchEl.value.trim();

  if (!input) {
    setStatus('Enter a GitHub URL or path', 0);
    return;
  }

  submitEl.textContent = 'Cancel';
  submitEl.disabled = false;
  const controller = new AbortController();
  abortCurrent = () => controller.abort();

  try {
    await downloadFlow({ input, branchOverride, token, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      setStatus('Canceled', 0);
    } else {
      setStatus(error.message || 'Download failed', 0);
      console.error(error);
    }
  } finally {
    submitEl.textContent = 'Download ZIP';
    abortCurrent = null;
  }
}

async function downloadFlow({ input, branchOverride, token, signal }) {
  const parsed = parseInput(input);
  const owner = parsed.owner;
  const repo = parsed.repo;
  const directory = parsed.path || '';

  let branch = branchOverride || parsed.branch;
  if (!branch) {
    setStatus('Fetching default branch...', 10);
    branch = await fetchDefaultBranch(owner, repo, token, signal);
  }

  setStatus('Listing files...', 14);
  const files = [];
  await collectFiles({ owner, repo, branch, directory, token, files, signal });

  if (!files.length) {
    throw new Error('No files found in that path');
  }

  if (files.length > MAX_FILES) {
    throw new Error(`Too many files (${files.length}). Narrow the folder.`);
  }

  const zip = new JSZip();
  const folderLabel = directory || repo;
  const poolSize = DEFAULT_CONCURRENCY;
  let completed = 0;

  setStatus(`Downloading ${files.length} files...`, 18);
  await runPool(poolSize, files, async file => {
    const data = await downloadFile(file, token, signal);
    const relativePath = file.path.substring(directory.length).replace(/^\//, '');
    zip.file(relativePath || file.name, data);
    completed += 1;
    const percent = 18 + Math.floor((completed / files.length) * 80);
    setStatus(`Downloading ${completed}/${files.length}`, percent);
  });

  setStatus('Packaging ZIP...', 98);
  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${folderLabel.replace(/\W+/g, '-') || 'github-folder'}.zip`);
  setStatus('Ready', 100);
}

function parseInput(raw) {
  const cleaned = raw.trim();
  try {
    const url = new URL(cleaned);
    if (!url.hostname.includes('github.com')) {
      throw new Error('Provide a github.com URL or owner/repo');
    }
    const parts = url.pathname.replace(/^\//, '').split('/');
    return parseParts(parts);
  } catch (error) {
    const parts = cleaned.replace(/^\//, '').split('/');
    return parseParts(parts);
  }
}

function parseParts(parts) {
  if (parts.length < 2) {
    throw new Error('Expected owner/repo');
  }
  const [owner, repo, marker, branch, ...rest] = parts;
  if (marker === 'tree' || marker === 'blob') {
    return { owner, repo, branch, path: rest.join('/') };
  }
  return { owner, repo, branch: null, path: parts.slice(2).join('/') };
}

async function fetchDefaultBranch(owner, repo, token, signal) {
  const url = `${API_BASE}/repos/${owner}/${repo}`;
  const data = await fetchJson(url, token, signal);
  if (!data.default_branch) {
    throw new Error('Cannot detect default branch');
  }
  return data.default_branch;
}

async function collectFiles({ owner, repo, branch, directory, token, files, signal }) {
  const queue = [directory];
  while (queue.length) {
    const current = queue.shift();
    const url = buildContentsUrl(owner, repo, current, branch);
    const items = await fetchJson(url, token, signal);
    if (!Array.isArray(items)) {
      throw new Error('Unexpected response while listing files');
    }

    for (const item of items) {
      if (item.type === 'file') {
        files.push({
          path: item.path,
          name: item.name,
          download_url: item.download_url,
          size: item.size
        });
        setStatus(`Found ${files.length} files...`, clamp(15 + files.length / 50, 15, 45));
      } else if (item.type === 'dir') {
        queue.push(item.path);
      }

      if (files.length > MAX_FILES) {
        throw new Error('Folder is too large. Limit is 4000 files.');
      }
    }
  }
}

async function downloadFile(file, token, signal) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(file.download_url, { headers, signal });
  if (!response.ok) {
    const message = response.status === 403
      ? 'Rate limited. Add a token.'
      : `Failed to fetch ${file.path}`;
    throw new Error(message);
  }
  return await response.arrayBuffer();
}

async function fetchJson(url, token, signal) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, { headers, signal });
  if (!response.ok) {
    const message = response.status === 403
      ? 'Hit the GitHub rate limit. Add a token.'
      : `GitHub responded with ${response.status}`;
    throw new Error(message);
  }
  return await response.json();
}

function buildContentsUrl(owner, repo, path, branch) {
  const encodedPath = path ? path.split('/').map(encodeURIComponent).join('/') : '';
  const encodedBranch = encodeURIComponent(branch);
  return `${API_BASE}/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodedBranch}`;
}

async function runPool(limit, items, worker) {
  let cursor = 0;
  const runners = Array.from({ length: limit }).map(async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

function setStatus(message, percent) {
  statusTextEl.textContent = message;
  if (typeof percent === 'number') {
    const safe = Math.min(100, Math.max(0, percent));
    progressEl.style.width = `${safe}%`;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

