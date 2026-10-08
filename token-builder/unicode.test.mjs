import test from 'node:test';
import assert from 'node:assert/strict';
import { byteLabel, decodeTokenPieces, previewToken, visibleTokenText } from './unicode.mjs';
const encode = text => new TextEncoder().encode(text);

for (const text of ['你好世界', 'مرحبا بالعالم', 'こんにちは', 'नमस्ते', 'café', 'e\u0301', '🙂👩🏽‍💻', '🇨🇳🇯🇵', '\uFEFFtext', 'a\uFFFD']) {
  test(`preserves ${JSON.stringify(text)} at every byte boundary`, () => {
    const bytes = encode(text);
    for (let split = 1; split < bytes.length; split++) {
      const result = decodeTokenPieces([bytes.slice(0, split), bytes.slice(split)]);
      assert.equal(result.text, text);
      assert.equal(result.pending.length, 0);
      assert.equal(result.runs.map(run => run.text).join(''), text);
    }
    assert.equal(decodeTokenPieces(Array.from(bytes, byte => Uint8Array.of(byte))).text, text);
  });
}

test('shows partial bytes explicitly, then completes the character with the next token', () => {
  assert.equal(previewToken([0xE4, 0xBD]), '⟨E4 BD⟩');
  const pending = decodeTokenPieces([encode('Hello '), Uint8Array.of(0xE4, 0xBD)]);
  assert.equal(pending.text, 'Hello ⟨E4 BD⟩');
  assert.deepEqual([...pending.pending], [0xE4, 0xBD]);
  assert.equal(previewToken([0xA0], pending.pending), '你');
  const complete = decodeTokenPieces([encode('Hello '), Uint8Array.of(0xE4, 0xBD), Uint8Array.of(0xA0)]);
  assert.deepEqual(complete.runs.at(-1), {text:'你', start:1, end:2, kind:'text'});
});

test('combining marks, flags and emoji stay in one clickable run', () => {
  for (const text of ['e\u0301', '👩🏽‍💻', '🇨🇳']) {
    const result = decodeTokenPieces(Array.from(encode(text), byte => Uint8Array.of(byte)));
    assert.equal(result.runs.length, 1);
    assert.equal(result.runs[0].text, text);
    assert.equal(result.runs[0].start, 0);
    assert.equal(result.runs[0].end, encode(text).length - 1);
  }
});

test('joined Arabic words stay together, with correct token ownership for rewind', () => {
  const result = decodeTokenPieces([encode('Hello '), encode('مر'), encode('حب'), encode('ا')]);
  assert.equal(result.text, 'Hello مرحبا');
  assert.deepEqual(result.runs.at(-1), {text:'مرحبا', start:1, end:3, kind:'text'});
});

test('ordinary English token boundaries remain clickable', () => {
  assert.deepEqual(decodeTokenPieces([encode('The cat'), encode(' sat'), encode(' down')]).runs, [
    {text:'The cat',start:0,end:0,kind:'text'},
    {text:' sat',start:1,end:1,kind:'text'},
    {text:' down',start:2,end:2,kind:'text'},
  ]);
});

test('invalid UTF-8 is shown honestly as bytes, not silently discarded', () => {
  for (const bytes of [[0xFF], [0xC0, 0xAF], [0xED,0xA0,0x80], [0xF4,0x90,0x80,0x80], [0xE4,0x20]]) {
    const result = decodeTokenPieces([Uint8Array.from(bytes)]);
    assert.ok(!result.text.includes('\uFFFD'));
    assert.ok(result.text.includes('⟨'));
    assert.equal(result.pending.length, 0);
  }
  assert.equal(byteLabel([0, 255]), '⟨00 FF⟩');
});

test('vocabulary labels mark whitespace without corrupting byte notation', () => {
  assert.equal(visibleTokenText(' x\n\t\r'), '·x↵⇥␍');
  assert.equal(visibleTokenText(' ⟨E4 BD⟩'), '·⟨E4 BD⟩');
  assert.equal(visibleTokenText('\u0000مرحبا'), '⟨00⟩مرحبا');
});
