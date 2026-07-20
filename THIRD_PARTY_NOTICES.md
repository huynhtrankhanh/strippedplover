# Third-party notices

This project is licensed under GPL-2.0-or-later. It also vendors and/or
redistributes third-party packages and generated artifacts whose license notices
must be preserved when redistributing this repository or derived builds.

## Vendored runtime packages

| Path | Package | Version | License | Upstream source |
| --- | --- | --- | --- | --- |
| `vendor/python-wasm` | `python-wasm` | 0.28.1 | BSD-3-Clause | https://github.com/sagemathinc/cowasm/tree/main/python/python-wasm |
| `vendor/@cowasm/kernel` | `@cowasm/kernel` | 0.28.0 | BSD-3-Clause | https://github.com/sagemathinc/cowasm/tree/main/core/kernel |
| `vendor/@cowasm/memfs` | `@cowasm/memfs` | 3.5.1 | Unlicense | https://github.com/sagemathinc/memfs-js |

The full license texts for these vendored packages are included next to the
vendored package metadata:

- `vendor/python-wasm/LICENSE`
- `vendor/@cowasm/kernel/LICENSE`
- `vendor/@cowasm/memfs/LICENSE`

## WebAssembly provenance

`vendor/python-wasm/dist/python.wasm` is redistributed as part of the
`python-wasm` npm package. The package metadata identifies the source repository
as `git+https://github.com/sagemathinc/cowasm.git` and the package homepage as
`https://github.com/sagemathinc/cowasm/tree/main/python/python-wasm`.

For source provenance and compliance review, the CoWasm source repository is
tracked as a git submodule at `vendor/cowasm-source`. That upstream repository
contains the build system and source tree used by CoWasm's Python WebAssembly
runtime, including `python/python-wasm` and `python/cpython`.

## npm dependency lockfile

The complete npm dependency graph and package tarball URLs are recorded in
`package-lock.json`. When adding, updating, or redistributing dependencies,
ensure every dependency license remains compatible with this project and that
required license notices are included in this file or beside vendored artifacts.
