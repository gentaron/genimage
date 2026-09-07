import { encodePng } from "../png";
import {
  ProviderError,
  type GeneratedImage,
  type ImageProvider,
  type ProviderContext,
  type StartResult,
} from "./types";

/**
 * Offline preview renderer.
 *
 * Not a diffusion model — it paints a deterministic abstract composition from
 * the seed and prompt hash. It exists so the whole application (queue, history,
 * gallery, downloads, img2img plumbing) is exercisable with no GPU, no API key
 * and no network, and so a failed real provider still has somewhere to fall
 * back to during development.
 */

/** xorshift128 — small, fast, and identical across runs for a given seed. */
function makeRng(seed: number) {
  let a = (seed ^ 0x9e3779b9) >>> 0 || 1;
  let b = (seed * 0x85ebca6b) >>> 0 || 2;
  let c = (seed ^ 0xc2b2ae35) >>> 0 || 3;
  let d = (seed + 0x27d4eb2f) >>> 0 || 4;
  return () => {
    const t = (a ^ (a << 11)) >>> 0;
    a = b;
    b = c;
    c = d;
    d = ((d ^ (d >>> 19)) ^ (t ^ (t >>> 8))) >>> 0;
    return d / 0x100000000;
  };
}

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Correlation-free integer hash — a sine-based hash bands along diagonals. */
function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Two octaves of bilinear value noise — enough to break up flat gradients. */
function makeNoise(seed: number) {
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const octave = (x: number, y: number, cell: number, salt: number) => {
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    const fx = smooth((x / cell) - gx);
    const fy = smooth((y / cell) - gy);
    const a = hash2(gx, gy, seed + salt);
    const b = hash2(gx + 1, gy, seed + salt);
    const c = hash2(gx, gy + 1, seed + salt);
    const d = hash2(gx + 1, gy + 1, seed + salt);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
  return (x: number, y: number, cell: number) =>
    octave(x, y, cell, 0) * 0.65 + octave(x, y, cell / 3, 17) * 0.35;
}

interface Wash {
  x: number;
  y: number;
  /** Half-axes, so a wash can be an ellipse rather than only a circle. */
  rx: number;
  ry: number;
  rotation: number;
  color: [number, number, number];
  strength: number;
  /** Higher values give a harder edge; 2 is a plain gaussian. */
  falloff: number;
}

function render(width: number, height: number, seed: number, palette: string[]): Uint8Array {
  const rng = makeRng(seed);
  const noise = makeNoise(seed);
  const colors = palette.map(hexToRgb);
  const top = colors[0];
  const bottom = colors[colors.length - 1];
  const longest = Math.max(width, height);

  const washes: Wash[] = [];

  // Two broad atmospheric washes.
  for (let i = 0; i < 2; i++) {
    washes.push({
      x: rng() * width,
      y: rng() * height,
      rx: (0.45 + rng() * 0.35) * longest,
      ry: (0.45 + rng() * 0.35) * longest,
      rotation: rng() * Math.PI,
      color: colors[Math.floor(rng() * colors.length)],
      strength: 0.4 + rng() * 0.25,
      falloff: 2,
    });
  }

  // Three or four tighter focal shapes so compositions stay distinguishable.
  const focal = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < focal; i++) {
    const scale = 0.1 + rng() * 0.2;
    washes.push({
      x: (0.15 + rng() * 0.7) * width,
      y: (0.15 + rng() * 0.7) * height,
      rx: scale * longest,
      ry: scale * longest * (0.5 + rng()),
      rotation: rng() * Math.PI,
      color: colors[Math.floor(rng() * colors.length)],
      strength: 0.55 + rng() * 0.4,
      falloff: 3 + rng() * 3,
    });
  }

  const noiseCell = longest / 5;
  const sweep = rng() * Math.PI;
  const sweepX = Math.cos(sweep);
  const sweepY = Math.sin(sweep);

  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    const rowBase = mix(top, bottom, v * v * (3 - 2 * v));

    for (let x = 0; x < width; x++) {
      let [r, g, b] = rowBase;

      for (const wash of washes) {
        const dx = x - wash.x;
        const dy = y - wash.y;
        // Rotate into the wash's own frame before applying its half-axes.
        const rx = (dx * Math.cos(wash.rotation) + dy * Math.sin(wash.rotation)) / wash.rx;
        const ry = (-dx * Math.sin(wash.rotation) + dy * Math.cos(wash.rotation)) / wash.ry;
        const d = Math.sqrt(rx * rx + ry * ry);
        if (d > 2.2) continue;
        const amount = Math.exp(-Math.pow(d, wash.falloff)) * wash.strength;
        r += (wash.color[0] - r) * amount;
        g += (wash.color[1] - g) * amount;
        b += (wash.color[2] - b) * amount;
      }

      // Low-frequency luminance field: turns flat gradients into weather.
      const cloud = (noise(x, y, noiseCell) - 0.5) * 46;
      // Directional light sweep across the frame.
      const light = ((x / width) * sweepX + (y / height) * sweepY) * 26;

      // Vignette.
      const nx = (x / width - 0.5) * 2;
      const ny = (y / height - 0.5) * 2;
      const vignette = 1 - 0.42 * Math.min(1, (nx * nx + ny * ny) * 0.72);

      // Fine grain, uncorrelated between neighbouring pixels.
      const grain = (hash2(x, y, seed) - 0.5) * 11;

      const shade = cloud + light + grain;
      const i = (y * width + x) * 4;
      out[i] = Math.max(0, Math.min(255, (r + shade) * vignette));
      out[i + 1] = Math.max(0, Math.min(255, (g + shade) * vignette));
      out[i + 2] = Math.max(0, Math.min(255, (b + shade) * vignette));
      out[i + 3] = 255;
    }
  }
  return out;
}

export const previewProvider: ImageProvider = {
  id: "preview",
  label: "Offline preview",
  summary: "No GPU, no key, no network. Deterministic placeholder art for exercising the studio.",
  requiresKey: false,
  capabilities: {
    textToImage: true,
    imageToImage: true,
    upscale: true,
    loras: false,
    negativePrompt: false,
    seed: true,
    customSampler: false,
    batch: true,
    maxPixels: 2048 * 2048,
  },

  isConfigured() {
    return true;
  },

  async health() {
    return { available: true, detail: "always available" };
  },

  async start(ctx: ProviderContext): Promise<StartResult> {
    const { request: r } = ctx;
    const palette = [
      ctx.checkpoint.thumb[0],
      ...ctx.loras.map((l) => l.lora.thumb[0]),
      ctx.checkpoint.thumb[1],
    ];
    const promptHash = hashString(r.finalPrompt);

    const width = r.mode === "enhance" ? Math.round((r.width * r.upscale) / 8) * 8 : r.width;
    const height = r.mode === "enhance" ? Math.round((r.height * r.upscale) / 8) * 8 : r.height;

    const images: GeneratedImage[] = [];
    for (let i = 0; i < r.batchSize; i++) {
      if (ctx.signal.aborted) throw new ProviderError("Cancelled.");
      const seed = r.seed + i;
      const pixels = render(width, height, (seed ^ promptHash) >>> 0, palette);
      images.push({
        source: { kind: "bytes", bytes: encodePng(width, height, pixels), mimeType: "image/png" },
        seed,
        width,
        height,
      });
      // Yield so a batch does not block the event loop for the whole request.
      await new Promise((resolve) => setImmediate(resolve));
    }

    return {
      status: "done",
      images,
      warnings: [
        "Rendered by the offline preview provider — this is procedural placeholder art, not a diffusion model. " +
          "Connect ComfyUI (or set HF_TOKEN) for real generations.",
      ],
    };
  },
};
