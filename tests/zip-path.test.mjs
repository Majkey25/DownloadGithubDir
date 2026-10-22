import assert from 'node:assert/strict';
import test from 'node:test';
import { isSafeArchivePath } from '../assets/zip-path.js';

test('keeps relative nested and Unicode archive names', () => {
  for (const path of ['README.md', 'src/app.js', '.github/workflows/build.yml', 'čeština/obrázek.png']) {
    assert.equal(isSafeArchivePath(path), true, path);
  }
});

test('rejects path traversal and Windows path aliases before packaging', () => {
  for (const path of [null, '', '/absolute', '../escape', 'a/../b', 'a/./b', 'a//b',
    '..\\escape', 'C:/escape', 'name:stream', 'a\u0000b', 'dir./file', 'dir /file',
    'CON', 'aux.txt', 'dir/LPT1.log', 'COM¹.txt']) {
    assert.equal(isSafeArchivePath(path), false, String(path));
  }
});
