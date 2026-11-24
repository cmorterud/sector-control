// Trusted Pages publisher. PR artifacts are static data: never import, execute,
// install dependencies from, or check out a PR in the privileged workflow.
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile, readdir, lstat, rm, appendFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

export const stateBranch = 'pages-content';
const contextFile = 'playtest-artifacts/pages-context.json';
const siteDir = 'playtest-artifacts/pages-site';
const incomingDir = 'playtest-artifacts/pages-incoming';
const shaPattern = /^[a-f0-9]{40}$/;
const marker = '<!-- sector-control-pr-preview -->';
const maxSiteBytes = 512 * 1024 * 1024;
const maxFileBytes = 50 * 1024 * 1024;

export function basePath(repository, pr = 0) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw Error('Invalid repository');
  if (!Number.isSafeInteger(pr) || pr < 0) throw Error('Invalid PR number');
  return `/${repository.split('/')[1]}/${pr ? `pr-preview/pr-${pr}/` : ''}`;
}

export function safePath(path) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(path) || path.split('/').some(p => !p || p.startsWith('.'))) {
    throw Error(`Unsafe static path: ${path}`);
  }
  if (!/\.(html|js|css|json|wasm|svg|png|jpe?g|webp|avif|gif|glb|wav|ogg|mp3|woff2?|txt|md|webmanifest)$/i.test(path)) {
    throw Error(`Unsupported static file: ${path}`);
  }
  return path;
}

export function gitHash(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export async function staticFiles(root) {
  const files = new Map();
  let total = 0;
  async function walk(dir, prefix = '') {
    for (const name of await readdir(dir)) {
      const path = prefix + name, full = join(dir, name), stat = await lstat(full);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw Error(`Not a regular static file: ${path}`);
      if (stat.isDirectory()) {
        // Validate directories too, even empty hidden/traversal directories.
        safePath(path + '/placeholder.txt');
        await walk(full, path + '/');
      } else {
        safePath(path);
        if (stat.nlink !== 1 || stat.size > maxFileBytes) throw Error(`Linked or oversized static file: ${path}`);
        total += stat.size;
        if (total > maxSiteBytes || files.size >= 10000) throw Error('Pages site exceeds publication budget');
        const bytes = await readFile(full);
        files.set(path, {bytes, sha: gitHash(bytes)});
      }
    }
  }
  await walk(root);
  return files;
}

export function validateBuild(manifest, context) {
  if (!manifest || manifest.version !== 1 || manifest.repository !== context.repository ||
      manifest.head !== context.head || !shaPattern.test(manifest.source) ||
      manifest.pr !== context.pr || manifest.run !== context.run || manifest.attempt !== context.attempt ||
      !Number.isSafeInteger(manifest.run) || manifest.run < 1 || !Number.isSafeInteger(manifest.attempt) || manifest.attempt < 1 ||
      manifest.base !== basePath(context.repository, context.pr)) throw Error('Artifact revision/provenance mismatch');
  if (!manifest.files || !Object.keys(manifest.files).length) throw Error('Missing asset manifest');
  for (const [path, hash] of Object.entries(manifest.files)) {
    safePath(path);
    if (path === 'revision.json' || path.startsWith('pr-preview/') || !/^[a-f0-9]{64}$/.test(hash)) throw Error('Invalid asset manifest');
  }
}

export function isCurrentPR(pr, repository, head) {
  return pr.state === 'open' && pr.base?.ref === 'main' && pr.base?.repo?.full_name === repository &&
    pr.head?.repo?.full_name === repository && pr.head.sha === head;
}

// Production owns the root; a PR owns exactly one numbered subtree.
// Pages caches each page for up to ten minutes, so a visitor can be served the
// replaced build's HTML after a deployment. `previousAssets` lists the files of
// the build being replaced (from its revision.json): its hashed bundle files
// stay for one more deployment so that page still loads. A build's manifest
// never lists files retained from the build before it, so they drop next time.
export function replaceBuild(existing, incoming, pr, previousAssets = []) {
  if (!Number.isSafeInteger(pr) || pr < 0) throw Error('Invalid PR number');
  const prefix = pr ? `pr-preview/pr-${pr}/` : '';
  const next = new Map([...existing].filter(([path]) => pr ? !path.startsWith(prefix) : path.startsWith('pr-preview/')));
  for (const path of previousAssets) {
    if (typeof path !== 'string' || !/^assets\/[A-Za-z0-9._-]+$/.test(path)) continue;
    const file = existing.get(prefix + path);
    if (file) next.set(prefix + safePath(path), file);
  }
  for (const [path, file] of incoming) {
    safePath(path);
    if (path.startsWith('pr-preview/')) throw Error('A build cannot contain nested previews');
    next.set(prefix + path, file);
  }
  if (!next.has('index.html')) throw Error('Publish production from main before creating previews');
  return next;
}

function repositoryName() {
  const repository = process.env.GITHUB_REPOSITORY;
  basePath(repository);
  return repository;
}

async function api(path, {method = 'GET', body, missing = false} = {}) {
  if (!process.env.GH_TOKEN) throw Error('Missing publication token');
  const response = await fetch(`https://api.github.com/repos/${repositoryName()}/${path}`, {
    method, headers: {Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28'},
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000),
  });
  if (missing && response.status === 404) return null;
  if (!response.ok) throw Error(`GitHub ${method} ${path}: ${response.status} ${(await response.text()).slice(0, 600)}`);
  return response.status === 204 ? null : response.json();
}

async function eventData() {
  return JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
}

export async function stamp(root = 'dist', env = process.env, event = null) {
  event ??= JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
  const pr = env.GITHUB_EVENT_NAME === 'pull_request' ? event.number : 0;
  const base = basePath(env.GITHUB_REPOSITORY, pr);
  const head = pr ? event.pull_request.head.sha : env.GITHUB_SHA;
  if (!shaPattern.test(head) || !shaPattern.test(env.GITHUB_SHA) || env.PAGES_BASE_PATH !== base) throw Error('Invalid build context');
  const files = await staticFiles(root);
  files.delete('revision.json');
  const manifest = {version: 1, repository: env.GITHUB_REPOSITORY, source: env.GITHUB_SHA, head, pr,
    run: Number(env.GITHUB_RUN_ID), attempt: Number(env.GITHUB_RUN_ATTEMPT), base,
    files: Object.fromEntries([...files].map(([path, file]) => [path, digest(file.bytes)]))};
  await writeFile(join(root, 'revision.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

function siteURL(repository, pr) {
  const root = new URL(process.env.PAGES_SITE_URL || `https://${repository.split('/')[0]}.github.io${basePath(repository)}`);
  if (root.protocol !== 'https:' || root.username || root.password || root.search || root.hash || !root.pathname.endsWith('/')) throw Error('Invalid Pages site URL');
  return new URL(pr ? `pr-preview/pr-${pr}/` : '', root).href;
}

async function status(head, state, description) {
  if (!shaPattern.test(head)) throw Error('Invalid status revision');
  await api(`statuses/${head}`, {method: 'POST', body: {state, context: 'preview-ready', description: description.slice(0, 140),
    target_url: `https://github.com/${repositoryName()}/actions/runs/${process.env.GITHUB_RUN_ID}`}});
}

export async function resolveContext() {
  const event = await eventData(), repository = repositoryName();
  const context = {repository, pr: 0, head: '', run: 0, attempt: 0, publish: false, cleanup: false, reason: '', url: siteURL(repository, 0)};
  const runId = event.workflow_run?.id ?? event.inputs?.run_id;
  if (runId) {
    if (!/^\d+$/.test(String(runId))) throw Error('Invalid CI run ID');
    const run = await api(`actions/runs/${runId}`);
    if (run.path !== '.github/workflows/ci.yml' || run.head_repository?.full_name !== repository) {
      context.reason = 'Only this repository’s CI artifacts can be published';
    } else if (run.event === 'pull_request') {
      let candidates = run.pull_requests ?? [];
      if (!candidates.length) candidates = await api(`commits/${run.head_sha}/pulls`);
      for (const candidate of candidates) {
        const pr = await api(`pulls/${candidate.number}`);
        if (isCurrentPR(pr, repository, run.head_sha)) {
          if (context.pr) throw Error('Ambiguous PR for CI run');
          context.pr = pr.number; context.head = pr.head.sha;
        }
      }
      if (!context.pr) context.reason = 'PR is closed, from a fork, or has a newer revision';
    } else if (['push', 'workflow_dispatch'].includes(run.event) && run.head_branch === 'main') {
      const ref = await api('git/ref/heads/main');
      if (ref.object.sha === run.head_sha) context.head = run.head_sha;
      else context.reason = 'A newer main revision supersedes this build';
    } else context.reason = 'Only main and same-repository PR builds are published';
    if (context.head) {
      context.run = run.id; context.attempt = run.run_attempt;
      context.publish = run.conclusion === 'success';
      context.reason = context.publish ? '' : 'Build, tests and all rendered checks must pass';
      context.url = siteURL(repository, context.pr);
      if (context.pr && context.publish) await status(context.head, 'pending', 'Publishing and playtesting the PR preview');
    }
  } else {
    context.cleanup = true; context.publish = true;
    if (event.pull_request) {
      context.pr = event.number; context.head = event.pull_request.head.sha;
      context.url = siteURL(repository, context.pr);
    }
  }
  await mkdir('playtest-artifacts', {recursive: true});
  await writeFile(contextFile, JSON.stringify(context));
  for (const [key, value] of Object.entries(context)) {
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${key}=${value || ''}\n`);
  }
  console.log(JSON.stringify(context));
}

async function readState() {
  const ref = await api(`git/ref/heads/${stateBranch}`, {missing: true});
  if (!ref) return {parent: null, files: new Map()};
  const commit = await api(`git/commits/${ref.object.sha}`), tree = await api(`git/trees/${commit.tree.sha}?recursive=1`);
  if (tree.truncated) throw Error('Truncated Pages content tree');
  const files = new Map(); let total = 0;
  for (const entry of tree.tree) {
    if (entry.type === 'tree') continue;
    safePath(entry.path);
    total += entry.size;
    if (entry.type !== 'blob' || entry.mode !== '100644' || entry.size > maxFileBytes || total > maxSiteBytes || files.size >= 10000) throw Error('Invalid Pages content tree');
    files.set(entry.path, {sha: entry.sha});
  }
  return {parent: ref.object.sha, files};
}

// The file list of the build about to be replaced, or none if it has no
// readable manifest. Retention is a courtesy; it must never block a publish.
async function previousBuildFiles(files, pr) {
  const entry = files.get(`${pr ? `pr-preview/pr-${pr}/` : ''}revision.json`);
  if (!entry) return [];
  try {
    const blob = await api(`git/blobs/${entry.sha}`);
    return Object.keys(JSON.parse(Buffer.from(blob.content, 'base64').toString()).files ?? {});
  } catch { return []; }
}

export async function stageSite() {
  const context = JSON.parse(await readFile(contextFile, 'utf8'));
  const previous = await readState();
  let files = previous.files;
  // The queue serializes all mutations. Re-read live PR state to prevent delayed
  // CI completions from reviving closed previews or replacing newer commits.
  for (const number of new Set([...files.keys()].map(p => /^pr-preview\/pr-(\d+)\//.exec(p)?.[1]).filter(Boolean))) {
    const pr = await api(`pulls/${number}`);
    if (pr.state !== 'open' || pr.head?.repo?.full_name !== context.repository || pr.base.ref !== 'main') {
      files = new Map([...files].filter(([p]) => !p.startsWith(`pr-preview/pr-${number}/`)));
    }
  }
  if (!context.cleanup) {
    if (context.pr) {
      const pr = await api(`pulls/${context.pr}`);
      if (!isCurrentPR(pr, context.repository, context.head)) throw Error('PR changed while publication was preparing; rerun its latest CI');
    } else if ((await api('git/ref/heads/main')).object.sha !== context.head) throw Error('Main changed while publication was preparing; publish the latest CI');
    const incoming = await staticFiles(incomingDir);
    const manifest = JSON.parse(incoming.get('revision.json')?.bytes.toString() ?? 'null');
    validateBuild(manifest, context);
    if (incoming.size !== Object.keys(manifest.files).length + 1) throw Error('Unexpected files in CI artifact');
    for (const [path, hash] of Object.entries(manifest.files)) if (!incoming.has(path) || digest(incoming.get(path).bytes) !== hash) throw Error(`Asset hash mismatch: ${path}`);
    const html = incoming.get('index.html')?.bytes.toString() ?? '';
    if (!html.includes(`src="${manifest.base}assets/`)) throw Error('Build uses the wrong asset base');
    files = replaceBuild(files, incoming, context.pr, await previousBuildFiles(files, context.pr));
  }
  if (!files.has('index.html')) throw Error('No production build to publish; run CI on main first');
  await rm(siteDir, {recursive: true, force: true}); await mkdir(siteDir, {recursive: true});
  const known = new Set([...previous.files.values()].map(f => f.sha));
  for (const [path, file] of files) {
    if (!file.bytes) {
      const blob = await api(`git/blobs/${file.sha}`);
      if (blob.encoding !== 'base64') throw Error('Unsupported Git blob encoding');
      file.bytes = Buffer.from(blob.content, 'base64');
    }
    if (gitHash(file.bytes) !== file.sha) throw Error('Git content hash mismatch');
    if (!known.has(file.sha)) {
      const blob = await api('git/blobs', {method: 'POST', body: {content: file.bytes.toString('base64'), encoding: 'base64'}});
      if (blob.sha !== file.sha) throw Error('Git upload hash mismatch');
      known.add(file.sha);
    }
    await mkdir(join(siteDir, path, '..'), {recursive: true}); await writeFile(join(siteDir, path), file.bytes);
  }
  // Reapply the aggregate budget after combining multiple independent previews.
  await staticFiles(siteDir);
  const tree = await api('git/trees', {method: 'POST', body: {tree: [...files].map(([path, file]) => ({path, mode: '100644', type: 'blob', sha: file.sha}))}});
  const commit = await api('git/commits', {method: 'POST', body: {message: context.cleanup ? 'Remove closed PR previews' : `Publish ${context.pr ? `PR #${context.pr}` : 'production'} ${context.head}`, tree: tree.sha, parents: previous.parent ? [previous.parent] : []}});
  if (previous.parent) await api(`git/refs/heads/${stateBranch}`, {method: 'PATCH', body: {sha: commit.sha, force: false}});
  else await api('git/refs', {method: 'POST', body: {ref: `refs/heads/${stateBranch}`, sha: commit.sha}});
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `Published content snapshot: \`${commit.sha}\`\n\n${context.cleanup ? 'Closed previews removed.' : `[Play ${context.pr ? `PR #${context.pr}` : 'production'}](${context.url}) — browser verification follows.`}\n`);
}

export function expectedCI(env = process.env) {
  return {
    ...(env.EXPECTED_CI_RUN ? {run: Number(env.EXPECTED_CI_RUN)} : {}),
    ...(env.EXPECTED_CI_ATTEMPT ? {attempt: Number(env.EXPECTED_CI_ATTEMPT)} : {}),
  };
}

export async function readPublishedManifest(base, expected = {}, fetcher = fetch) {
  const url = new URL(base);
  if (url.protocol !== 'https:' || !url.pathname.endsWith('/') || url.search || url.hash || url.username || url.password ||
      (expected.head !== undefined && !shaPattern.test(expected.head))) throw Error('Invalid verification target');
  const revisionURL = new URL('revision.json', url);
  if (expected.head) revisionURL.searchParams.set('revision', expected.head);
  if (expected.run !== undefined) revisionURL.searchParams.set('run', expected.run);
  if (expected.attempt !== undefined) revisionURL.searchParams.set('attempt', expected.attempt);
  const response = await fetcher(revisionURL, {cache: 'no-store', signal: AbortSignal.timeout(30000)});
  if (!response.ok) throw Error(`Published revision HTTP ${response.status}`);
  const manifest = await response.json();
  validateBuild(manifest, {...manifest, ...expected});
  if (!shaPattern.test(manifest.head) || manifest.base !== url.pathname) throw Error('Published revision does not match the deployment path');
  if (expected.source !== undefined && manifest.source !== expected.source) throw Error('Published merge revision changed during browser verification');
  return manifest;
}

// Pages edges do not all switch to a new deployment at once: minutes after a
// publish, one can still answer with the previous build's manifest. Keep
// asking, with a fresh URL each time so no cached answer is reused, until the
// expected publication appears. A genuinely different publication never
// matches, so it still fails once the attempts run out.
export async function awaitPublishedManifest(base, expected = {}, {attempts = 12, wait = () => delay(5000), fetcher = fetch, log = console.log} = {}) {
  for (let attempt = 1; ; attempt++) {
    const fresh = (url, options) => { const u = new URL(url); u.searchParams.set('check', `${Date.now()}-${attempt}`); return fetcher(u, options); };
    try { return await readPublishedManifest(base, expected, fresh); }
    catch (error) {
      if (attempt >= attempts || /Invalid verification target/.test(error.message)) throw error;
      log(`Waiting for Pages CDN (${attempt}/${attempts}): ${error.message}`);
      await wait();
    }
  }
}

export async function verifyPublished(base, head, pr, fetcher = fetch, build = {}) {
  if (!shaPattern.test(head)) throw Error('Invalid verification target');
  const url = new URL(base);
  const manifest = await readPublishedManifest(base, {repository: repositoryName(), head, pr, ...build}, fetcher);
  for (const [path, hash] of Object.entries(manifest.files)) {
    const asset = await fetcher(new URL(path, url), {cache: 'no-store', signal: AbortSignal.timeout(30000)});
    if (!asset.ok || digest(Buffer.from(await asset.arrayBuffer())) !== hash) throw Error(`Published asset missing or stale: ${path}`);
  }
  console.log(`Verified ${Object.keys(manifest.files).length} published files for ${head}`);
}

async function verifyWithRetry() {
  for (let attempt = 0; ; attempt++) {
    try { await verifyPublished(process.env.REVIEW_BASE_URL, process.env.EXPECTED_HEAD_SHA, Number(process.env.EXPECTED_PR_NUMBER), fetch, expectedCI()); return; }
    catch (error) { if (attempt === 11) throw error; console.log(`Waiting for Pages CDN: ${error.message}`); await delay(5000); }
  }
}

async function verifyCleanup() {
  const root = siteURL(repositoryName(), 0), preview = process.env.REVIEW_BASE_URL;
  for (let attempt = 0; ; attempt++) {
    try {
      const production = await fetch(root, {cache: 'no-store', signal: AbortSignal.timeout(30000)});
      if (!production.ok) throw Error(`Production unavailable after cleanup: HTTP ${production.status}`);
      if (Number(process.env.EXPECTED_PR_NUMBER)) {
        const removed = await fetch(`${preview}?cleanup=${process.env.GITHUB_RUN_ID}`, {cache: 'no-store', signal: AbortSignal.timeout(30000)});
        if (removed.status !== 404) throw Error(`Closed preview still available: HTTP ${removed.status}`);
      }
      return;
    } catch (error) { if (attempt === 11) throw error; console.log(`Waiting for cleanup: ${error.message}`); await delay(5000); }
  }
}

export async function reportPreview() {
  const prNumber = Number(process.env.PREVIEW_PR), head = process.env.PREVIEW_HEAD;
  if (!Number.isSafeInteger(prNumber) || prNumber < 1) throw Error('Invalid PR number');
  const pr = await api(`pulls/${prNumber}`), cleanup = process.env.PREVIEW_CLEANUP === 'true';
  if (cleanup ? pr.state === 'open' : !isCurrentPR(pr, repositoryName(), head)) return;
  if (!cleanup && process.env.PREVIEW_STAGED === 'true') {
    // The Pages snapshot may have been replaced while a read-only Chrome job
    // ran. A new CI attempt can supersede it even at the same PR head SHA.
    const file = await api(`contents/pr-preview/pr-${prNumber}/revision.json?ref=${stateBranch}`, {missing: true});
    if (!file) return;
    if (file.encoding !== 'base64') throw Error('Invalid published revision encoding');
    const manifest = JSON.parse(Buffer.from(file.content, 'base64').toString());
    const {run, attempt} = expectedCI();
    if (manifest.head !== head || manifest.run !== run || manifest.attempt !== attempt) return;
  }
  const ready = process.env.PUBLISH_RESULT === 'success' && process.env.VERIFY_RESULT === 'success';
  const runURL = `https://github.com/${repositoryName()}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const url = siteURL(repositoryName(), prNumber);
  if (url !== process.env.PREVIEW_URL) throw Error('Unexpected preview link');
  if (!cleanup) await status(head, ready ? 'success' : 'failure', ready ? 'Playable preview passed deployed asset and browser checks' : 'Preview not ready; see publication and browser checks');
  const text = cleanup ? (ready ? 'This PR is closed; its playable preview has been removed.' : `Preview cleanup failed. [Publication log](${runURL}).`) :
    ready ? `**[Play this PR](${url})**\n\nRevision: \`${head}\`. Tests, all map renders, deployed asset hashes and the deployed Village/combat/training browser checks passed.\n\n[Browser screenshots and deployment log](${runURL}). New commits update this link; closing the PR removes the preview.` :
      `The preview is **not ready for the latest revision** (\`${head}\`). ${process.env.PREVIEW_REASON || 'Publication or deployed browser verification failed.'}\n\n[Check the publication log](${runURL}). An older version may still be visible at the preview URL.`;
  let comment;
  for (let page = 1; ; page++) {
    const comments = await api(`issues/${prNumber}/comments?per_page=100&page=${page}`);
    comment = comments.find(c => c.user?.login === 'github-actions[bot]' && c.body.includes(marker)) ?? comment;
    if (comments.length < 100) break;
  }
  await api(comment ? `issues/comments/${comment.id}` : `issues/${prNumber}/comments`, {method: comment ? 'PATCH' : 'POST', body: {body: `${marker}\n${text}`}});
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const command = process.argv[2];
  const commands = {stamp, resolve: resolveContext, stage: stageSite, verify: verifyWithRetry, 'verify-cleanup': verifyCleanup, report: reportPreview};
  if (!commands[command]) throw Error('Expected stamp, resolve, stage, verify, verify-cleanup or report');
  await commands[command]();
}
