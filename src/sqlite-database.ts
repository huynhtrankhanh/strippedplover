import { DatabaseSync as NodeDatabaseSync } from 'node:sqlite';

/**
 * Re-export Node.js' built-in synchronous SQLite database.
 *
 * Keeping this small wrapper gives the rest of the codebase a stable import
 * path while using Node's integrated `node:sqlite` implementation directly.
 */
export class DatabaseSync extends NodeDatabaseSync {}
