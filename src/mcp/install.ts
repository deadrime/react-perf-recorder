import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** `claude/` next to `dist/`, whether the cli runs from the package or from a checkout. */
function claudeDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of [path.resolve(here, '../claude'), path.resolve(here, '../../claude')]) {
    if (fs.existsSync(path.join(candidate, 'skills'))) return candidate;
  }
  throw new Error('the claude/ folder is missing from the package');
}

function copyTree(from: string, to: string, force: boolean, done: string[], kept: string[]) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      copyTree(source, target, force, done, kept);
    } else if (fs.existsSync(target) && !force) {
      kept.push(target);
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
      done.push(target);
    }
  }
}

/** Adds the server without touching anything else in the file. */
function mergeMcp(file: string, entry: Record<string, unknown>, force: boolean): 'added' | 'kept' | 'created' {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `${JSON.stringify({ mcpServers: entry }, null, 2)}\n`);
    return 'created';
  }
  const current = JSON.parse(fs.readFileSync(file, 'utf8')) as { mcpServers?: Record<string, unknown> };
  const servers = current.mcpServers ?? (current.mcpServers = {});
  if (servers['react-perf-recorder'] && !force) return 'kept';
  Object.assign(servers, entry);
  fs.writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`);
  return 'added';
}

/** Copies the skill and the agent into a project's `.claude/`, and registers the MCP server. */
export function installClaude(root: string, force: boolean) {
  const from = claudeDir();
  const done: string[] = [];
  const kept: string[] = [];
  copyTree(path.join(from, 'skills'), path.join(root, '.claude', 'skills'), force, done, kept);
  copyTree(path.join(from, 'agents'), path.join(root, '.claude', 'agents'), force, done, kept);
  const entry = (JSON.parse(fs.readFileSync(path.join(from, 'mcp.json'), 'utf8')) as { mcpServers: Record<string, unknown> }).mcpServers;
  const mcp = mergeMcp(path.join(root, '.mcp.json'), entry, force);

  for (const file of done) console.log(`  + ${path.relative(root, file)}`);
  for (const file of kept) console.log(`  · ${path.relative(root, file)} (already there, --force overwrites)`);
  console.log(`  ${mcp === 'kept' ? '·' : '+'} .mcp.json: react-perf-recorder ${mcp}`);
  console.log('\nRestart Claude Code to pick up the MCP server, then ask it to record a page.');
}
