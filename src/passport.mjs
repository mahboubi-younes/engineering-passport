import { promises as fs } from 'node:fs';
import path from 'node:path';

const SKIP = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'coverage', '.venv', 'venv']);

const verified = (detail) => ({ status: 'verified', detail });
const detected = (detail) => ({ status: 'detected', detail });
const unknown = (detail = 'Not detected') => ({ status: 'unknown', detail });

const exists = async (p) => {
  try { await fs.access(p); return true; } catch { return false; }
};

async function files(root, dir = root, out = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await files(root, full, out);
    else out.push(path.relative(root, full).replaceAll('\\', '/'));
  }
  return out;
}

const read = async (p) => {
  try { return await fs.readFile(p, 'utf8'); } catch { return ''; }
};

async function jsonFile(root, relativePath) {
  try { return JSON.parse(await read(path.join(root, relativePath))); } catch { return null; }
}

async function packageManifests(root, fileList) {
  const paths = fileList.filter((f) => path.basename(f).toLowerCase() === 'package.json');
  const manifests = [];
  for (const relativePath of paths) {
    const data = await jsonFile(root, relativePath);
    if (data) manifests.push({ path: relativePath, data });
  }
  return manifests;
}

function technology(list, fileList, manifests, hasPython) {
  const add = (name) => { if (!list.includes(name)) list.push(name); };
  if (fileList.some((x) => /\\.py$/i.test(x)) || hasPython) add('Python');
  if (fileList.some((x) => /\\.(ts|tsx)$/i.test(x))) add('TypeScript');
  if (fileList.some((x) => /\\.(js|jsx|mjs|cjs)$/i.test(x))) add('JavaScript');

  for (const { data } of manifests) {
    const deps = { ...(data.dependencies || {}), ...(data.devDependencies || {}), ...(data.peerDependencies || {}) };
    if (deps.react || deps['react-dom']) add('React');
    if (deps.vite) add('Vite');
    if (deps.electron) add('Electron');
    if (deps.vue) add('Vue');
    if (deps.svelte) add('Svelte');
  }

  if (fileList.some((x) => /(^|\\/)dockerfile$/i.test(x))) add('Docker');
}

async function githubEvidence() {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) {
    return {
      api: unknown('GitHub API unavailable outside Actions'),
      name: '',
      description: '',
      defaultBranch: '',
      pages: unknown('GitHub Pages not detected'),
      workflows: unknown('GitHub Actions data unavailable'),
      latestRun: null
    };
  }

  const headers = {
    accept: 'application/vnd.github+json',
    authorization: 'Bearer ' + token,
    'X-GitHub-Api-Version': '2022-11-28'
  };

  const get = async (url) => {
    try {
      const response = await fetch('https://api.github.com' + url, { headers });
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  };

  const meta = await get('/repos/' + repo);
  const runsData = await get('/repos/' + repo + '/actions/runs?per_page=50');
  const pages = await get('/repos/' + repo + '/pages');

  const currentRunId = process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) : null;
  const runs = Array.isArray(runsData?.workflow_runs) ? runsData.workflow_runs : [];

  // Ignore this Passport workflow when judging the repository's own CI.
  const relevantRuns = runs.filter((run) =>
    run.id !== currentRunId &&
    !/^engineering passport$/i.test(String(run.name || ''))
  );

  const latest = relevantRuns[0] || null;
  const latestSuccess = latest?.conclusion === 'success';

  return {
    api: meta ? verified('Repository metadata read from GitHub API') : unknown('Repository metadata unavailable'),
    name: meta?.full_name || repo,
    description: meta?.description || '',
    defaultBranch: meta?.default_branch || '',
    pages: pages ? verified(pages.html_url || 'GitHub Pages detected') : unknown('GitHub Pages not detected'),
    workflows: latest
      ? (latestSuccess
        ? verified('Latest non-Passport workflow succeeded on ' + latest.updated_at)
        : detected('Latest non-Passport workflow: ' + (latest.conclusion || latest.status)))
      : unknown('No non-Passport workflow runs available'),
    latestRun: latest ? {
      name: latest.name,
      status: latest.status,
      conclusion: latest.conclusion,
      updatedAt: latest.updated_at,
      url: latest.html_url
    } : null
  };
}

function markdownLinks(text) {
  return [...text.matchAll(/\\[([^]\\n]+)\\]\\((https?:\\/\\/[^)\\s]+)\\)/g)]
    .map((match) => ({ label: match[1], url: match[2].replace(/[.,]+$/, '') }))
    .filter(({ label, url }) =>
      !label.trim().startsWith('!') &&
      !/shields\\.io|badge\\.fury\\.io|img\\.shields\\.io/i.test(url)
    );
}

async function checkUrl(url) {
  if (!url) return null;
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
    return response.status >= 200 && response.status < 400 ? response.status : null;
  } catch {
    return null;
  }
}

function statusText(value) {
  return value.status === 'verified' ? 'VERIFIED'
    : value.status === 'detected' ? 'DETECTED'
    : 'UNKNOWN';
}

function svg(e) {
  const esc = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  const rows = Object.entries(e.evidence).map(([key, value], index) => {
    const y = 165 + index * 32;
    return '<text x="38" y="' + y + '" class="label">' + esc(key.toUpperCase()) +
      '</text><text x="500" y="' + y + '" class="state ' + value.status + '">' +
      esc(statusText(value)) + '</text><text x="38" y="' + (y + 18) +
      '" class="detail">' + esc(value.detail).slice(0, 105) + '</text>';
  }).join('');

  const height = 205 + Object.keys(e.evidence).length * 32;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="760" height="' + height +
    '" viewBox="0 0 760 ' + height + '"><style>.bg{fill:#0d1117}.title{fill:#f0f6fc;font:700 22px system-ui}.sub{fill:#8b949e;font:13px system-ui}.label{fill:#c9d1d9;font:600 12px ui-monospace}.detail{fill:#8b949e;font:12px system-ui}.state{font:700 12px ui-monospace}.verified{fill:#3fb950}.detected{fill:#d29922}.unknown{fill:#8b949e}.rule{stroke:#30363d}</style><rect class="bg" width="100%" height="100%" rx="14"/><text x="38" y="46" class="title">ENGINEERING PASSPORT</text><text x="38" y="72" class="sub">' +
    esc(e.repository.name) + '</text><text x="38" y="98" class="sub">Evidence report - ' +
    esc(e.generatedAt.slice(0, 10)) +
    '</text><line x1="38" y1="120" x2="722" y2="120" class="rule"/>' + rows + '</svg>';
}

function markdown(e) {
  const lines = [
    '# Engineering Passport',
    '',
    '![Engineering Passport](./engineering-passport.svg)',
    '',
    'Repository: ' + e.repository.name,
    '',
    'Evidence-first report. This is not a quality score or ranking.',
    '',
    '## Evidence',
    ''
  ];

  for (const [key, value] of Object.entries(e.evidence)) {
    lines.push('- **' + key + '** | ' + statusText(value) + ' | ' + value.detail);
  }

  lines.push(
    '',
    '## Technologies',
    '',
    e.technologies.length ? e.technologies.join(' | ') : 'Unknown / Not detected',
    '',
    '## Verification context',
    '',
    '- Generated: ' + e.generatedAt,
    '- GitHub API: ' + (e.github.api?.detail || 'Unknown / Not detected'),
    '',
    'Unknown means evidence was unavailable; no claim is made.'
  );

  return lines.join('\\n') + '\\n';
}

export async function generate({ root, outputDir = root }) {
  const fileList = await files(root);
  const readme = await read(path.join(root, 'README.md'));
  const manifests = await packageManifests(root, fileList);
  const hasPython = fileList.some((f) => /(^|\\/)(pyproject\\.toml|requirements(?:\\.txt)?|setup\\.py)$/i.test(f));

  const workflowFiles = fileList.filter((f) => f.startsWith('.github/workflows/') && /\\.(yml|yaml)$/i.test(f));
  const passportWorkflowFiles = workflowFiles.filter((f) => /engineering-passport/i.test(path.basename(f)));
  const projectWorkflowFiles = workflowFiles.filter((f) => !passportWorkflowFiles.includes(f));

  const workflowContents = await Promise.all(projectWorkflowFiles.map(async (f) => ({
    path: f,
    content: await read(path.join(root, f))
  })));

  const testFiles = fileList.filter((f) =>
    /(^|\\/)(test|tests|__tests__)(\\/|$)|(^|\\/)[^/]*(\\.test|\\.spec)\\.[jt]sx?$|(^|\\/)test_.*\\.py$/i.test(f)
  );

  const docs = fileList.filter((f) => /(^|\\/)(docs|documentation)(\\/|$)/i.test(f));
  const screenshots = fileList.filter((f) =>
    /(^|\\/)(assets|screenshots?|docs)(\\/|$).*(png|jpe?g|webp|svg)$/i.test(f)
  );

  const github = await githubEvidence();

  const links = markdownLinks(readme);
  const demoLink = links.find(({ label }) => /live demo|live site|try .*demo|portfolio demo|demo/i.test(label));
  const demoUrl = demoLink?.url || null;
  const demoHttpStatus = await checkUrl(demoUrl);

  const technologies = [];
  technology(technologies, fileList, manifests, hasPython);

  const buildManifest = manifests.find(({ data }) => typeof data.scripts?.build === 'string');
  const buildWorkflow = workflowContents.find(({ content }) => /npm\\s+run\\s+build|yarn\\s+build|pnpm\\s+build|\\bpytest\\b|\\bnpm\\s+test\\b/i.test(content));
  const testWorkflow = workflowContents.find(({ content }) => /npm\\s+(run\\s+)?test|yarn\\s+test|pnpm\\s+test|\\bpytest\\b|\\bvitest\\b|\\bplaywright\\b/i.test(content));

  const tests = testFiles.length
    ? (testWorkflow && github.latestRun?.conclusion === 'success'
      ? verified(testFiles.length + ' test file(s) detected; latest relevant workflow succeeded')
      : detected(testFiles.length + ' test file(s) detected; passing execution not verified'))
    : unknown('Test files and configurations not detected');

  const sourceDetected = fileList.some((f) =>
    /\\.(js|jsx|mjs|cjs|ts|tsx|py|go|rs|java|cs|cpp|c|html|css)$/i.test(f)
  );

  const buildEvidence = buildManifest
    ? (buildWorkflow && github.latestRun?.conclusion === 'success'
      ? verified('Build script declared and latest relevant workflow succeeded')
      : detected('Build script declared: ' + buildManifest.data.scripts.build))
    : (fileList.some((f) => /(^|\\/)(vite\\.config\\.|webpack\\.config\\.|rollup\\.config\\.|Makefile|Dockerfile)$/i.test(f))
      ? detected('Build configuration detected')
      : unknown());

  const ciEvidence = projectWorkflowFiles.length === 0
    ? unknown('No non-Passport GitHub Actions workflow detected')
    : github.latestRun?.conclusion === 'success'
      ? verified('Latest non-Passport workflow succeeded on ' + github.latestRun.updatedAt)
      : github.latestRun
        ? detected('Latest non-Passport workflow: ' + (github.latestRun.conclusion || github.latestRun.status))
        : detected(projectWorkflowFiles.length + ' non-Passport workflow file(s) detected');

  const liveDemoEvidence = demoUrl
    ? (demoHttpStatus ? verified('README demo link reachable; HTTP ' + demoHttpStatus) : detected('Demo URL declared in README but not reachable during verification'))
    : unknown('Live demo link not detected in README');

  const description = github.description || readme.split(/\\n\\s*\\n/).find((part) => !part.startsWith('#') && part.trim())?.trim() || '';

  const evidence = {
    README: (await exists(path.join(root, 'README.md'))) ? detected('README.md detected') : unknown(),
    LICENSE: fileList.some((f) => /^license(?:\\.|$)/i.test(path.basename(f))) ? detected('License file detected') : unknown(),
    SOURCE: sourceDetected ? detected('Source files detected') : unknown(),
    BUILD: buildEvidence,
    CI: ciEvidence,
    TESTS: tests,
    DEPLOYMENT: github.pages?.status === 'verified'
      ? github.pages
      : (projectWorkflowFiles.some((f) => /deploy|pages|netlify|vercel/i.test(f)) ? detected('Deployment-related workflow detected') : unknown('Deployment evidence not detected')),
    DOCUMENTATION: (docs.length || /(^|\\n)#{1,3} (setup|install|usage|architecture|testing|limitations|roadmap)/im.test(readme))
      ? detected('Documentation sections or docs directory detected')
      : unknown('Documentation structure not detected'),
    ASSETS: screenshots.length ? detected(screenshots.length + ' screenshot or asset file(s) detected') : unknown('Screenshots/assets not detected'),
    'LIVE DEMO': liveDemoEvidence
  };

  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    repository: {
      name: github.name || process.env.GITHUB_REPOSITORY || path.basename(root),
      description
    },
    technologies,
    evidence,
    github,
    files: {
      workflows: workflowFiles,
      tests: testFiles.slice(0, 40),
      docs: docs.slice(0, 40),
      assets: screenshots.slice(0, 40)
    }
  };

  await fs.mkdir(outputDir, { recursive: true });
  const json = JSON.stringify(output, null, 2) + '\\n';
  const md = markdown(output);
  const svgText = svg(output);

  if ([json, md, svgText].some((value) => value.includes('\\uFFFD'))) {
    throw new Error('Generated Passport contains Unicode replacement characters');
  }

  await fs.writeFile(path.join(outputDir, 'engineering-passport.json'), json);
  await fs.writeFile(path.join(outputDir, 'engineering-passport.md'), md);
  await fs.writeFile(path.join(outputDir, 'engineering-passport.svg'), svgText);

  if (process.env.GITHUB_STEP_SUMMARY) await fs.writeFile(process.env.GITHUB_STEP_SUMMARY, md);

  return output;
}
