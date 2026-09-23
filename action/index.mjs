import { generate } from '../src/passport.mjs';
const root = process.env.GITHUB_WORKSPACE || process.cwd();
await generate({ root, outputDir: process.env.PASSPORT_OUTPUT || root });
