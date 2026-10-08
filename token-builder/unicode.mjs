const graphemes = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('und', { granularity: 'grapheme' }) : null;
const words = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('und', { granularity: 'word' }) : null;
const joiningScript = /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Mongolian}\p{Script=Nko}\p{Script=Adlam}]/u;

export function byteLabel(bytes) {
  return `⟨${Array.from(bytes, byte => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')}⟩`;
}

// Read complete UTF-8 code points without replacing an unfinished token with U+FFFD.
// Invalid bytes remain visible as bytes; a later token can complete a valid prefix.
function scan(bytes) {
  const atoms = [];
  for (let start = 0; start < bytes.length;) {
    const lead = bytes[start];
    const size = lead < 0x80 ? 1 : lead >= 0xC2 && lead <= 0xDF ? 2 : lead >= 0xE0 && lead <= 0xEF ? 3 : lead >= 0xF0 && lead <= 0xF4 ? 4 : 0;
    let valid = size > 0;
    for (let j = 1; valid && j < size && start + j < bytes.length; j++) {
      const byte = bytes[start + j];
      valid = byte >= 0x80 && byte <= 0xBF;
      if (j === 1) valid &&= !(lead === 0xE0 && byte < 0xA0 || lead === 0xED && byte > 0x9F || lead === 0xF0 && byte < 0x90 || lead === 0xF4 && byte > 0x8F);
    }
    if (!valid) {
      atoms.push({ start, end: start + 1, kind: 'bytes', text: byteLabel(bytes.subarray(start, start + 1)) }); start++; continue;
    }
    if (start + size > bytes.length) {
      atoms.push({ start, end: bytes.length, kind: 'pending', text: byteLabel(bytes.subarray(start)) }); break;
    }
    let point = size === 1 ? lead : lead & (0x7F >> size);
    for (let j = 1; j < size; j++) point = point << 6 | bytes[start + j] & 0x3F;
    atoms.push({ start, end: start + size, kind: 'text', text: String.fromCodePoint(point) }); start += size;
  }
  return atoms;
}

export function previewToken(bytes, pending = []) {
  const combined = Uint8Array.from([...pending, ...bytes]);
  return scan(combined).map(atom => atom.text).join('');
}

export function visibleTokenText(text) {
  const whitespace = { ' ': '·', '\n': '↵', '\t': '⇥', '\r': '␍' };
  return text.replace(/⟨[0-9A-F ]+⟩|[\u0000-\u0020\u007F]/g, part => part.length > 1 ? part : whitespace[part] || byteLabel([part.codePointAt(0)]));
}

function textUnits(text) {
  const result = [];
  const segments = words ? words.segment(text) : [{ segment: text, index: 0 }];
  for (const word of segments) {
    // Keep cursively joined words in one DOM run so shaping crosses token boundaries.
    if (joiningScript.test(word.segment)) result.push({ text: word.segment, index: word.index });
    else if (graphemes) {
      for (const part of graphemes.segment(word.segment)) result.push({ text: part.segment, index: word.index + part.index });
    } else {
      let index = word.index;
      for (const char of word.segment) { result.push({ text: char, index }); index += char.length; }
    }
  }
  return result;
}

// Each piece is one token's original bytes. Runs may span tokens where a UTF-8
// character, combining sequence, emoji, or joined word crosses a token boundary.
export function decodeTokenPieces(pieces) {
  const size = pieces.reduce((sum, bytes) => sum + bytes.length, 0);
  const bytes = new Uint8Array(size), owners = new Uint16Array(size);
  let offset = 0;
  pieces.forEach((piece, index) => { bytes.set(piece, offset); owners.fill(index, offset, offset + piece.length); offset += piece.length; });
  const atoms = scan(bytes), runs = [];
  function add(run) {
    const previous = runs.at(-1);
    if (previous && previous.kind === run.kind && previous.start === run.start && previous.end === run.end) previous.text += run.text;
    else runs.push(run);
  }
  for (let i = 0; i < atoms.length;) {
    const atom = atoms[i];
    if (atom.kind !== 'text') {
      add({ text: atom.text, start: owners[atom.start], end: owners[atom.end - 1], kind: atom.kind }); i++; continue;
    }
    let text = '';
    const starts = [], ends = [];
    while (i < atoms.length && atoms[i].kind === 'text') {
      const part = atoms[i++]; text += part.text;
      for (let n = 0; n < part.text.length; n++) { starts.push(owners[part.start]); ends.push(owners[part.end - 1]); }
    }
    for (const unit of textUnits(text)) add({ text: unit.text, start: starts[unit.index], end: ends[unit.index + unit.text.length - 1], kind: 'text' });
  }
  const last = atoms.at(-1);
  return { runs, text: runs.map(run => run.text).join(''), pending: last?.kind === 'pending' ? bytes.slice(last.start) : new Uint8Array() };
}
