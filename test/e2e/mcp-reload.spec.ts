import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { expect, test } from '@playwright/test';

/**
 * `mcp --reload` against the built CLI: a copy of it in a folder of its own, so the test can rewrite it the way a
 * build does — removed first, then written again — without touching `dist`.
 */
test('mcp --reload starts the server again when the CLI is rebuilt, and the client keeps its connection', async ({}, info) => {
  test.skip(info.project.name !== 'react18', 'no browser involved: once is enough');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-reload-'));
  const cli = path.join(dir, 'cli.mjs');
  const built = fs.readFileSync('dist/cli.js', 'utf8');
  fs.writeFileSync(cli, built);

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, 'mcp', '--reload', '--dir', path.join(dir, 'sessions')],
    stderr: 'pipe',
  });
  let log = '';
  transport.stderr?.on('data', (chunk) => (log += String(chunk)));
  const client = new Client({ name: 'test', version: '1' });
  let changed = 0;
  client.setNotificationHandler(ToolListChangedNotificationSchema, () => void changed++);
  await client.connect(transport);
  try {
    const names = async () => (await client.listTools()).tools.map((t) => t.name);
    expect(await names()).toContain('list_recordings');

    // The build: the file is gone for a moment, then back with different contents.
    fs.rmSync(cli);
    await new Promise((r) => setTimeout(r, 200));
    fs.writeFileSync(cli, `${built}\n// rebuilt\n`);

    await expect.poll(() => changed, { timeout: 10_000 }).toBe(1);
    expect(log).toContain('the MCP server restarted');
    // The same connection answers from the new server.
    expect(await names()).toContain('list_recordings');
    const listed = await client.callTool({ name: 'list_recordings', arguments: {} });
    expect(listed.isError).toBeFalsy();
  } finally {
    await client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
