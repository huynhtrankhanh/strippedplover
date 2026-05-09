import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
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
  it('handles import, translate, export, quit over STDIO with JSON dictionary', async () => {
    const proc = spawn('node', ['dist/index.js', ':memory:'], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
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
            name: 'user-dict',
            type: 'json',
            data: { TEFT: 'test', 'HEL/HROE': 'hello' },
          },
        }) + '\n'
      );
      const importResp = JSON.parse(await waitForLine(lines));
      expect(importResp.result?.status).toBe('ok');
      expect(importResp.result?.entries).toBe(2);
      expect(importResp.result?.type).toBe('json');

      proc.stdin.write(
        JSON.stringify({ id: '2', method: 'translate', params: { stroke: 'TEFT' } }) + '\n'
      );
      const translateResp = JSON.parse(await waitForLine(lines));
      const preedit = translateResp.result?.output?.[0];
      expect(preedit?.type).toBe('preedit');
      expect(typeof preedit?.text === 'string' ? preedit.text.trim() : undefined).toBe('test');

      proc.stdin.write(
        JSON.stringify({ id: '3', method: 'export_dictionary', params: { name: 'user-dict' } }) + '\n'
      );
      const exportResp = JSON.parse(await waitForLine(lines));
      expect(exportResp.result?.type).toBe('json');
      expect(exportResp.result?.data).toEqual({ TEFT: 'test', 'HEL/HROE': 'hello' });

      proc.stdin.write(JSON.stringify({ id: '4', method: 'quit', params: {} }) + '\n');
      const quitResp = JSON.parse(await waitForLine(lines));
      expect(quitResp.result?.status).toBe('ok');
    } finally {
      proc.kill();
      rl.close();
    }
  }, 60000);

  it('returns an error for Python dictionaries when running in browser runtime', async () => {
    const proc = spawn('node', ['dist/index.js', ':memory:'], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
    const lines: string[] = [];

    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', line => lines.push(line));

    const pythonCode = `
LONGEST_KEY = 2

DICTIONARY = {
    ('TEFT',): 'test',
    ('HEL', 'HROE'): 'hello',
}

def lookup(key):
    if key in DICTIONARY:
        return DICTIONARY[key]
    raise KeyError(key)
`;

    try {
      const ready = JSON.parse(await waitForLine(lines));
      expect(ready.status).toBe('ready');

      proc.stdin.write(
        JSON.stringify({
          id: '1',
          method: 'import_dictionary',
          params: {
            name: 'python-dict',
            type: 'python',
            pythonCode,
          },
        }) + '\n'
      );
      const importResp = JSON.parse(await waitForLine(lines, 30000));
      expect(importResp.error?.code).toBe(-32000);
      expect(String(importResp.error?.message ?? '')).toContain('not supported');

      proc.stdin.write(JSON.stringify({ id: '2', method: 'quit', params: {} }) + '\n');
      const quitResp = JSON.parse(await waitForLine(lines));
      expect(quitResp.result?.status).toBe('ok');
    } finally {
      proc.kill();
      rl.close();
    }
  }, 60000);
});
