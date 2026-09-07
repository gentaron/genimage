import crypto from "node:crypto";

/**
 * Signed provider handles.
 *
 * There is no server-side job table: the browser holds its own history and
 * hands the provider handle back when it polls. That keeps the free path
 * completely stateless, but an unsigned handle would let anyone poll arbitrary
 * upstream request ids under our API key. So handles are HMAC-signed on the way
 * out and verified on the way back.
 */

function secret(): Buffer {
  const explicit = process.env.GENIMAGE_SECRET;
  if (explicit) return crypto.createHash("sha256").update(explicit).digest();

  // Any configured provider key is already a stable per-deployment secret.
  const derived = [
    process.env.FAL_KEY,
    process.env.REPLICATE_API_TOKEN,
    process.env.HF_TOKEN,
    process.env.NETLIFY_BLOBS_CONTEXT,
  ]
    .filter(Boolean)
    .join("|");
  if (derived) return crypto.createHash("sha256").update(derived).digest();

  // Nothing stable to derive from. A per-process key still signs correctly; it
  // only means in-flight jobs cannot be polled after a restart.
  const globalKey = globalThis as unknown as { __genimageHandleKey?: Buffer };
  return (globalKey.__genimageHandleKey ??= crypto.randomBytes(32));
}

export interface SignedHandle {
  data: string;
  sig: string;
}

export function signHandle(provider: string, handle: unknown): SignedHandle {
  const data = JSON.stringify({ provider, handle });
  const sig = crypto.createHmac("sha256", secret()).update(data).digest("base64url");
  return { data, sig };
}

/** Returns the handle only when the signature matches and the provider agrees. */
export function verifyHandle(provider: string, signed: unknown): unknown | null {
  const candidate = signed as Partial<SignedHandle> | null;
  if (!candidate || typeof candidate.data !== "string" || typeof candidate.sig !== "string") {
    return null;
  }

  const expected = crypto.createHmac("sha256", secret()).update(candidate.data).digest("base64url");
  const given = Buffer.from(candidate.sig);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return null;

  try {
    const parsed = JSON.parse(candidate.data) as { provider?: string; handle?: unknown };
    if (parsed.provider !== provider) return null;
    return parsed.handle ?? null;
  } catch {
    return null;
  }
}
