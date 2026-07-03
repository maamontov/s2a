import test from 'node:test';
import assert from 'node:assert/strict';
import { nextPowerOfTwo, pack, tryPack } from '../src/packer.js';

test('nextPowerOfTwo rounds dimensions up', () => {
  assert.equal(nextPowerOfTwo(1), 1);
  assert.equal(nextPowerOfTwo(257), 512);
});

test('tryPack places rectangles without overlap', () => {
  const frames = tryPack([{ id: 1, w: 20, h: 20 }, { id: 2, w: 12, h: 30 }, { id: 3, w: 18, h: 10 }], 64, 64);
  assert.equal(frames.length, 3);
  for (let i = 0; i < frames.length; i++) for (let j = i + 1; j < frames.length; j++) {
    const a = frames[i], b = frames[j];
    assert.ok(b.x >= a.x + a.w || b.x + b.w <= a.x || b.y >= a.y + a.h || b.y + b.h <= a.y);
  }
});

test('pack produces power-of-two atlas within limit', () => {
  const result = pack([{ id: 1, w: 65, h: 20 }, { id: 2, w: 30, h: 80 }], { maxSize: 256, powerOfTwo: true });
  assert.equal((result.width & (result.width - 1)), 0);
  assert.equal((result.height & (result.height - 1)), 0);
  assert.ok(result.width <= 256 && result.height <= 256);
});

test('pack rejects atlas above max size', () => {
  assert.throws(() => pack([{ id: 1, w: 300, h: 10 }], { maxSize: 256 }), /не помещаются/);
});
