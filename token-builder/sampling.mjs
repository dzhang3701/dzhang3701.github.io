// Pure sampling math, shared by the UI and numerical tests.
export function softmax(logits, temperature = 1) {
  if (!logits.length || !Number.isFinite(temperature) || temperature < 0) throw new Error('Invalid logits or temperature.');
  let max = -Infinity, argmax = 0;
  for (let i = 0; i < logits.length; i++) {
    if (!Number.isFinite(logits[i])) throw new Error('Model produced a non-finite logit.');
    if (logits[i] > max) { max = logits[i]; argmax = i; }
  }
  const probs = new Float64Array(logits.length);
  if (temperature === 0) { probs[argmax] = 1; return probs; }
  let total = 0;
  for (let i = 0; i < logits.length; i++) total += probs[i] = Math.exp((logits[i] - max) / temperature);
  for (let i = 0; i < probs.length; i++) probs[i] /= total;
  return probs;
}

export function distribution(logits, { temperature = 1, topK = 0, topP = 1 } = {}) {
  if (!Number.isInteger(topK) || topK < 0 || !Number.isFinite(topP) || topP <= 0 || topP > 1) throw new Error('Invalid sampling settings.');
  const raw = softmax(logits);
  const tempered = softmax(logits, temperature);
  const order = Array.from(logits, (_, i) => i).sort((a, b) => logits[b] - logits[a] || a - b);
  const kOrder = topK > 0 ? order.slice(0, topK) : order;
  // Nucleus probabilities are evaluated after top-k has been renormalized.
  let kMass = 0;
  for (const id of kOrder) kMass += tempered[id];
  const kept = [];
  let mass = 0;
  for (const id of kOrder) {
    if (tempered[id] === 0) break;
    kept.push(id);
    mass += tempered[id];
    if (topP < 1 && mass / kMass >= topP) break;
  }
  const final = new Float64Array(logits.length);
  for (const id of kept) final[id] = tempered[id] / mass;
  const entropy = kept.reduce((h, id) => h - final[id] * Math.log2(final[id]), 0);
  return { raw, tempered, final, order, kept, entropy };
}

export function drawToken(dist, u) {
  if (!Number.isFinite(u) || u < 0 || u >= 1) throw new Error('The uniform draw must be in [0, 1).');
  let cumulative = 0;
  for (let i = 0; i < dist.kept.length; i++) {
    const id = dist.kept[i], low = cumulative;
    cumulative += dist.final[id];
    if (u < cumulative || i === dist.kept.length - 1) return { id, low, high: cumulative, u };
  }
  throw new Error('No token available to sample.');
}

export function intervalForToken(dist, id) {
  let low = 0;
  for (const candidate of dist.kept) {
    const high = low + dist.final[candidate];
    if (candidate === id) return { id, low, high };
    low = high;
  }
  return { id, low: null, high: null };
}
