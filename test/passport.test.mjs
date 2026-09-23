import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generate } from '../src/passport.mjs';
test('unknown remains unknown when evidence is absent', async () => { const root = await mkdtemp(path.join(os.tmpdir(), 'passport-')); await writeFile(path.join(root, 'README.md'), '# Empty'); const e = await generate({root, outputDir: root}); assert.equal(e.evidence.TESTS.status, 'unknown'); assert.equal(e.evidence.LICENSE.status, 'unknown'); const json = JSON.parse(await readFile(path.join(root, 'engineering-passport.json'), 'utf8')); assert.equal(json.schemaVersion, 1); });
