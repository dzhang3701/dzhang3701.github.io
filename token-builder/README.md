# Token builder

A static token-by-token text generation playground at https://dzhang3701.github.io/token-builder/.

It runs the actual quantized DistilGPT-2 model in a browser Web Worker with Transformers.js 3.8.1 and ONNX Runtime WASM. No API key or inference server is used. Model/tokenizer assets are downloaded from the public `Xenova/distilgpt2` repository at revision `a41c10485c18a64b6606729b6a082330cbd8f49e`; model weights are approximately 85 MB and are cached by the runtime. The JavaScript and WASM runtime are fetched from the pinned jsDelivr package. Prompt text is not transmitted for inference.

## Features

- Real, complete 50,257-token logits and vocabulary search.
- Model probabilities alongside final sampling probabilities.
- Temperature, top-k, and top-p controls; filters apply in that order and renormalize.
- Single-token sampling, greedy choice, manual selection, and a stoppable 20-token run.
- Inverse-CDF visualization showing the uniform random draw and selected interval. Long-tail tokens remain eligible and are split out individually if sampled.
- Token history, click-to-rewind, undo, reset, and copy.
- Responsive layout and reduced-motion support.

## Run locally

Serve the repository root over HTTP, then open `/token-builder/`:

```sh
python3 -m http.server 8000
```

Run sampling tests with Node.js:

```sh
node --test token-builder/sampling.test.mjs
```

GitHub Pages serves this folder directly; no build is needed. The 512-token context cap keeps CPU inference practical. The full prefix is recomputed for each token so rewinds and manual picks use the exact token history. The model is small and older, so its continuations are less capable than modern chat models.

Inspired by [LMVIZ's probabilities playground](https://lmviz.com/probabilities). All interface code here is original.
