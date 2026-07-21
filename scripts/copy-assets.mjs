import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist/system/assets', { recursive: true });
cpSync('src/system/assets', 'dist/system/assets', { recursive: true });
