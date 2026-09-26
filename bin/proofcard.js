#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { verify, newCard, detectChecks, CONFIG } = require('../lib/proofcard');

const HELP = `proofcard — evidence gate for AI-assisted changes

  proofcard init [--claude] [--codex]   create ${CONFIG} from package.json scripts;
                                        --claude installs the Claude Code skill,
                                        --codex adds the workflow to AGENTS.md
  proofcard new "<title>" [--type feature|bugfix|refactor|chore|docs] [--risk low|medium|high]
  proofcard verify [--card <slug|path>] [--base <ref>] [--json]

Exit codes of verify: 0 PASS, 1 FAIL, 2 INCOMPLETE (something required was NOT_RUN).`;

function parse(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { args._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else { args[key] = next; i++; }
  }
  return args;
}

const PKG_ROOT = path.join(__dirname, '..');
const MARK_START = '<!-- proofcard:start -->';
const MARK_END = '<!-- proofcard:end -->';

function init(root, args) {
  const done = [];
  const cfgFile = path.join(root, CONFIG);
  if (fs.existsSync(cfgFile)) done.push(`${CONFIG} already exists (left unchanged)`);
  else {
    const checks = detectChecks(root);
    fs.writeFileSync(cfgFile, JSON.stringify({ base: 'main', checks }, null, 2) + '\n');
    done.push(`wrote ${CONFIG} with ${checks.length} check(s)${checks.length ? ': ' + checks.map((c) => c.name).join(', ') : ' — add your test/build commands to "checks"'}`);
  }
  const gi = path.join(root, '.gitignore');
  const giText = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  if (!giText.includes('.proofcard/reports')) {
    fs.writeFileSync(gi, giText + (giText && !giText.endsWith('\n') ? '\n' : '') + '.proofcard/reports/\n');
    done.push('added .proofcard/reports/ to .gitignore');
  }
  if (args.claude) {
    const dest = path.join(root, '.claude', 'skills', 'proofcard', 'SKILL.md');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(PKG_ROOT, 'skills', 'proofcard', 'SKILL.md'), dest);
    done.push('installed Claude Code skill at .claude/skills/proofcard/SKILL.md');
  }
  if (args.codex) {
    const agents = path.join(root, 'AGENTS.md');
    const snippet = fs.readFileSync(path.join(PKG_ROOT, 'integrations', 'AGENTS.snippet.md'), 'utf8').trim();
    const block = `${MARK_START}\n${snippet}\n${MARK_END}`;
    let text = fs.existsSync(agents) ? fs.readFileSync(agents, 'utf8') : '';
    const re = new RegExp(`${MARK_START}[\\s\\S]*?${MARK_END}`);
    text = re.test(text) ? text.replace(re, block) : text + (text ? '\n\n' : '') + block + '\n';
    fs.writeFileSync(agents, text);
    done.push('added the Proofcard section to AGENTS.md (between proofcard markers)');
  }
  return done;
}

function main() {
  const args = parse(process.argv.slice(2));
  const cmd = args._[0];
  const root = process.cwd();
  try {
    if (cmd === 'init') {
      init(root, args).forEach((l) => console.log(`✓ ${l}`));
      return 0;
    }
    if (cmd === 'new') {
      const file = newCard(root, { title: args._.slice(1).join(' '), type: args.type, risk: args.risk, slug: args.slug });
      console.log(`Created ${file}. Fill in every TODO before \`proofcard verify\`.`);
      return 0;
    }
    if (cmd === 'verify') {
      const r = verify(root, { card: args.card, base: args.base });
      if (args.json) console.log(JSON.stringify({ ...r, markdown: undefined }, null, 2));
      else console.log(r.markdown + `Report saved to ${r.reportPath}`);
      return { PASS: 0, FAIL: 1, INCOMPLETE: 2 }[r.verdict];
    }
    console.log(HELP);
    return cmd && cmd !== 'help' && cmd !== '--help' ? 64 : 0;
  } catch (e) {
    console.error(`proofcard: ${e.message}`);
    return 1;
  }
}

process.exitCode = main();
