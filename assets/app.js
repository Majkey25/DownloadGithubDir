import {
  API_BASE,
  DEFAULT_CONCURRENCY,
  MAX_FILES,
  MAX_TOTAL_BYTES,
  RAW_BASE,
  SAMPLES
} from './config.js?v=8';

const inputEl = document.getElementById('input');
const branchEl = document.getElementById('branch');
const tokenEl = document.getElementById('token');
const formEl = document.getElementById('download-form');
const submitEl = document.getElementById('submit');
const statusEl = document.getElementById('status');
const statusTextEl = document.getElementById('status-text');
const progressWrapEl = document.getElementById('progress-wrap');
const progressEl = document.getElementById('progress');
const samplesEl = document.getElementById('sample-links');

const PROGRESS_ANNOUNCE_INTERVAL_MS = 1000;

let abortCurrent = null;
let lastProgressAnnouncement = 0;

initSamples();
formEl.addEventListener('submit', onSubmit);
inputEl.addEventListener('input', resetInputError);

function initSamples() {
  SAMPLES.forEach(sample => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'example-link';
    button.innerHTML = `${sample.label}<svg aria-hidden="true" viewBox="0 0 20 20"><path d="M3 10h13M11 5l5 5-5 5" /></svg>`;
    button.addEventListener('click', () => {
      inputEl.value = `https://github.com/${sample.path}`;
      resetInputError();
      inputEl.focus();
    });
    samplesEl.appendChild(button);
  });
}

async function onSubmit(event) {
  event.preventDefault();
  if (abortCurrent) {
    abortCurrent();
    submitEl.disabled = true;
    setStatus('Canceling…', 0, 'active');
    return;
  }

  const token = tokenEl.value.trim();
  const input = inputEl.value.trim();
  const branchOverride = branchEl.value.trim();

  if (!input) {
    showInputError('Enter a GitHub folder URL');
    return;
  }

  let parsed;
  try {
    parsed = parseInput(input);
  } catch (error) {
    showInputError(error instanceof Error ? error.message : 'Enter a valid GitHub folder URL');
    return;
  }

  inputEl.setAttribute('aria-invalid', 'false');
  submitEl.textContent = 'Cancel';
  const controller = new AbortController();
  abortCurrent = () => controller.abort();

  try {
    await downloadFlow({ parsed, branchOverride, token, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      setStatus('Canceled', 0, 'ready');
    } else {
      setStatus(error instanceof Error ? error.message : 'Download failed', 0, 'error');
      console.error(error);
    }
  } finally {
    submitEl.textContent = 'Download ZIP';
    submitEl.disabled = false;
    abortCurrent = null;
  }
}

async function downloadFlow({ parsed, branchOverride, token, signal }) {
  const { owner, repo } = parsed;

  setStatus('Resolving revision...', 8);
  const target = await resolveTarget({ parsed, branchOverride, token, signal });

  setStatus('Listing files...', 14);
  const files = await collectFiles({
    owner,
    repo,
    directory: target.directory,
    commitSha: target.commitSha,
    treeSha: target.treeSha,
    token,
    signal
  });

  if (!files.length) {
    throw new Error('No files found in that path');
  }

  const zip = new JSZip();
  const folderLabel = target.directory || repo;
  const budget = { received: 0 };
  const poolController = new AbortController();
  const cancelPool = () => poolController.abort();
  let completed = 0;

  if (signal.aborted) {
    cancelPool();
  } else {
    signal.addEventListener('abort', cancelPool, { once: true });
  }

  setStatus(`Downloading ${files.length} files...`, 18);
  lastProgressAnnouncement = performance.now();
  try {
    await runPool(
      DEFAULT_CONCURRENCY,
      files,
      async file => {
        const data = await downloadFile(file, token, poolController.signal, budget);
        if (poolController.signal.aborted) {
          throw abortError();
        }

        const relativePath = file.path.substring(target.directory.length).replace(/^\//, '');
        zip.file(relativePath || file.name, data);
        completed += 1;
        const percent = 18 + Math.floor((completed / files.length) * 80);
        updateDownloadProgress(completed, files.length, percent);
      },
      poolController
    );
  } finally {
    signal.removeEventListener('abort', cancelPool);
  }

  if (signal.aborted) {
    throw abortError();
  }

  setStatus('Packaging ZIP...', 98);
  const blob = await zip.generateAsync({ type: 'blob' });
  if (signal.aborted) {
    throw abortError();
  }

  saveAs(blob, `${folderLabel.replace(/\W+/g, '-') || 'github-folder'}.zip`);
  setStatus('ZIP downloaded', 100, 'success');
}

function parseInput(raw) {
  const cleaned = raw.trim();
  if (/^https?:\/\//i.test(cleaned)) {
    let url;
    try {
      url = new URL(cleaned);
    } catch {
      throw new Error('Enter a valid GitHub folder URL');
    }

    if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) {
      throw new Error('Use a github.com folder URL');
    }
    return parseGithubUrlParts(decodeUrlPath(url.pathname));
  }
  return parseShorthand(cleaned);
}

function parseGithubUrlParts(parts) {
  const [owner, rawRepo, marker, ...refTail] = parts;
  const identity = parseRepoIdentity(owner, rawRepo);
  if (!marker) {
    return { ...identity, path: '', refTail: null };
  }
  if (marker === 'blob') {
    throw new Error('Use a folder URL, not a file URL');
  }
  if (marker !== 'tree') {
    throw new Error('Use a repository URL or a GitHub /tree/ folder URL');
  }
  if (!refTail.length) {
    throw new Error('The GitHub folder URL is missing a branch or tag');
  }
  return { ...identity, path: null, refTail };
}

function parseShorthand(cleaned) {
  const [owner, rawRepo, ...pathParts] = cleaned.split('/').filter(Boolean);
  const identity = parseRepoIdentity(owner, rawRepo);
  return { ...identity, path: pathParts.join('/'), refTail: null };
}

function decodeUrlPath(pathname) {
  try {
    return pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    throw new Error('The GitHub URL contains invalid encoding');
  }
}

function parseRepoIdentity(owner, rawRepo) {
  const repo = rawRepo?.replace(/\.git$/i, '');
  const validPart = value => value && !['.', '..'].includes(value) && /^[\w.-]+$/.test(value);
  if (!validPart(owner) || !validPart(repo)) {
    throw new Error('Expected owner/repo or a GitHub folder URL');
  }
  return { owner, repo };
}

async function resolveTarget({ parsed, branchOverride, token, signal }) {
  let directory = parsed.path || '';
  let commit = null;

  if (parsed.refTail) {
    const urlTarget = await resolveUrlTarget(parsed.owner, parsed.repo, parsed.refTail, token, signal);
    directory = urlTarget.directory;
    commit = urlTarget.commit;
  }

  if (branchOverride) {
    commit = await requireCommit(parsed.owner, parsed.repo, branchOverride, token, signal);
  } else if (!commit) {
    setStatus('Fetching default branch...', 10);
    const branch = await fetchDefaultBranch(parsed.owner, parsed.repo, token, signal);
    commit = await requireCommit(parsed.owner, parsed.repo, branch, token, signal);
  }

  return { directory, commitSha: commit.sha, treeSha: commit.treeSha };
}

async function resolveUrlTarget(owner, repo, refTail, token, signal) {
  const route = refTail.join('/');
  const firstSegment = route.split('/')[0];
  const [heads, tags] = await Promise.all([
    fetchMatchingRefs(owner, repo, 'heads', firstSegment, token, signal),
    fetchMatchingRefs(owner, repo, 'tags', firstSegment, token, signal)
  ]);
  const candidates = [
    ...matchingRefNames(heads, 'heads', route, 0),
    ...matchingRefNames(tags, 'tags', route, 1)
  ];
  candidates.sort((left, right) => right.name.length - left.name.length || left.priority - right.priority);

  const selected = candidates[0];
  if (selected) {
    const commit = await requireCommit(owner, repo, selected.name, token, signal);
    const directory = route.slice(selected.name.length).replace(/^\//, '');
    return { directory, commit };
  }

  const directCommit = await fetchCommit(owner, repo, refTail[0], token, signal, true);
  if (directCommit) {
    return { directory: refTail.slice(1).join('/'), commit: directCommit };
  }
  throw new Error('Branch, tag, or commit in the GitHub URL was not found');
}

async function fetchMatchingRefs(owner, repo, namespace, prefix, token, signal) {
  const encodedRef = [namespace, ...prefix.split('/')].map(encodeURIComponent).join('/');
  const data = await fetchJson(
    `${buildRepoApiUrl(owner, repo)}/git/matching-refs/${encodedRef}`,
    token,
    signal
  );
  if (!Array.isArray(data)) {
    throw new Error('GitHub returned invalid reference data');
  }
  return data;
}

function matchingRefNames(items, namespace, route, priority) {
  const prefix = `refs/${namespace}/`;
  const matches = [];
  for (const item of items) {
    if (typeof item?.ref !== 'string' || !item.ref.startsWith(prefix)) {
      continue;
    }
    const name = item.ref.slice(prefix.length);
    if (route === name || route.startsWith(`${name}/`)) {
      matches.push({ name, priority });
    }
  }
  return matches;
}

async function fetchDefaultBranch(owner, repo, token, signal) {
  const data = await fetchJson(buildRepoApiUrl(owner, repo), token, signal);
  if (typeof data?.default_branch !== 'string' || !data.default_branch) {
    throw new Error('Cannot detect default branch');
  }
  return data.default_branch;
}

async function requireCommit(owner, repo, ref, token, signal) {
  const commit = await fetchCommit(owner, repo, ref, token, signal, true);
  if (!commit) {
    throw new Error('Branch or tag not found');
  }
  return commit;
}

async function fetchCommit(owner, repo, ref, token, signal, allowNotFound) {
  const url = `${buildRepoApiUrl(owner, repo)}/commits?sha=${encodeURIComponent(ref)}&per_page=1`;
  const data = await fetchJson(url, token, signal, allowNotFound);
  if (data === null) {
    return null;
  }
  if (!Array.isArray(data) || !data.length) {
    throw new Error('GitHub returned invalid commit data');
  }

  const sha = data[0]?.sha;
  const treeSha = data[0]?.commit?.tree?.sha;
  if (!isValidSha(sha) || !isValidSha(treeSha)) {
    throw new Error('GitHub returned invalid commit data');
  }
  return { sha, treeSha };
}

async function collectFiles({ owner, repo, directory, commitSha, treeSha, token, signal }) {
  const targetTreeSha = await resolveDirectoryTreeSha(
    owner,
    repo,
    treeSha,
    directory,
    token,
    signal
  );
  const items = await fetchTree(owner, repo, targetTreeSha, true, token, signal);
  const files = [];
  let totalBytes = 0;
  for (const item of items) {
    if (item?.type === 'commit') {
      throw new Error('Folder contains a Git submodule and cannot be packaged completely');
    }
    if (item?.type === 'tree') {
      if (typeof item.path !== 'string' || !item.path || !isValidSha(item.sha)) {
        throw new Error('GitHub returned invalid tree data');
      }
      continue;
    }
    if (
      item?.type !== 'blob'
      || typeof item.path !== 'string'
      || !item.path
      || !isValidSha(item.sha)
      || !Number.isSafeInteger(item.size)
      || item.size < 0
    ) {
      throw new Error(`GitHub returned invalid file data for ${item?.path ?? 'unknown entry'}`);
    }
    if (files.length >= MAX_FILES) {
      throw new Error(`Folder exceeds the ${MAX_FILES}-file limit`);
    }
    if (item.size > MAX_TOTAL_BYTES - totalBytes) {
      throw new Error(`Folder exceeds the ${MAX_TOTAL_BYTES / (1024 * 1024)} MiB limit`);
    }

    totalBytes += item.size;
    const fullPath = directory ? `${directory}/${item.path}` : item.path;
    const pathParts = fullPath.split('/');
    files.push({
      path: fullPath,
      name: pathParts[pathParts.length - 1],
      size: item.size,
      apiUrl: buildBlobApiUrl(owner, repo, item.sha),
      downloadUrl: buildRawUrl(owner, repo, commitSha, fullPath)
    });
  }
  return files;
}

async function resolveDirectoryTreeSha(owner, repo, rootTreeSha, directory, token, signal) {
  let currentSha = rootTreeSha;
  for (const segment of directory.split('/').filter(Boolean)) {
    const items = await fetchTree(owner, repo, currentSha, false, token, signal);
    const entry = items.find(item => item?.path === segment);
    if (entry?.type === 'blob') {
      throw new Error('Use a folder URL, not a file URL');
    }
    if (entry?.type === 'commit') {
      throw new Error('Git submodules cannot be downloaded as folders');
    }
    if (entry?.type !== 'tree') {
      throw new Error('Repository or folder not found');
    }
    if (!isValidSha(entry.sha)) {
      throw new Error('GitHub returned invalid tree data');
    }
    currentSha = entry.sha;
  }
  return currentSha;
}

async function fetchTree(owner, repo, treeSha, recursive, token, signal) {
  const query = recursive ? '?recursive=1' : '';
  const data = await fetchJson(
    `${buildRepoApiUrl(owner, repo)}/git/trees/${encodeURIComponent(treeSha)}${query}`,
    token,
    signal
  );
  if (!Array.isArray(data?.tree) || typeof data.truncated !== 'boolean') {
    throw new Error('GitHub returned invalid tree data');
  }
  if (data.truncated) {
    throw new Error('Repository tree is too large for a complete ZIP');
  }
  return data.tree;
}

async function downloadFile(file, token, signal, budget) {
  const url = token ? file.apiUrl : file.downloadUrl;
  const headers = token
    ? { Accept: 'application/vnd.github.raw+json', Authorization: `Bearer ${token}` }
    : {};
  const response = await fetch(url, { headers, signal });
  if (!response.ok) {
    if ([401, 403, 429].includes(response.status)) {
      throw githubError(response.status, `Failed to fetch ${file.path}`);
    }
    throw new Error(`Failed to fetch ${file.path} (${response.status})`);
  }
  return await readLimitedResponse(response, file, budget, signal);
}

async function readLimitedResponse(response, file, budget, signal) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('This browser cannot enforce the download size limit');
  }

  const chunks = [];
  let fileBytes = 0;
  try {
    while (true) {
      if (signal.aborted) {
        throw abortError();
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value.byteLength > file.size - fileBytes) {
        throw new Error(`Downloaded data exceeded the declared size for ${file.path}`);
      }
      if (value.byteLength > MAX_TOTAL_BYTES - budget.received) {
        throw new Error('Downloaded data exceeded the total size limit');
      }
      fileBytes += value.byteLength;
      budget.received += value.byteLength;
      chunks.push(value);
    }
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // Keep the original download error.
    }
    throw error;
  }

  if (signal.aborted) {
    throw abortError();
  }
  if (fileBytes !== file.size) {
    throw new Error(`Downloaded size did not match ${file.path}`);
  }
  return new Blob(chunks);
}

async function fetchJson(url, token, signal, allowNotFound = false) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, { headers, signal });
  if (allowNotFound && response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw githubError(response.status, `GitHub responded with ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error('GitHub returned invalid JSON');
  }
}

function githubError(status, fallback) {
  if (status === 401) {
    return new Error('GitHub rejected the token');
  }
  if (status === 403 || status === 429) {
    return new Error('GitHub denied the request. Check token permissions or rate limit.');
  }
  if (status === 404) {
    return new Error('Repository or folder not found');
  }
  return new Error(fallback);
}

function buildRepoApiUrl(owner, repo) {
  return `${API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function buildBlobApiUrl(owner, repo, sha) {
  return `${buildRepoApiUrl(owner, repo)}/git/blobs/${encodeURIComponent(sha)}`;
}

function isValidSha(value) {
  return typeof value === 'string' && /^[a-f0-9]{40,64}$/i.test(value);
}

function buildRawUrl(owner, repo, commitSha, path) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${RAW_BASE}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${commitSha}/${encodedPath}`;
}

async function runPool(limit, items, worker, controller) {
  let cursor = 0;
  let firstError = null;
  const run = async () => {
    while (!controller.signal.aborted) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      try {
        await worker(items[index]);
      } catch (error) {
        if (!firstError) {
          firstError = error;
          controller.abort();
        }
        return;
      }
    }
  };

  const runners = Array.from({ length: Math.min(limit, items.length) }, run);
  await Promise.allSettled(runners);
  if (firstError) {
    throw firstError;
  }
  if (controller.signal.aborted) {
    throw abortError();
  }
}

function abortError() {
  return new DOMException('Canceled', 'AbortError');
}

function showInputError(message) {
  inputEl.setAttribute('aria-invalid', 'true');
  setStatus(message, 0, 'error');
  inputEl.focus();
}

function resetInputError() {
  inputEl.setAttribute('aria-invalid', 'false');
  if (statusEl.dataset.state === 'error') {
    setStatus('Ready to download', 0, 'ready');
  }
}

function updateDownloadProgress(completed, total, percent) {
  setProgress(percent);
  statusEl.dataset.state = 'active';
  const now = performance.now();
  if (completed === total || now - lastProgressAnnouncement >= PROGRESS_ANNOUNCE_INTERVAL_MS) {
    statusTextEl.textContent = `Downloading ${completed}/${total}`;
    lastProgressAnnouncement = now;
  }
}

function setStatus(message, percent, state = 'active') {
  statusTextEl.textContent = message;
  statusEl.dataset.state = state;
  if (typeof percent === 'number') {
    setProgress(percent);
  }
}

function setProgress(percent) {
  const safe = Math.min(100, Math.max(0, percent));
  progressEl.style.width = `${safe}%`;
  progressWrapEl.setAttribute('aria-valuenow', String(safe));
}

