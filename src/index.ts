#!/usr/bin/env node

import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

type BridgeResponse = {
  response: Record<string, unknown>;
  events: Array<Record<string, unknown>>;
  quit: boolean;
};

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.wasm')) return 'application/wasm';
  if (filePath.endsWith('.zip')) return 'application/zip';
  if (filePath.endsWith('.xz')) return 'application/x-xz';
  if (filePath.endsWith('.so')) return 'application/octet-stream';
  return 'application/octet-stream';
}

async function createStaticServer(rootDir: string): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    const requestUrl = req.url ?? '/';
    const pathname = decodeURIComponent(requestUrl.split('?')[0] ?? '/');
    const relativePath = pathname === '/' ? '/index.html' : pathname;
    const resolvedPath = path.resolve(rootDir, `.${relativePath}`);

    if (!resolvedPath.startsWith(rootDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    let filePath = resolvedPath;
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Internal Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentTypeFor(filePath), 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()));
      });
    },
  };
}

async function main(): Promise<void> {
  const databaseName = process.argv[2];
  if (!databaseName) {
    console.error('Usage: strippedplover <database-path>');
    process.exit(1);
  }

  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'web');
  const server = await createStaticServer(webDir);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let shouldQuit = false;

  try {
    const page = await browser.newPage();
    await page.goto(`${server.baseUrl}/index.html`, { waitUntil: 'networkidle0' });
    await page.evaluate(async (dbName: string) => {
      await (globalThis as any).StrippedPloverBridge.init(dbName);
    }, databaseName);

    console.log(JSON.stringify({ status: 'ready' }));

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    for await (const line of rl) {
      const bridgeResponse = await page.evaluate(async (rawLine: string) => {
        return await (globalThis as any).StrippedPloverBridge.handleRawRequest(rawLine);
      }, line) as BridgeResponse;

      for (const event of bridgeResponse.events) {
        console.log(JSON.stringify(event));
      }
      console.log(JSON.stringify(bridgeResponse.response));

      if (bridgeResponse.quit) {
        shouldQuit = true;
        break;
      }
    }

    rl.close();
  } finally {
    await browser.close();
    await server.close();
  }

  if (shouldQuit) {
    return;
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
