import { distribution, drawToken, intervalForToken } from './sampling.mjs';

const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['start','prompt','prompt-editor','examples','model-status','load-progress','download','download-label','load-note','error','sentence','decoded-text','copy','undo','reset','rewind-note','token-count','sample','greedy','auto','inference-status','draw-method','draw-caption','draw-segments','draw-marker','draw-number','draw-result','draw-legend','temperature','temperature-value','top-k','top-k-value','top-p','top-p-value','distribution-summary','search','show-removed','probabilities','more','vocabulary-size','table-caption'].map(id => [id, $(id)]));
let worker, nextRequest = 0, vocabulary = [], eos = 50256;
let loaded = false, busy = false, autoplay = false, ended = false;
let promptIds = [], generated = [], ids = [], currentText = '', logits = null, dist = null, lastSample = null;
let rowLimit = 20, filterFrame;
const pending = new Map();
const colors = ['#37654f','#b45309','#746346','#6f7464','#8c6b59','#68745e','#8c7f67','#536356','#a37b57','#7f786e','#646960','#9c9285'];

function createWorker() {
  worker = new Worker(new URL('./inference.worker.mjs', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      const p = data.progress;
      if (p.status === 'progress' && p.file?.endsWith('.onnx')) {
        ui.download.value = p.progress || 0;
        ui['download-label'].textContent = `Downloading model · ${Math.round(p.progress || 0)}%`;
      } else if (p.status === 'done' && p.file?.endsWith('.onnx')) {
        ui.download.value = 100;
        ui['download-label'].textContent = 'Preparing model…';
      }
      return;
    }
    if (data.type === 'vocabulary') {
      vocabulary = data.vocabulary; eos = data.eos;
      ui['vocabulary-size'].textContent = `${vocabulary.length.toLocaleString()} candidates`;
      return;
    }
    const promise = pending.get(data.requestId);
    if (!promise) return;
    pending.delete(data.requestId);
    if (data.type === 'error') promise.reject(new Error(data.message)); else promise.resolve(data.result);
  };
  worker.onerror = (event) => {
    for (const promise of pending.values()) promise.reject(new Error(`The inference worker failed: ${event.message || 'check your connection and reload the model.'}`));
    pending.clear();
    worker.terminate(); worker = null; loaded = false;
  };
}

function rpc(type, payload = {}) {
  if (!worker) createWorker();
  const requestId = ++nextRequest;
  return new Promise((resolve, reject) => { pending.set(requestId, { resolve, reject }); worker.postMessage({ type, requestId, ...payload }); });
}

function settings() { return { temperature: +ui.temperature.value, topK: +ui['top-k'].value, topP: +ui['top-p'].value }; }
function formatP(p) { return p === 0 ? '0%' : p < .00001 ? `${(p * 100).toExponential(1)}%` : `${(p * 100).toFixed(p < .01 ? 3 : 2)}%`; }
function tokenLabel(id) {
  if (id === eos) return '[end of text]';
  return (vocabulary[id] || '').replaceAll(' ', '·').replaceAll('\n', '↵').replaceAll('\t', '⇥').replaceAll('\r', '␍') || '[empty]';
}
function showError(error) { ui.error.textContent = error.message || String(error); ui.error.hidden = false; }
function clearError() { ui.error.hidden = true; }
function setStatus(text) { ui['inference-status'].textContent = text; }
function syncButtons() {
  const available = loaded && dist && ids.length < 512 && !ended;
  ui.start.disabled = busy || autoplay;
  ui.examples.disabled = busy || autoplay;
  ui.prompt.disabled = busy || autoplay;
  ui.sample.disabled = !available || busy || autoplay;
  ui.greedy.disabled = !available || busy || autoplay;
  ui.auto.disabled = !available && !autoplay || busy && !autoplay;
  ui.auto.textContent = autoplay ? 'Stop auto' : 'Auto · 20 tokens';
  ui.undo.disabled = !generated.length || busy || autoplay;
  ui.reset.disabled = !generated.length || busy || autoplay;
  ui.copy.disabled = !ids.length;
  ui.search.disabled = !dist;
  renderTable();
}

function updateDistribution() {
  const s = settings();
  ui['temperature-value'].textContent = s.temperature.toFixed(2);
  ui['top-k-value'].textContent = s.topK || 'Off';
  ui['top-p-value'].textContent = s.topP === 1 ? 'Off' : s.topP.toFixed(2);
  if (!logits) return;
  dist = distribution(logits, s);
  ui['distribution-summary'].textContent = `${dist.kept.length.toLocaleString()} eligible tokens · entropy ${dist.entropy.toFixed(2)} bits${s.temperature === 0 ? ' · greedy distribution' : ''}`;
  renderTable();
}

function renderTable() {
  if (!dist) return;
  const query = ui.search.value.toLowerCase();
  const matches = dist.order.filter(id => (ui['show-removed'].checked || dist.final[id] > 0) && (!query || (query.startsWith('#') ? String(id) === query.slice(1) : vocabulary[id]?.toLowerCase().includes(query))));
  const rows = matches.slice(0, rowLimit);
  const max = rows.reduce((value, id) => Math.max(value, dist.final[id]), 0) || 1;
  const fragment = document.createDocumentFragment();
  for (const id of rows) {
    const tr = document.createElement('tr');
    const removed = dist.final[id] === 0;
    if (removed) tr.className = 'removed';
    const labelCell = document.createElement('td');
    const button = document.createElement('button');
    button.className = 'token-pick'; button.disabled = busy || autoplay || ended || ids.length >= 512;
    button.title = `Token #${id} · logit ${logits[id].toFixed(4)} · model ${formatP(dist.raw[id])} · sampling ${formatP(dist.final[id])}${removed ? ' · manual selection bypasses filtering' : ''}`;
    const bar = document.createElement('span'); bar.className = 'token-bar'; bar.style.width = `${dist.final[id] / max * 100}%`;
    const label = document.createElement('span'); label.className = 'token-label'; label.textContent = tokenLabel(id);
    button.append(bar, label); button.addEventListener('click', () => choose('manual', id)); labelCell.append(button);
    const rawCell = document.createElement('td'); rawCell.textContent = formatP(dist.raw[id]);
    const finalCell = document.createElement('td'); finalCell.textContent = removed ? 'Filtered out' : formatP(dist.final[id]);
    tr.append(labelCell, rawCell, finalCell); fragment.append(tr);
  }
  if (!rows.length) {
    const tr = document.createElement('tr'), td = document.createElement('td');
    td.colSpan = 3; td.className = 'table-empty'; td.textContent = 'No matching tokens.'; tr.append(td); fragment.append(tr);
  }
  ui.probabilities.replaceChildren(fragment);
  ui.more.hidden = matches.length <= rowLimit;
  ui['table-caption'].textContent = `Showing ${rows.length} of ${matches.length.toLocaleString()}${query ? ' matches' : ' tokens'}. · means a space; ↵ means a newline. Bars are scaled to the largest displayed sampling probability.`;
}

function renderSentence() {
  ui.sentence.replaceChildren();
  const promptSpan = document.createElement('span'); promptSpan.className = 'prompt-text'; promptSpan.textContent = ui.prompt.dataset.active || ''; ui.sentence.append(promptSpan);
  for (let i = 0; i < generated.length; i++) {
    const step = generated[i];
    const button = document.createElement('button');
    button.textContent = step.id === eos ? ' [end of text]' : vocabulary[step.id];
    if (step.probability < .01) button.className = 'surprising';
    button.title = `#${step.id} · model ${formatP(step.raw)} · sampling ${formatP(step.probability)} · ${step.method} · click to rewind`;
    button.disabled = busy || autoplay;
    button.addEventListener('click', () => rewind(i)); ui.sentence.append(button);
  }
  // Decode the complete prefix for correct UTF-8 display; byte-fragment tokens
  // retain their individual labels, while this title exposes the exact text.
  ui.sentence.title = currentText;
  const literal = (ui.prompt.dataset.active || '') + generated.map(step => vocabulary[step.id]).join('');
  ui['decoded-text'].hidden = literal === currentText;
  ui['decoded-text'].textContent = `Decoded text (some tokens contain partial UTF-8 bytes): ${currentText}`;
  ui['token-count'].textContent = `${promptIds.length} prompt + ${generated.length} generated · ${ids.length}/512 tokens`;
  ui['rewind-note'].hidden = !generated.length;
}

function makeDrawSnapshot(selection, method) {
  const cutoff = Math.min(12, dist.kept.length);
  const head = dist.kept.slice(0, cutoff);
  const segments = [];
  let position = 0;
  for (const id of head) {
    const high = position + dist.final[id];
    segments.push({ id, low: position, high, label: tokenLabel(id) }); position = high;
  }
  // If a tail token wins, split the aggregated tail around its actual interval.
  if (selection.low !== null && !head.includes(selection.id)) {
    if (selection.low > position) segments.push({ low: position, high: selection.low, label: 'Other tokens' });
    segments.push({ id: selection.id, low: selection.low, high: selection.high, label: tokenLabel(selection.id) });
    position = selection.high;
  }
  if (position < 1 - 1e-12) segments.push({ low: position, high: 1, label: 'Other tokens' });
  return { ...selection, method, segments, probability: dist.final[selection.id], raw: dist.raw[selection.id], s: settings() };
}

function renderDraw(snapshot, animate = false) {
  ui['draw-segments'].replaceChildren(); ui['draw-legend'].replaceChildren();
  if (!snapshot) {
    ui['draw-marker'].hidden = true; ui['draw-method'].textContent = ''; ui['draw-result'].textContent = 'No token sampled yet.';
    return;
  }
  snapshot.segments.forEach((segment, i) => {
    const color = segment.id === undefined ? '#938d83' : colors[i % colors.length];
    const el = document.createElement('div'); el.className = 'segment'; el.style.width = `${(segment.high - segment.low) * 100}%`; el.style.background = color;
    el.title = `${segment.label} · [${segment.low.toFixed(6)}, ${segment.high.toFixed(6)}) · ${formatP(segment.high - segment.low)}`;
    if (segment.id === snapshot.id) el.classList.add('selected');
    if (segment.high - segment.low > .08) el.textContent = segment.label;
    ui['draw-segments'].append(el);
    if (i < 7 || segment.id === snapshot.id) {
      const item = document.createElement('span'); item.className = 'legend-item';
      const swatch = document.createElement('span'); swatch.className = 'swatch'; swatch.style.background = color;
      const label = document.createElement('span'); label.textContent = `${segment.label} ${formatP(segment.high - segment.low)}`;
      item.append(swatch, label); ui['draw-legend'].append(item);
    }
  });
  ui['draw-method'].textContent = snapshot.method === 'sample' ? 'Uniform random draw' : snapshot.method === 'greedy' ? 'Greedy selection' : 'Manual selection';
  ui['draw-marker'].hidden = snapshot.u === undefined;
  if (snapshot.u !== undefined) {
    ui['draw-number'].textContent = `u=${snapshot.u.toFixed(4)}`;
    if (animate) {
      ui['draw-marker'].style.transition = 'none'; ui['draw-marker'].style.left = '0%';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        ui['draw-marker'].style.transition = ''; ui['draw-marker'].style.left = `${snapshot.u * 100}%`;
      }));
    } else ui['draw-marker'].style.left = `${snapshot.u * 100}%`;
  }
  const label = tokenLabel(snapshot.id);
  ui['draw-result'].textContent = snapshot.u !== undefined
    ? `u = ${snapshot.u.toFixed(6)} falls in [${snapshot.low.toFixed(6)}, ${snapshot.high.toFixed(6)}): “${label}” · sample p = ${formatP(snapshot.probability)}`
    : `Picked “${label}” ${snapshot.method === 'greedy' ? 'by its highest model probability' : 'manually'} · model p = ${formatP(snapshot.raw)} · sample p = ${formatP(snapshot.probability)}${snapshot.low === null ? ' (outside the sampling pool)' : ''}`;
}

async function infer(payload) {
  setStatus('Computing next-token probabilities…');
  const result = await rpc('infer', payload);
  ids = result.ids; currentText = result.text; logits = result.logits;
  updateDistribution(); renderSentence();
  setStatus(ended ? 'End-of-text token selected. Undo or reset to continue.' : ids.length >= 512 ? 'Context limit reached. Rewind or use a shorter prompt.' : `${Math.round(result.ms)} ms inference · ready for token ${ids.length + 1}`);
}

async function start() {
  if (busy || autoplay) return;
  if (!ui.prompt.value.trim()) { showError(new Error('Enter a prompt first.')); return; }
  busy = true; clearError(); syncButtons();
  try {
    if (!loaded) {
      ui['model-status'].textContent = 'Loading DistilGPT-2…'; ui['load-progress'].hidden = false;
      ui['download-label'].textContent = 'Loading tokenizer and model…';
      await rpc('load'); loaded = true;
      ui['model-status'].textContent = 'DistilGPT-2 ready · CPU / WASM';
      ui.start.textContent = 'Use prompt'; ui['load-note'].textContent = 'Model loaded. Inference runs locally; your text stays on this device. This small model completes text rather than answering chat instructions.';
    }
    // Keep the previous state if the new prompt is rejected.
    const result = await rpc('infer', { prompt: ui.prompt.value });
    ids = result.ids; promptIds = [...ids]; generated = []; currentText = result.text; logits = result.logits;
    ui.prompt.dataset.active = result.text;
    ui['prompt-editor'].open = false;
    ended = false; lastSample = null; rowLimit = 20; renderDraw(null); updateDistribution(); renderSentence();
    setStatus(`${Math.round(result.ms)} ms inference · ready for token ${ids.length + 1}`);
  } catch (error) {
    showError(error); setStatus('Could not prepare the prompt. You can retry.');
    if (!loaded) { ui['model-status'].textContent = 'Model load failed'; ui.start.textContent = 'Retry loading model'; }
  } finally { busy = false; ui['load-progress'].hidden = true; syncButtons(); renderSentenceIfReady(); }
}

function renderSentenceIfReady() { if (ids.length) renderSentence(); }
function randomUniform() { const values = new Uint32Array(1); crypto.getRandomValues(values); return values[0] / 4294967296; }

async function choose(method = 'sample', manualId) {
  if (busy || !dist || ended || ids.length >= 512) return false;
  busy = true; clearError(); syncButtons(); renderSentence();
  const selection = method === 'sample' ? drawToken(dist, randomUniform()) : intervalForToken(dist, method === 'greedy' ? dist.order[0] : manualId);
  const snapshot = makeDrawSnapshot(selection, method);
  const step = { id: selection.id, probability: snapshot.probability, raw: snapshot.raw, method, snapshot };
  const oldIds = [...ids], oldLogits = logits, oldText = currentText;
  try {
    lastSample = snapshot; renderDraw(snapshot, method === 'sample');
    generated.push(step); ids = [...ids, selection.id]; ended = selection.id === eos; renderSentence();
    if (ended) {
      const result = await rpc('decode', { ids }); currentText = result.text;
      setStatus('End-of-text token selected. Undo or reset to continue.');
      dist = null; logits = null;
      ui.probabilities.replaceChildren();
      ui['distribution-summary'].textContent = 'End of text · no next-token distribution'; ui.more.hidden = true;
    } else await infer({ ids });
    return true;
  } catch (error) {
    generated.pop(); ids = oldIds; logits = oldLogits; currentText = oldText; ended = false;
    lastSample = generated.at(-1)?.snapshot || null; renderDraw(lastSample); updateDistribution(); renderSentence();
    showError(error); setStatus('Inference failed. The previous context was restored.'); autoplay = false;
    return false;
  } finally { busy = false; syncButtons(); renderSentence(); }
}

async function rewind(index) {
  if (busy || autoplay) return;
  const previous = [...generated], oldIds = [...ids], oldLogits = logits, oldText = currentText, wasEnded = ended;
  busy = true; clearError(); syncButtons();
  try {
    generated = generated.slice(0, index); ended = false;
    await infer({ ids: [...promptIds, ...generated.map(step => step.id)] });
    lastSample = generated.at(-1)?.snapshot || null; renderDraw(lastSample);
  } catch (error) {
    generated = previous; ids = oldIds; logits = oldLogits; currentText = oldText; ended = wasEnded;
    if (logits) updateDistribution(); showError(error); renderSentence();
  } finally { busy = false; syncButtons(); renderSentence(); }
}

ui.start.addEventListener('click', start);
ui.examples.addEventListener('change', () => { if (ui.examples.value) ui.prompt.value = ui.examples.value; });
ui.sample.addEventListener('click', () => choose());
ui.greedy.addEventListener('click', () => choose('greedy'));
ui.undo.addEventListener('click', () => rewind(generated.length - 1));
ui.reset.addEventListener('click', () => rewind(0));
ui.auto.addEventListener('click', async () => {
  if (autoplay) { autoplay = false; syncButtons(); return; }
  autoplay = true; syncButtons();
  for (let i = 0; i < 20 && autoplay && !ended && ids.length < 512; i++) {
    if (!await choose()) break;
    // A short pause makes individual draws visible and leaves time to press Stop.
    await new Promise(resolve => setTimeout(resolve, 550));
  }
  autoplay = false; syncButtons(); renderSentence();
});
for (const id of ['temperature','top-k','top-p']) ui[id].addEventListener('input', () => {
  cancelAnimationFrame(filterFrame); filterFrame = requestAnimationFrame(updateDistribution);
});
ui.search.addEventListener('input', () => { rowLimit = 20; renderTable(); });
ui['show-removed'].addEventListener('change', renderTable);
ui.more.addEventListener('click', () => { rowLimit += 50; renderTable(); });
ui.copy.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(currentText); ui.copy.textContent = 'Copied'; setTimeout(() => { ui.copy.textContent = 'Copy'; }, 1200); }
  catch { showError(new Error('Clipboard permission was unavailable. Select the text to copy it.')); }
});
updateDistribution();
