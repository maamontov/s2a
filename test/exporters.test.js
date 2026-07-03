import test from 'node:test';
import assert from 'node:assert/strict';
import { genericJSON, godotTRES, pixiJSON } from '../src/exporters.js';

const atlas = {
  width: 128, height: 64,
  frames: [{ path: 'characters/hero.png', contentX: 2, contentY: 3, sw: 16, sh: 20, trimmed: true, trimX: 4, trimY: 5, sourceW: 24, sourceH: 30 }]
};

test('Pixi exporter emits TexturePacker-compatible frame data', () => {
  const output = JSON.parse(pixiJSON(atlas, 'atlas.png'));
  assert.deepEqual(output.frames['characters/hero.png'].frame, { x: 2, y: 3, w: 16, h: 20 });
  assert.equal(output.meta.image, 'atlas.png');
});

test('generic exporter preserves paths and source dimensions', () => {
  const output = JSON.parse(genericJSON(atlas, 'atlas.png'));
  assert.equal(output.frames[0].name, 'characters/hero');
  assert.equal(output.frames[0].sourceWidth, 24);
});

test('Godot exporter creates one named animation per sprite', () => {
  const output = godotTRES(atlas, 'atlas.png');
  assert.match(output, /type="SpriteFrames"/);
  assert.match(output, /&"characters\/hero"/);
  assert.match(output, /margin = Rect2\(4, 5, 8, 10\)/);
  assert.match(output, /region = Rect2\(2, 3, 16, 20\)/);
});
