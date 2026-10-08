import { AutoTokenizer, AutoModelForCausalLM, Tensor, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';

const MODEL = 'Xenova/distilgpt2';
const REVISION = 'a41c10485c18a64b6606729b6a082330cbd8f49e';
env.allowLocalModels = false;
// GitHub Pages cannot set the isolation headers required by WASM threads.
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
let model, tokenizer, loadPromise;

async function load() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const progress_callback = (progress) => self.postMessage({ type: 'progress', progress });
    [tokenizer, model] = await Promise.all([
      AutoTokenizer.from_pretrained(MODEL, { revision: REVISION }),
      AutoModelForCausalLM.from_pretrained(MODEL, { revision: REVISION, dtype: 'q8', device: 'wasm', progress_callback }),
    ]);
    const vocabulary = Array.from({ length: model.config.vocab_size }, (_, id) => tokenizer.decode([id], { skip_special_tokens: false, clean_up_tokenization_spaces: false }));
    self.postMessage({ type: 'vocabulary', vocabulary, eos: tokenizer.eos_token_id });
  })();
  try { await loadPromise; } catch (error) { loadPromise = null; throw error; }
}

self.onmessage = async ({ data }) => {
  const { requestId, type } = data;
  try {
    await load();
    if (type === 'load') { self.postMessage({ type: 'result', requestId, result: { model: MODEL } }); return; }
    let ids = data.ids;
    if (typeof data.prompt === 'string') ids = Array.from(tokenizer(data.prompt).input_ids.data, Number);
    if (!ids?.length) throw new Error('Enter a non-empty prompt.');
    if (ids.length > 512) throw new Error('This demo supports up to 512 context tokens. Shorten the prompt or rewind.');
    if (type === 'decode') {
      self.postMessage({ type: 'result', requestId, result: { ids, text: tokenizer.decode(ids, { skip_special_tokens: false, clean_up_tokenization_spaces: false }) } });
      return;
    }
    const start = performance.now();
    const outputs = await model({
      input_ids: new Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
      attention_mask: new Tensor('int64', new BigInt64Array(ids.length).fill(1n), [1, ids.length]),
    });
    const logits = outputs.logits;
    const size = logits.dims.at(-1);
    const lastLogits = Float32Array.from(logits.data.subarray(logits.data.length - size));
    const ms = performance.now() - start;
    const text = tokenizer.decode(ids, { skip_special_tokens: false, clean_up_tokenization_spaces: false });
    // Only last-position logits leave the worker; unused outputs can be reclaimed.
    for (const tensor of Object.values(outputs)) if (typeof tensor?.dispose === 'function') tensor.dispose();
    self.postMessage({ type: 'result', requestId, result: { ids, text, logits: lastLogits, ms } }, [lastLogits.buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', requestId, message: error.message || String(error) });
  }
};
