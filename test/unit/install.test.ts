// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installClaude } from '../../src/mcp/install';

const quiet = () => vi.spyOn(console, 'log').mockImplementation(() => {});

describe('init-claude', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-install-'));
    quiet();
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

  it('copies the skill and the agent and registers the server', () => {
    installClaude(root, false);
    expect(read('.claude/skills/react-perf-recorder/SKILL.md')).toContain('name: react-perf-recorder');
    expect(read('.claude/skills/react-perf-recorder/references/reading-a-recording.md')).toContain('cascade root');
    expect(read('.claude/agents/perf-recorder.md')).toContain('name: perf-recorder');
    expect(JSON.parse(read('.mcp.json')).mcpServers['react-perf-recorder'].args).toContain('mcp');
  });

  it('keeps what the project already has, unless forced', () => {
    fs.mkdirSync(path.join(root, '.claude/agents'), { recursive: true });
    fs.writeFileSync(path.join(root, '.claude/agents/perf-recorder.md'), 'mine');
    fs.writeFileSync(path.join(root, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }));

    installClaude(root, false);
    expect(read('.claude/agents/perf-recorder.md')).toBe('mine');
    // The other servers are still there, and ours is next to them.
    expect(Object.keys(JSON.parse(read('.mcp.json')).mcpServers)).toEqual(['other', 'react-perf-recorder']);

    installClaude(root, true);
    expect(read('.claude/agents/perf-recorder.md')).toContain('name: perf-recorder');
  });
});
