'use strict';
// Scanner: facts read directly from the code. No guessing: every fact carries file and line.
// Supports JavaScript/TypeScript and HTML well; other files are listed but not parsed.
const fs = require('fs');
const path = require('path');
const { git } = require('./proofcard');

const MAX_BYTES = 512 * 1024;
const SKIP = /(^|\/)(node_modules|dist|build|out|coverage|\.next|\.git|\.proofcard|vendor)\//;
const LOCK = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/;
const CODE = /\.(m?[jt]sx?|cjs|vue|svelte)$/;
const TEST = /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;

const SIGNALS = {
  ui: [/document\.(getElementById|querySelector)|addEventListener\(|innerHTML|textContent|React|useState\(|<template>|createElement\(/],
  backend: [/http\.createServer|express\(\)|fastify\(|new Hono\(|\bapp\.(get|post|put|patch|delete)\(|\brouter\.(get|post|put|patch|delete)\(|export (async )?function (GET|POST|PUT|PATCH|DELETE)\b|req\.method/],
  data: [/fs\.(promises\.)?(writeFile|appendFile|readFile)(Sync)?\(|\bprisma\.|mongoose\.|sequelize|knex\(|createClient\(|\.from\(['"`]\w+['"`]\)\.(select|insert|update|delete)|localStorage\.|sessionStorage\.|indexedDB|CREATE TABLE|INSERT INTO|SELECT .+ FROM|new Database\(|redis/i],
  external: [/fetch\(\s*['"`]https?:\/\/|axios\.|require\(['"](stripe|openai|@anthropic-ai\/sdk|nodemailer|twilio|@aws-sdk\/[\w-]+|aws-sdk|@supabase\/supabase-js|firebase[\w/-]*|@mistralai\/[\w-]+|resend|@sendgrid\/mail)['"]\)|from ['"](stripe|openai|@anthropic-ai\/sdk|nodemailer|twilio|@aws-sdk\/[\w-]+|@supabase\/supabase-js|firebase[\w/-]*|@mistralai\/[\w-]+|resend|@sendgrid\/mail)['"]/],
};

function listFiles(root) {
  const out = git(['ls-files', '--cached', '--others', '--exclude-standard'], root).split('\n');
  return [...new Set(out.map((f) => f.trim()).filter(Boolean))]
    .filter((f) => !SKIP.test(`/${f}`) && !LOCK.test(f) && fs.existsSync(path.join(root, f)))
    .sort();
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function all(re, text, fn) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m;
  while ((m = g.exec(text))) fn(m, lineOf(text, m.index));
}

function resolveImport(from, spec, fileSet) {
  if (!spec.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  const tries = [base, ...['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs', '.vue', '.svelte'].map((e) => base + e),
    ...['/index.js', '/index.ts', '/index.tsx', '/index.jsx'].map((e) => base + e)];
  return tries.find((t) => fileSet.has(t)) || null;
}

function kindOf(file, tags) {
  if (TEST.test(file)) return 'test';
  if (/\.html?$/.test(file)) return 'screen';
  if (/\.(css|scss|sass|less)$/.test(file)) return 'style';
  if (/\.(md|txt)$/i.test(file) || /^LICENSE/i.test(file)) return 'docs';
  if (!CODE.test(file)) return /\.(json|ya?ml|toml|ini|env\.example)$/.test(file) || /(^|\/)\.[\w.-]+$/.test(file) ? 'config' : 'other';
  if (/(^|\/)(scripts?|tools)\//.test(file)) return 'script';
  if (/\.config\.[cm]?[jt]s$/.test(file)) return 'config';
  if (tags.includes('backend')) return 'backend';
  if (tags.includes('ui') || /\.(jsx|tsx|vue|svelte)$/.test(file) || /(^|\/)(public|static|components|pages|app)\//.test(file)) return 'frontend';
  if (tags.includes('data')) return 'data';
  return 'module';
}

function scanFile(root, file, fileSet) {
  const full = path.join(root, file);
  const size = fs.statSync(full).size;
  const f = { file, lines: 0, tags: [], imports: [], symbols: [], routes: [], calls: [], storage: [], external: [], env: [], tests: [], pageRefs: [] };
  if (size > MAX_BYTES) { f.kind = 'other'; f.note = 'too large to scan'; return f; }
  const buf = fs.readFileSync(full);
  if (buf.includes(0)) { f.kind = 'binary'; return f; }
  const text = buf.toString('utf8');
  f.lines = text.split('\n').length;

  if (CODE.test(file) || /\.html?$/.test(file)) {
    for (const [tag, res] of Object.entries(SIGNALS)) if (res.some((re) => re.test(text))) f.tags.push(tag);
    all(/(?:require\(\s*|import\s+(?:[\w*{}\s,]+\s+from\s+)?|import\(\s*)['"]([^'"]+)['"]/, text, (m, line) => {
      const to = resolveImport(file, m[1], fileSet);
      f.imports.push({ spec: m[1], to, line });
    });
    all(/<script[^>]+src=["']([^"']+)["']/, text, (m, line) => f.pageRefs.push({ src: m[1], line }));
    all(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/, text, (m, line) => f.symbols.push({ name: m[1], line }));
    all(/(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/, text, (m, line) => f.symbols.push({ name: m[1], line }));
    all(/(?:^|\n)\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/, text, (m, line) => f.symbols.push({ name: m[1], line }));
    // Routes, only in files that actually run a server: express-style calls, "METHOD /path" keys, route tables.
    if (f.tags.includes('backend') && !TEST.test(file)) {
      all(/\b(?:app|router|server|api)\.(get|post|put|patch|delete|all)\(\s*['"`](\/[^'"`]*)['"`]/, text, (m, line) => f.routes.push({ method: m[1].toUpperCase(), path: m[2], line }));
      all(/['"`](GET|POST|PUT|PATCH|DELETE)\s+(\/[^'"`\s]*)['"`]\s*[:,)]/, text, (m, line) => f.routes.push({ method: m[1], path: m[2], line }));
      all(/(?:^|[\s{,])['"](\/[\w\-./:]*)['"]\s*:/, text, (m, line) => f.routes.push({ method: '*', path: m[1], line }));
      all(/(?:req\.url|pathname|url)\s*={2,3}\s*['"](\/[^'"]*)['"]([^\n]*)/, text, (m, line) => {
        const method = /method\s*={2,3}\s*['"](\w+)['"]/.exec(m[2]);
        f.routes.push({ method: method ? method[1].toUpperCase() : '*', path: m[1], line });
      });
    }
    // Client calls to our own API.
    all(/fetch\(\s*['"`](\/[^'"`?]*)[^)]*/, text, (m, line) => {
      const method = /method\s*:\s*['"](\w+)['"]/.exec(m[0]);
      f.calls.push({ method: (method ? method[1] : 'GET').toUpperCase(), path: m[1].replace(/\$\{[^}]*\}/g, ':param'), line });
    });
    all(/fs\.(?:promises\.)?(writeFile|appendFile|readFile|rename|unlink)(?:Sync)?\(\s*([^,)]+)/, text, (m, line) => f.storage.push({ op: m[1], target: m[2].trim().slice(0, 60), line }));
    all(/\b(localStorage|sessionStorage)\.(setItem|getItem|removeItem)\(\s*['"`]?([^'"`,)]*)/, text, (m, line) => f.storage.push({ op: `${m[1]}.${m[2]}`, target: m[3], line }));
    all(/\b(prisma|mongoose|knex|sequelize|redis|supabase|db)\.(\w+)/, text, (m, line) => f.storage.push({ op: `${m[1]}.${m[2]}`, target: '', line }));
    all(/fetch\(\s*['"`](https?:\/\/[^'"`/]+)/, text, (m, line) => f.external.push({ what: m[1], line }));
    all(/(?:require\(|from\s+)['"](stripe|openai|@anthropic-ai\/sdk|nodemailer|twilio|@aws-sdk\/[\w-]+|aws-sdk|@supabase\/supabase-js|firebase[\w/-]*|@mistralai\/[\w-]+|resend|@sendgrid\/mail)['"]/, text, (m, line) => f.external.push({ what: m[1], line }));
    all(/process\.env\.([A-Z0-9_]+)|import\.meta\.env\.([A-Z0-9_]+)/, text, (m, line) => f.env.push({ name: m[1] || m[2], line }));
    if (TEST.test(file)) all(/\b(?:test|it|describe)\(\s*(['"`])((?:(?!\1).)+)\1/, text, (m, line) => f.tests.push({ name: m[2], line }));
  }
  f.kind = kindOf(file, f.tags);
  // Dedupe routes by method+path+line.
  const seen = new Set();
  f.routes = f.routes.filter((r) => { const k = `${r.method} ${r.path} ${r.line}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return f;
}

// A page's <script src="/x.js"> is linked to a repo file only when exactly one file ends with that path.
function resolvePageRef(src, files) {
  const tail = '/' + src.replace(/^\.?\//, '').split('?')[0];
  const hits = files.filter((x) => `/${x}`.endsWith(tail));
  return hits.length === 1 ? hits[0] : null;
}

function scan(root) {
  const files = listFiles(root);
  const fileSet = new Set(files);
  const byFile = {};
  for (const file of files) byFile[file] = scanFile(root, file, fileSet);

  // Import graph (both directions).
  const importedBy = {};
  for (const f of Object.values(byFile)) {
    for (const i of f.imports) if (i.to) (importedBy[i.to] = importedBy[i.to] || []).push(f.file);
    for (const p of f.pageRefs) {
      const target = resolvePageRef(p.src, files);
      if (target) (importedBy[target] = importedBy[target] || []).push(f.file);
    }
  }

  // Client call → server route edges (exact path, or :param pattern).
  const routes = Object.values(byFile).flatMap((f) => f.routes.map((r) => ({ ...r, file: f.file })));
  const matchRoute = (p, r) => {
    const re = new RegExp(`^${r.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\:\w+|:\w+/g, '[^/]+')}$`);
    return re.test(p) || re.test(p.replace(/:param/g, 'x'));
  };
  const calls = Object.values(byFile).flatMap((f) => f.calls.map((c) => {
    const hit = routes.find((r) => (r.method === c.method || r.method === '*' || r.method === 'ALL') && matchRoute(c.path, r));
    return { ...c, file: f.file, handledBy: hit ? { file: hit.file, line: hit.line, path: hit.path } : null };
  }));

  // Signs of mess — facts that suggest a look, not verdicts.
  const mess = [];
  const source = Object.values(byFile).filter((f) => ['frontend', 'backend', 'data', 'module'].includes(f.kind));
  for (const f of source) {
    const layers = ['ui', 'backend', 'data', 'external'].filter((t) => f.tags.includes(t));
    if (layers.includes('ui') && (layers.includes('data') || layers.includes('backend')) && !/localStorage/.test(JSON.stringify(f.storage))) {
      mess.push({ type: 'mixed-responsibility', file: f.file, detail: `one file handles ${layers.join(' + ')}` });
    } else if (layers.length >= 3) {
      mess.push({ type: 'mixed-responsibility', file: f.file, detail: `one file handles ${layers.join(' + ')}` });
    }
    if (f.lines > 400) mess.push({ type: 'large-file', file: f.file, detail: `${f.lines} lines` });
    const entry = f.routes.length || f.kind === 'frontend' || /(^|\/)(server|index|main|app)\.[cm]?[jt]sx?$/.test(f.file);
    if (!importedBy[f.file] && !entry) mess.push({ type: 'orphan', file: f.file, detail: 'not imported or loaded by any file' });
  }
  for (const c of calls) if (!c.handledBy) mess.push({ type: 'unhandled-call', file: c.file, line: c.line, detail: `${c.method} ${c.path} has no matching route in this repo` });
  // Same function name in several files of the same part (browser vs server twins are normal).
  const names = {};
  for (const f of source) for (const s of f.symbols) (names[`${f.kind === 'frontend' ? 'frontend' : 'server'}:${s.name}`] = names[`${f.kind === 'frontend' ? 'frontend' : 'server'}:${s.name}`] || []).push(f.file);
  for (const [key, fs_] of Object.entries(names)) {
    const name = key.split(':')[1];
    const uniq = [...new Set(fs_)];
    if (uniq.length > 1 && name.length > 3 && !/^(main|init|handler|render|setup|get|set)$/.test(name)) mess.push({ type: 'duplicate-name', file: uniq.join(', '), detail: `function "${name}" defined in ${uniq.length} files` });
  }

  return { files: byFile, importedBy, routes, calls, mess };
}

// Entry points and their import closure: raw material for drafting features on an existing repo.
function suggest(s) {
  const closure = (start) => {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const f = s.files[queue.shift()];
      if (!f) continue;
      const next = [...f.imports.map((i) => i.to), ...f.pageRefs.map((p) => resolvePageRef(p.src, Object.keys(s.files)))].filter(Boolean);
      for (const n of next) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
    return [...seen];
  };
  const testsFor = (files) => Object.values(s.files).filter((t) => t.kind === 'test' && t.imports.some((i) => files.includes(i.to))).map((t) => t.file);
  const out = [];
  for (const f of Object.values(s.files)) {
    if (f.kind === 'screen') {
      const files = closure(f.file);
      const calls = s.calls.filter((c) => files.includes(c.file));
      out.push({ entry: f.file, type: 'screen', files, apiCalls: calls.map((c) => ({ call: `${c.method} ${c.path}`, from: `${c.file}:${c.line}`, handledBy: c.handledBy ? `${c.handledBy.file}:${c.handledBy.line}` : 'unknown' })), tests: testsFor(files) });
    }
    for (const r of f.routes) {
      out.push({ entry: `${f.file}:${r.line}`, type: 'route', route: `${r.method} ${r.path}`, files: closure(f.file), tests: testsFor(closure(f.file)) });
    }
  }
  return out;
}

module.exports = { scan, suggest, listFiles, TEST };
