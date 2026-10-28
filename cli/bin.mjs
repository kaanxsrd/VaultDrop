#!/usr/bin/env node
// Executable entry point. Kept separate from the library so `npm i -g` / `npx` symlinks work.
import { run } from "./vaultdrop.mjs";

process.exitCode = await run(process.argv.slice(2));
