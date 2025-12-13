import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
let built = false;

function waitForLine(lines: string[], timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (lines.length > 0) {
        return resolve(lines.shift() as string);
      }
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('Timed out waiting for STDIO response'));
      }
      setTimeout(check, 10);
    };
    check();
  });
}

beforeAll(() => {
  if (!built) {
    execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });
    built = true;
  }
});

describe('STDIO end-to-end', () => {
  it('handles add, translate, export, quit over STDIO', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'stdio-e2e-'));
    const dictPath = path.join(dir, 'user.py');

    const proc = spawn('node', ['dist/index.js'], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
    const lines: string[] = [];

    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', line => lines.push(line));

    try {
      const ready = JSON.parse(await waitForLine(lines));
      expect(ready.status).toBe('ready');

      proc.stdin.write(
        JSON.stringify({
          id: '1',
          method: 'import_dictionary',
          params: {
            path: dictPath,
            data: { TEFT: 'test', 'HEL/HROE': 'hello' },
            merge: false,
          },
        }) + '\n'
      );
      const importResp = JSON.parse(await waitForLine(lines));
      expect(importResp.result?.status).toBe('ok');
      expect(importResp.result?.entries).toBe(2);

      proc.stdin.write(
        JSON.stringify({ id: '2', method: 'translate', params: { stroke: 'TEFT' } }) + '\n'
      );
      const translateResp = JSON.parse(await waitForLine(lines));
      const preedit = translateResp.result?.output?.[0];
      expect(preedit?.type).toBe('preedit');
      expect((preedit?.text as string)?.trim()).toBe('test');

      proc.stdin.write(
        JSON.stringify({ id: '3', method: 'export_dictionary', params: { path: dictPath } }) + '\n'
      );
      const exportResp = JSON.parse(await waitForLine(lines));
      expect(exportResp.result?.data).toEqual({ TEFT: 'test', 'HEL/HROE': 'hello' });

      proc.stdin.write(JSON.stringify({ id: '4', method: 'quit', params: {} }) + '\n');
      const quitResp = JSON.parse(await waitForLine(lines));
      expect(quitResp.result?.status).toBe('ok');
    } finally {
      proc.kill();
      rl.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});
