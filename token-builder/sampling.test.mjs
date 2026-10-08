import test from 'node:test';
import assert from 'node:assert/strict';
import { distribution, drawToken, softmax } from './sampling.mjs';

const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
test('softmax is normalized and stable with very large logits', () => {
  const p = softmax([10000, 10001, 9999]);
  near(p.reduce((a, b) => a + b), 1);
  near(p[1], Math.exp(1) / (Math.exp(1) + 1 + Math.exp(-1)));
});
test('temperature changes entropy but not candidate ranking', () => {
  const cold = distribution([0, 1, 2], { temperature: .3 });
  const hot = distribution([0, 1, 2], { temperature: 2 });
  assert.ok(cold.entropy < hot.entropy); assert.deepEqual(cold.order, hot.order);
});
test('top-k truncates and renormalizes', () => {
  const d = distribution([Math.log(.5), Math.log(.3), Math.log(.2)], { topK: 2 });
  assert.deepEqual(d.kept, [0, 1]); near(d.final[0], .625); near(d.final[1], .375); near(d.final[2], 0);
});
test('top-p includes the boundary-crossing token', () => {
  const d = distribution([Math.log(.5), Math.log(.3), Math.log(.2)], { topP: .7 });
  assert.deepEqual(d.kept, [0, 1]); near(d.final[0], .625);
});
test('top-p is applied to the renormalized top-k pool', () => {
  const d = distribution([Math.log(.5), Math.log(.3), Math.log(.2)], { topK: 2, topP: .6 });
  assert.deepEqual(d.kept, [0]); near(d.final[0], 1);
});
test('zero temperature picks argmax, including ties deterministically', () => {
  const d = distribution([2, 2, 1], { temperature: 0 });
  assert.deepEqual(d.kept, [0]); near(d.final[0], 1); assert.equal(drawToken(d, .99).id, 0);
});
test('inverse CDF uses the whole distribution and correct boundaries', () => {
  const d = distribution([Math.log(.5), Math.log(.3), Math.log(.2)]);
  assert.equal(drawToken(d, .1).id, 0); assert.equal(drawToken(d, .6).id, 1); assert.equal(drawToken(d, .9).id, 2);
  near(drawToken(d, .6).low, .5); near(drawToken(d, .6).high, .8);
  // Deterministic uniform grid checks categorical frequencies without flaky RNG.
  const counts = [0, 0, 0];
  for (let i = 0; i < 10000; i++) counts[drawToken(d, (i + .5) / 10000).id]++;
  assert.deepEqual(counts, [5000, 3000, 2000]);
});
test('filtering never leaves an empty distribution', () => {
  const d = distribution([100, -100, -200], { temperature: .001, topP: .01, topK: 1 });
  assert.deepEqual(d.kept, [0]); near(d.final.reduce((a, b) => a + b), 1);
});
test('invalid settings and random draws are rejected', () => {
  assert.throws(() => distribution([1], { topP: 0 })); assert.throws(() => softmax([NaN]));
  const d = distribution([1]); assert.throws(() => drawToken(d, 1)); assert.throws(() => drawToken(d, -.1));
});
