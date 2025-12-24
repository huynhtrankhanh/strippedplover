#!/usr/bin/env node
/**
 * Stripped Plover - STDIO-based Stenography Translation Engine
 * 
 * Main entry point for the application.
 */

import * as readline from 'node:readline';
import { StrippedPlover, ProtocolRequest, ProtocolResponse } from './engine.js';

/**
 * Main function
 */
async function main(): Promise<void> {
  const dbPath = process.argv[2];
  if (!dbPath) {
    console.error('Usage: strippedplover <database-path>');
    process.exit(1);
  }

  const engine = new StrippedPlover(dbPath);

  // Print ready message
  console.log(JSON.stringify({ status: 'ready' }));

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  // Process lines
  for await (const line of rl) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    let response: ProtocolResponse;

    try {
      const request = JSON.parse(trimmedLine) as ProtocolRequest;
      const result = await engine.handleRequest(request);
      
      const quit = (result as any).quit;
      delete (result as any).quit;
      
      response = result;
      console.log(JSON.stringify(response));

      if (quit) {
        break;
      }
    } catch (e) {
      response = {
        id: null,
        error: {
          code: -32700,
          message: `Parse error: ${e instanceof Error ? e.message : String(e)}`,
        },
      };
      console.log(JSON.stringify(response));
    }
  }

  rl.close();
}

// Run main
main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
