# GenImage Studio

A self-hostable AI image generation studio built around Illustrious / NoobAI-XL
checkpoints and stacked LoRAs. Prompt composer with tag autocomplete, a LoRA
rack with per-adapter strength, aspect-ratio and sampler control, batch
rendering, job history and a gallery.

Everything runs on free software. The only thing you supply is a backend — and
if you have none, the studio still works.

```bash
npm install
npm run dev      # http://localhost:3000
```

No API key, no GPU and no configuration are needed to start: the studio falls
back to an offline renderer so every part of the app is usable immediately.
Connect ComfyUI when you want real diffusion output.

---

## Backends

The studio talks to whichever backend is reachable, in this order. `Auto` picks
the first available one; the header pill shows which one won.

| Backend | Cost | LoRAs applied | img2img / upscale | Setup |
|---|---|---|---|---|
| **ComfyUI** | free, local | **yes** | yes | run ComfyUI, set `COMFYUI_URL` |
| **Hugging Face** | free tier | no | no | set `HF_TOKEN` |
| **Pollinations** | free, keyless | no | no | nothing |
| **Offline preview** | free | no | yes | nothing |

Only ComfyUI loads LoRA weights. The hosted free tiers run their own models, so
a render there uses your prompt and the LoRA trigger words but not the weights —
the job says so in a warning rather than pretending otherwise.

The offline preview provider is **not a diffusion model**. It paints
deterministic abstract art from the seed and prompt hash so the queue, history,
gallery, downloads and img2img plumbing can be exercised with no GPU and no
network. Every image it produces is labelled.

### Running the real stack

```bash
# 1. Start ComfyUI
python main.py --listen 127.0.0.1 --port 8188

# 2. Point the studio at it
echo 'COMFYUI_URL=http://127.0.0.1:8188' >> .env.local

# 3. Restart, or hit the refresh button in the header
```

Place the model files where ComfyUI expects them, using these exact names (or
edit `src/lib/catalog.ts` to match what you already have):

**`ComfyUI/models/checkpoints/`**

| File | Notes |
|---|---|
| `coco-Illustrious-NoobXL-Style-v2.0.safetensors` | NoobAI-XL, CLIP skip 2, Danbooru tags |
| `sd_xl_base_1.0.safetensors` | SDXL baseline |
| `flux1-schnell.safetensors` | Apache-2.0, 4-step |

**`ComfyUI/models/loras/`**

| File | Kind | Default strength |
|---|---|---|
| `shexyo_v3.safetensors` | style | 0.70 |
| `Hyper-SDXL-8steps-lora.safetensors` | accelerator | 1.00 |
| `trt_style_illustrious.safetensors` | style | 0.80 |
| `add-detail-xl.safetensors` | concept (slider) | 0.50 |

The catalog ships the metadata, not the weights — download those yourself from
wherever you normally get them.

---

## How it works

```
Browser ──POST /api/generate──▶ engine.resolveRequest()   validate · defaults · safety gate
                                        │
                                        ▼
                                  in-process queue         priority, concurrency 1 by default
                                        │
                                        ▼
                                  provider.generate()      ComfyUI · HF · Pollinations · preview
                                        │
                                        ▼
Browser ◀──poll /api/jobs/[id]──  store: data/outputs/*.png + jobs.json
```

| Path | Role |
|---|---|
| `src/lib/catalog.ts` | Checkpoints, LoRAs, aspect ratios. The single source of truth for both the UI and the backends. |
| `src/lib/engine.ts` | Request validation, defaulting, the queue, the worker. |
| `src/lib/workflow.ts` | Builds ComfyUI API graphs — the LoRA chain, CLIP skip, img2img and hires-fix branches. |
| `src/lib/providers/` | One module per backend behind a shared interface with a declared capability set. |
| `src/lib/store.ts` | Filesystem-backed job history and image storage. |
| `src/lib/safety.ts` | The prompt gate. |
| `src/lib/tags.ts` | Autocomplete dictionary and the natural-language → tags lexicon. |

State lives on disk under `data/` (gitignored). Nothing needs a database; the
store's exported surface is small enough to swap for one later.

### The LoRA chain

Each selected LoRA becomes a `LoraLoader` consuming the previous model/CLIP
pair, so ordering is meaningful and the stack can be any length:

```
CheckpointLoaderSimple ─▶ LoraLoader(shexyo) ─▶ LoraLoader(trt) ─▶ LoraLoader(hyper) ─▶ KSampler
```

### Accelerator LoRAs

`Hyper SDXL` is step-distilled, so enabling it replaces the checkpoint's sampler
defaults with its own profile — 8 steps, CFG 1.0, `euler` / `sgm_uniform`. The
sidebar says so, and explicit overrides still win but warn when they leave the
distilled range.

### Modes

- **Generate** — text to image.
- **Edit** — img2img from the reference; the Variation slider is the denoise strength.
- **Enhance** — hires fix: the reference is upscaled and lightly re-denoised so
  the new pixels carry detail rather than interpolation.

Modes a backend cannot serve are marked in the tab bar rather than failing at
submit time.

---

## Configuration

Copy `.env.example` to `.env.local` and edit. Every value has a working default;
see that file for the full list.

Useful ones:

| Variable | Default | Effect |
|---|---|---|
| `COMFYUI_URL` | `http://127.0.0.1:8188` | ComfyUI endpoint |
| `HF_TOKEN` | — | Enables the Hugging Face backend |
| `GENIMAGE_DATA_DIR` | `./data` | Where images and history are written |
| `GENIMAGE_CONCURRENCY` | `1` | Simultaneous renders |
| `GENIMAGE_MAX_HISTORY` | `500` | Jobs kept before the oldest are pruned |
| `GENIMAGE_SFW_ONLY` | `0` | `1` blocks explicit content instance-wide |

---

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/generate` | Queue a job. Returns `202` with the job record. |
| `GET /api/jobs?limit&offset` | History, newest first. |
| `GET /api/jobs/[id]` | Poll one job. |
| `DELETE /api/jobs/[id]?action=cancel` | Cancel a running job. |
| `DELETE /api/jobs/[id]` | Delete a job and its images. |
| `GET /api/images/[id]` | Image bytes. `?download` sets the attachment header. |
| `POST /api/upload` | Reference image (multipart, field `image`). |
| `GET /api/catalog` | Checkpoints, LoRAs, ratios, boosters, backend health. |
| `GET /api/tags?q=` | Autocomplete. |
| `POST /api/prompt` | Prompt Helper: natural language → tags. |

---

## Content policy

Prompts that combine a minor descriptor with sexual content are rejected on the
server, before anything is queued. This check is not configurable and applies to
the Prompt Helper's own output as well.

`GENIMAGE_SFW_ONLY=1` additionally blocks all explicit content, which is the
right setting for a shared instance.

Beyond that, what a self-hosted instance generates is the operator's
responsibility — as is respecting the licence of every checkpoint and LoRA you
install. Several popular anime checkpoints carry redistribution and commercial
restrictions.

---

## Development

```bash
npm run dev        # dev server
npm run build      # production build
npm run start      # serve the build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

Stack: Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4.
No runtime dependencies beyond those — the PNG encoder, queue and store are all
in-tree.
