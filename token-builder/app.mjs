import { distribution, drawToken, intervalForToken } from './sampling.mjs';
import { decodeTokenPieces, previewToken, visibleTokenText } from './unicode.mjs';

const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['start','prompt','prompt-editor','examples','model-status','load-progress','download','download-label','load-note','error','continuation','sentence','copy','undo','reset','token-count','sample','greedy','auto','inference-status','draw-section','draw-segments','draw-marker','draw-number','draw-result','temperature','temperature-value','top-k','top-k-value','top-p','top-p-value','distribution-summary','search','show-removed','probabilities','more','table-caption'].map(id => [id, $(id)]));
let worker, nextRequest = 0, vocabulary = [], tokenBytes = [], pendingBytes = [], displayText = '', eos = 50256;
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
        ui['download-label'].textContent = `${Math.round(p.progress || 0)}%`;
      } else if (p.status === 'done' && p.file?.endsWith('.onnx')) {
        ui.download.value = 100;
        ui['download-label'].textContent = 'Preparing model…';
      }
      return;
    }
    if (data.type === 'vocabulary') {
      vocabulary = data.vocabulary; tokenBytes = data.tokenBytes; eos = data.eos;
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
  const text = pendingBytes.length ? previewToken(tokenBytes[id], pendingBytes) : vocabulary[id];
  return visibleTokenText(text || '') || '[empty]';
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
  ui.auto.textContent = autoplay ? 'Stop' : 'Auto · 20';
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
  ui['distribution-summary'].textContent = `${dist.kept.length.toLocaleString()} token${dist.kept.length === 1 ? '' : 's'} · ${dist.entropy.toFixed(2)} bits`;
  ui['distribution-summary'].title = `Sampling pool · entropy ${dist.entropy.toFixed(2)} bits · full vocabulary ${vocabulary.length.toLocaleString()}`;
  renderTable();
}

function renderTable() {
  if (!dist) return;
  const query = ui.search.value.toLowerCase();
  const matches = dist.order.filter(id => (ui['show-removed'].checked || dist.final[id] > 0) && (!query || (query.startsWith('#') ? String(id) === query.slice(1) : vocabulary[id]?.toLowerCase().includes(query) || tokenLabel(id).toLowerCase().includes(query))));
  const rows = matches.slice(0, rowLimit);
  const max = rows.reduce((value, id) => Math.max(value, dist.raw[id], dist.final[id]), 0) || 1;
  const fragment = document.createDocumentFragment();
  for (const [rank, id] of rows.entries()) {
    const tr = document.createElement('tr');
    const removed = dist.final[id] === 0;
    if (removed) tr.className = 'removed';
    const labelCell = document.createElement('td');
    const button = document.createElement('button');
    button.className = 'token-pick'; button.disabled = busy || autoplay || ended || ids.length >= 512;
    button.title = `Token #${id} · logit ${logits[id].toFixed(4)} · model ${formatP(dist.raw[id])} · sampling ${formatP(dist.final[id])}${removed ? ' · manual selection bypasses filtering' : ''}`;
    button.textContent = tokenLabel(id);
    button.dir = 'auto';
    button.addEventListener('click', () => choose('manual', id)); labelCell.append(button);
    const rankCell = document.createElement('td'); rankCell.textContent = rank + 1;
    const barCell = document.createElement('td');
    const barButton = document.createElement('button'); barButton.className = 'bar-pick'; barButton.disabled = button.disabled;
    barButton.setAttribute('aria-label', `Choose ${tokenLabel(id)}`); barButton.title = button.title;
    const rawBar = document.createElement('span'); rawBar.className = 'raw-bar'; rawBar.style.width = `${dist.raw[id] / max * 100}%`;
    const finalBar = document.createElement('span'); finalBar.className = 'token-bar'; finalBar.style.width = `${dist.final[id] / max * 100}%`;
    barButton.append(rawBar, finalBar); barButton.addEventListener('click', () => choose('manual', id)); barCell.append(barButton);
    const rawCell = document.createElement('td'); rawCell.textContent = formatP(dist.raw[id]);
    const finalCell = document.createElement('td'); finalCell.textContent = removed ? '—' : formatP(dist.final[id]);
    const logitCell = document.createElement('td'); logitCell.textContent = logits[id].toFixed(2);
    tr.append(rankCell, labelCell, barCell, rawCell, finalCell, logitCell); fragment.append(tr);
  }
  if (!rows.length) {
    const tr = document.createElement('tr'), td = document.createElement('td');
    td.colSpan = 6; td.className = 'table-empty'; td.textContent = 'No matches'; tr.append(td); fragment.append(tr);
  }
  ui.probabilities.replaceChildren(fragment);
  ui.more.hidden = matches.length <= rowLimit;
  ui['table-caption'].textContent = `${rows.length} / ${matches.length.toLocaleString()}`;
  ui['table-caption'].title = '· space · ↵ newline · bars share a relative scale';
}

function renderSentence() {
  ui.continuation.hidden = false;
  ui.sentence.replaceChildren();
  const decoded = decodeTokenPieces([new TextEncoder().encode(ui.prompt.dataset.active || ''), ...generated.map(step => tokenBytes[step.id])]);
  pendingBytes = decoded.pending; displayText = decoded.text;
  for (const run of decoded.runs) {
    if (run.end === 0) {
      const span = document.createElement('span'); span.className = 'prompt-text'; span.textContent = run.text; ui.sentence.append(span); continue;
    }
    const index = Math.max(0, run.start - 1), steps = generated.slice(index, run.end);
    const button = document.createElement('button'); button.textContent = run.text;
    if (steps.some(step => step.probability < .01)) button.classList.add('surprising');
    if (run.kind !== 'text') button.classList.add('byte-fragment');
    button.title = `${steps.map(step => `#${step.id} · model ${formatP(step.raw)} · sample ${formatP(step.probability)}`).join('\n')}\n${run.kind === 'pending' ? 'Incomplete UTF-8 bytes · ' : run.kind === 'bytes' ? 'UTF-8 byte fragment · ' : ''}click to rewind`;
    button.disabled = busy || autoplay;
    button.addEventListener('click', () => rewind(index)); ui.sentence.append(button);
  }
  ui.sentence.title = displayText;
  ui['token-count'].textContent = `${ids.length}/512 tokens`;
  ui['token-count'].title = `${promptIds.length} prompt · ${generated.length} generated`;
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
  return { ...selection, method, segments, label: tokenLabel(selection.id), probability: dist.final[selection.id], raw: dist.raw[selection.id], s: settings() };
}

function renderDraw(snapshot, animate = false) {
  ui['draw-segments'].replaceChildren();
  ui['draw-section'].hidden = !snapshot;
  if (!snapshot) {
    ui['draw-marker'].hidden = true; ui['draw-result'].textContent = '';
    return;
  }
  snapshot.segments.forEach((segment, i) => {
    const color = segment.id === undefined ? '#938d83' : colors[i % colors.length];
    const el = document.createElement('div'); el.className = 'segment'; el.style.width = `${(segment.high - segment.low) * 100}%`; el.style.background = color;
    el.dir = 'auto';
    el.title = `${segment.label} · [${segment.low.toFixed(6)}, ${segment.high.toFixed(6)}) · ${formatP(segment.high - segment.low)}`;
    if (segment.id === snapshot.id) el.classList.add('selected');
    if (segment.high - segment.low > .08) el.textContent = segment.label;
    ui['draw-segments'].append(el);
  });
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
  const label = snapshot.label;
  const labelNode = document.createElement('bdi'); labelNode.dir = 'auto'; labelNode.textContent = label;
  ui['draw-result'].replaceChildren(
    document.createTextNode(snapshot.u !== undefined ? '' : `${snapshot.method === 'greedy' ? 'Greedy' : 'Manual'} → `),
    labelNode, document.createTextNode(` · ${formatP(snapshot.probability)}`),
  );
  ui['draw-result'].title = snapshot.u !== undefined
    ? `Uniform draw in [${snapshot.low.toFixed(6)}, ${snapshot.high.toFixed(6)}) · model ${formatP(snapshot.raw)} · sample ${formatP(snapshot.probability)}`
    : `Model ${formatP(snapshot.raw)} · sample ${formatP(snapshot.probability)}${snapshot.low === null ? ' · bypassed filtering' : ''}`;
}

async function infer(payload) {
  setStatus('Computing…');
  const result = await rpc('infer', payload);
  ids = result.ids; currentText = result.text; logits = result.logits;
  renderSentence(); updateDistribution();
  setStatus(ended ? 'End of text' : ids.length >= 512 ? 'Context full' : `${Math.round(result.ms)} ms`);
}

async function start() {
  if (busy || autoplay) return;
  if (!ui.prompt.value.trim()) { showError(new Error('Enter a prompt first.')); return; }
  busy = true; clearError(); syncButtons();
  try {
    if (!loaded) {
      ui['model-status'].textContent = 'Loading…'; ui['load-progress'].hidden = false;
      ui['download-label'].textContent = 'Preparing…';
      await rpc('load'); loaded = true;
      ui['model-status'].textContent = 'Local · ready';
      ui.start.textContent = 'Use prompt'; ui['load-note'].textContent = 'Cached · local';
    }
    // Keep the previous state if the new prompt is rejected.
    const result = await rpc('infer', { prompt: ui.prompt.value });
    ids = result.ids; promptIds = [...ids]; generated = []; currentText = result.text; logits = result.logits;
    ui.prompt.dataset.active = result.text;
    ui['prompt-editor'].open = false;
    ended = false; lastSample = null; rowLimit = 20; renderDraw(null); renderSentence(); updateDistribution();
    setStatus(`${Math.round(result.ms)} ms`);
  } catch (error) {
    showError(error); setStatus('Retry available');
    if (!loaded) { ui['model-status'].textContent = 'Load failed'; ui.start.textContent = 'Retry'; }
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
      setStatus('End of text');
      dist = null; logits = null;
      ui.probabilities.replaceChildren();
      ui['distribution-summary'].textContent = 'End of text'; ui['table-caption'].textContent = ''; ui.more.hidden = true;
    } else await infer({ ids });
    return true;
  } catch (error) {
    generated.pop(); ids = oldIds; logits = oldLogits; currentText = oldText; ended = false;
    lastSample = generated.at(-1)?.snapshot || null; renderDraw(lastSample); renderSentence(); updateDistribution();
    showError(error); setStatus('Context restored'); autoplay = false;
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
    renderSentence(); if (logits) updateDistribution(); showError(error);
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
  try { await navigator.clipboard.writeText(displayText); ui.copy.textContent = 'Copied'; setTimeout(() => { ui.copy.textContent = 'Copy'; }, 1200); }
  catch { showError(new Error('Clipboard permission was unavailable. Select the text to copy it.')); }
});
updateDistribution();
