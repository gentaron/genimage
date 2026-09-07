import type { ProviderContext } from "./providers/types";

/**
 * Builds ComfyUI API-format graphs.
 *
 * A graph is a flat map of node id → `{ class_type, inputs }`, where an input
 * wired to another node is the tuple `[nodeId, outputIndex]`. We build the
 * chain explicitly rather than templating a saved workflow so the LoRA stack
 * can be any length.
 */

export type NodeRef = [string, number];
export type NodeInput = string | number | boolean | NodeRef;
export interface ComfyNode {
  class_type: string;
  inputs: Record<string, NodeInput>;
  _meta?: { title: string };
}
export type ComfyGraph = Record<string, ComfyNode>;

class GraphBuilder {
  private nodes: ComfyGraph = {};
  private next = 1;

  add(classType: string, inputs: Record<string, NodeInput>, title?: string): string {
    const id = String(this.next++);
    this.nodes[id] = { class_type: classType, inputs, ...(title ? { _meta: { title } } : {}) };
    return id;
  }

  build(): ComfyGraph {
    return this.nodes;
  }
}

export interface BuiltWorkflow {
  graph: ComfyGraph;
  /** Node whose output images we collect from `/history`. */
  outputNodeId: string;
  /** Node that reports KSampler progress, for the websocket listener. */
  samplerNodeId: string;
}

/**
 * @param uploadedName Filename returned by ComfyUI's `/upload/image`, required
 *   for edit and enhance modes.
 */
export function buildWorkflow(ctx: ProviderContext, uploadedName: string | null): BuiltWorkflow {
  const { request: r, checkpoint, loras } = ctx;
  const g = new GraphBuilder();

  const checkpointNode = g.add(
    "CheckpointLoaderSimple",
    { ckpt_name: checkpoint.file },
    checkpoint.name,
  );

  let modelRef: NodeRef = [checkpointNode, 0];
  let clipRef: NodeRef = [checkpointNode, 1];
  const vaeRef: NodeRef = [checkpointNode, 2];

  // LoRA chain. Order matters: each loader consumes the previous model/clip
  // pair, so the last entry in the list is applied last.
  for (const { lora, strength, clipStrength } of loras) {
    const node = g.add(
      "LoraLoader",
      {
        lora_name: lora.file,
        strength_model: strength,
        strength_clip: clipStrength,
        model: modelRef,
        clip: clipRef,
      },
      `${lora.name}${lora.version ? ` ${lora.version}` : ""}`,
    );
    modelRef = [node, 0];
    clipRef = [node, 1];
  }

  // CLIP skip is expressed as a negative layer index in ComfyUI.
  if (r.clipSkip > 1) {
    const skip = g.add("CLIPSetLastLayer", {
      stop_at_clip_layer: -Math.abs(r.clipSkip),
      clip: clipRef,
    });
    clipRef = [skip, 0];
  }

  const positive = g.add("CLIPTextEncode", { text: r.finalPrompt, clip: clipRef }, "Positive");
  const negative = g.add("CLIPTextEncode", { text: r.finalNegativePrompt, clip: clipRef }, "Negative");

  let latentRef: NodeRef;
  let denoise = 1;

  if (r.mode === "generate" || !uploadedName) {
    latentRef = [
      g.add("EmptyLatentImage", { width: r.width, height: r.height, batch_size: r.batchSize }),
      0,
    ];
  } else {
    const load = g.add("LoadImage", { image: uploadedName, upload: "image" }, "Reference");
    let imageRef: NodeRef = [load, 0];

    if (r.mode === "enhance" && r.upscale > 1) {
      // Latent-space hires fix: scale the pixels first, then re-denoise lightly
      // so the extra resolution carries real detail instead of interpolation.
      const scaled = g.add("ImageScaleBy", {
        upscale_method: "lanczos",
        scale_by: r.upscale,
        image: imageRef,
      });
      imageRef = [scaled, 0];
    } else {
      // Edit mode: conform the reference to the requested canvas.
      const scaled = g.add("ImageScale", {
        upscale_method: "lanczos",
        width: r.width,
        height: r.height,
        crop: "center",
        image: imageRef,
      });
      imageRef = [scaled, 0];
    }

    const encoded = g.add("VAEEncode", { pixels: imageRef, vae: vaeRef });
    latentRef = [encoded, 0];
    denoise = r.mode === "enhance" ? Math.min(r.denoise, 0.45) : r.denoise;

    if (r.batchSize > 1) {
      const repeated = g.add("RepeatLatentBatch", { samples: latentRef, amount: r.batchSize });
      latentRef = [repeated, 0];
    }
  }

  const sampler = g.add(
    "KSampler",
    {
      seed: r.seed,
      steps: r.steps,
      cfg: r.cfg,
      sampler_name: r.sampler,
      scheduler: r.scheduler,
      denoise,
      model: modelRef,
      positive: [positive, 0],
      negative: [negative, 0],
      latent_image: latentRef,
    },
    "Sampler",
  );

  const decode = g.add("VAEDecode", { samples: [sampler, 0], vae: vaeRef });
  const save = g.add("SaveImage", { filename_prefix: "genimage", images: [decode, 0] }, "Output");

  return { graph: g.build(), outputNodeId: save, samplerNodeId: sampler };
}
