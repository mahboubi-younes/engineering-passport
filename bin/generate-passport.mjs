#!/usr/bin/env node
import { generate } from '../src/passport.mjs';
const root = process.env.PASSPORT_ROOT || process.cwd();
const outDir = process.env.PASSPORT_OUTPUT || root;
const evidence = await generate({ root, outputDir: outDir });
console.log('Engineering Passport generated for ' + evidence.repository.name);
