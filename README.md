# GenImage Studio

An AI image generation studio built around Illustrious / NoobAI-XL checkpoints
and stacked LoRAs. Prompt composer with tag autocomplete, a LoRA rack with
per-adapter strength, aspect-ratio and sampler control, batch rendering, job
history and a gallery.

It deploys to Netlify as-is, with no database and no server to keep running.

```bash
npm install
npm run dev      # http://localhost:3000
```

No API key, no GPU and no configuration are needed to start.

## Read this before choosing a backend

**Free and LoRA-capable do not overlap in the cloud.** Free hosted image APIs
run their own weights; they cannot load your `.safetensors`. Applying the real
LoRA stack means one of:

- **your own GPU** — ComfyUI, free, but not reachable from a cloud deployment, or
- **a paid hosted GPU** — fal.ai or Replicate, billed per second (both give new
  accounts a small credit).

The studio supports all of it and is explicit at every step about which one you
are on: the backend picker labels each option, and any job whose LoRA weights
were not applied says so on the result.

---

## Backends

The studio talks to whichever backend is reachable, in this order. `Auto` picks
the first available one; the header pill shows which one won.

| Backend | Cost | LoRA weights | Works on Netlify | Setup |
|---|---|---|---|---|
| **fal.ai** | paid per second | **yes** | yes | `FAL_KEY` + `GENIMAGE_WEIGHTS` |
| **Replicate** | paid per second | **yes** | yes | `REPLICATE_API_TOKEN` + `GENIMAGE_WEIGHTS` |
| **ComfyUI** | free | **yes** | no — local only | run ComfyUI, set `COMFYUI_URL` |
| **Hugging Face** | small free credit | no | yes | `HF_TOKEN` |
| **Pollinations** | free, keyless | no | yes | nothing |
| **Offline renderer** | free | no | yes | nothing |

`Auto` walks that list top to bottom and picks the first backend that is both
configured and reachable.

The offline renderer is **not a diffusion model**. It paints deterministic
abstract art from the seed and prompt hash so the whole app is usable with no
GPU, key or network. Every image it produces is labelled as such.

### LoRAs on a cloud backend

fal and Replicate fetch weights over HTTP, so each model needs a public URL.
The catalog ships no URLs — these checkpoints and LoRAs are distributed under
licences that make rehosting your call — so point `GENIMAGE_WEIGHTS` at your own
copies, keyed by catalog id:

```bash
GENIMAGE_WEIGHTS='{
  "coco-illustrious-noobxl-style": "https://…/coco-Illustrious-NoobXL-Style-v2.0.safetensors",
  "shexyo-v3":                     "https://…/shexyo_v3.safetensors",
  "trt-style-illustrious":         "https://…/trt_style_illustrious.safetensors",
  "hyper-sdxl":                    "https://…/Hyper-SDXL-8steps-lora.safetensors"
}'
```

A LoRA with no URL is skipped and the job says which one and why, rather than
quietly rendering without it.

### Running it free, on your own GPU

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

There is no job queue, no worker process and no database. That is what lets the
same code run on a laptop and on a serverless host.

```
Browser ──POST /api/generate──▶ resolve · validate · safety gate
                                        │
                                        ▼
                                 provider.start()
                                        │
                   ┌────────────────────┴────────────────────┐
                   ▼                                         ▼
            finished inline                           accepted upstream
       (Pollinations, offline)                    (fal, Replicate, ComfyUI)
                   │                                         │
                   │                              signed handle → browser
                   │                                         │
                   │                        POST /api/poll ──┴──▶ provider.poll()
                   ▼                                         ▼
        image URLs, or bytes in blob storage ──▶ browser renders them
```

Three consequences worth knowing:

- **Job history lives in the browser.** The server keeps no job table. A record
  is small JSON; the pixels it points at are elsewhere.
- **Provider handles are HMAC-signed.** The browser round-trips the handle when
  it polls, so it is signed on the way out and verified on the way back —
  otherwise anyone could poll arbitrary upstream requests under your API key.
- **URL-backed backends never move bytes through the server.** For Pollinations
  the URL *is* the render: the browser asks the provider directly. That is why
  it costs no storage and cannot time out a function.

| Path | Role |
|---|---|
| `src/lib/catalog.ts` | Checkpoints, LoRAs, aspect ratios, weight-URL resolution. |
| `src/lib/engine.ts` | Request validation, defaulting, `submit` / `advance` / `abandon`. |
| `src/lib/handle.ts` | Signs and verifies provider handles. |
| `src/lib/workflow.ts` | Builds ComfyUI API graphs — LoRA chain, CLIP skip, img2img, hires fix. |
| `src/lib/providers/` | One module per backend behind a shared `start`/`poll`/`cancel` interface. |
| `src/lib/storage/` | Netlify Blobs, local filesystem, or in-memory — chosen at runtime. |
| `src/lib/safety.ts` | The prompt gate. |
| `src/lib/tags.ts` | Autocomplete dictionary and the natural-language → tags lexicon. |

### Storage

Only backends that hand back raw bytes need storage. The backend is picked
automatically: **Netlify Blobs** when running on Netlify (no configuration
needed), the local filesystem otherwise. If a write is rejected — the read-only
filesystem you get on any serverless host — it falls back to memory and logs
it, so a finished render is never thrown away.

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

## Deploying to Netlify

Connect the repository and deploy — `netlify.toml` has the build settings and
Blobs needs no configuration. With no environment variables at all the site
works: Pollinations serves free, keyless images.

To get your LoRA stack applied, add under **Site configuration → Environment
variables**:

| Variable | Why |
|---|---|
| `FAL_KEY` *or* `REPLICATE_API_TOKEN` | A hosted GPU that loads LoRA weights (paid) |
| `GENIMAGE_WEIGHTS` | Public URLs for your checkpoint and LoRA files |
| `GENIMAGE_SECRET` | Any random string; signs the provider handles |
| `GENIMAGE_SFW_ONLY=1` | If the deployment is public |

What does **not** work on Netlify, by design: ComfyUI (the function cannot reach
a GPU on your desk) and Hugging Face inference on large images (a single
blocking call can outlast the function budget). Both stay available for local
and self-hosted runs.

## Configuration

Copy `.env.example` to `.env.local` and edit. Every value has a working default;
see that file for the full list.

Useful ones:

| Variable | Default | Effect |
|---|---|---|
| `FAL_KEY` | — | Enables fal.ai (paid, applies LoRAs) |
| `REPLICATE_API_TOKEN` | — | Enables Replicate (paid, applies LoRAs) |
| `GENIMAGE_WEIGHTS` | — | JSON map of catalog id → public weights URL |
| `COMFYUI_URL` | `http://127.0.0.1:8188` | Local ComfyUI endpoint |
| `HF_TOKEN` | — | Enables the Hugging Face backend |
| `GENIMAGE_SECRET` | derived from your provider keys | Signs provider handles |
| `GENIMAGE_STORAGE` | auto | `netlify`, `filesystem` or `memory` |
| `GENIMAGE_DATA_DIR` | `./data` | Where the filesystem backend writes |
| `GENIMAGE_SFW_ONLY` | `0` | `1` blocks explicit content instance-wide |

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/generate` | Validate and start a render. Returns the job — finished, or running with a signed handle. |
| `POST /api/poll` | Advance running jobs. Body is `{ jobs: Job[] }`; the signed handle authorises each poll. |
| `POST /api/cancel` | Stop a pending job upstream — the thing that stops a per-second bill. |
| `GET /api/images/[id]` | Bytes we stored. `?download` sets the attachment header. |
| `POST /api/upload` | Reference image (multipart, field `image`). |
| `GET /api/catalog` | Checkpoints, LoRAs, ratios, boosters, backend health. |
| `GET /api/tags?q=` | Autocomplete. |
| `POST /api/prompt` | Prompt Helper: natural language → tags. |

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

Stack: Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4
· `@netlify/blobs`. The PNG encoder, tag dictionary and storage layer are all
in-tree.

The cloud backends were developed against mock servers implementing fal's queue
protocol and Replicate's predictions API, and the ComfyUI graphs against a mock
ComfyUI. They have not been exercised against the live services from this
machine, so treat the first real run as the acceptance test.
