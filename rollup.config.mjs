import path from 'node:path';
import fs from 'node:fs';
import alias from '@rollup/plugin-alias';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import url from '@rollup/plugin-url';

const projectRoot = process.cwd();

function copyWebStatic() {
  return {
    name: 'copy-web-static',
    writeBundle() {
      const sourceHtml = path.resolve(projectRoot, 'src/web/index.html');
      const targetHtml = path.resolve(projectRoot, 'dist/web/index.html');
      fs.mkdirSync(path.dirname(targetHtml), { recursive: true });
      fs.copyFileSync(sourceHtml, targetHtml);
    },
  };
}

export default {
  input: 'dist/web/web/page.js',
  output: {
    dir: 'dist/web',
    format: 'es',
    sourcemap: true,
    entryFileNames: 'page.js',
    assetFileNames: 'assets/[name][extname]',
  },
  plugins: [
    alias({
      entries: [
        {
          find: './lmdb-database.js',
          replacement: path.resolve(projectRoot, 'dist/web/web/indexeddb-database.js'),
        },
        {
          find: '../../vendor/python-wasm/dist/node.js',
          replacement: path.resolve(projectRoot, 'src/web/python-runtime-stub.js'),
        },
      ],
    }),
    nodeResolve({ browser: true, preferBuiltins: false }),
    commonjs({
      transformMixedEsModules: true,
      include: [/node_modules/, /vendor\//],
    }),
    json(),
    url({
      include: ['**/*.wasm', '**/*.zip', '**/*.xz', '**/*.so'],
      limit: 0,
    }),
    copyWebStatic(),
  ],
};
