import { promises as fs } from "node:fs";
import path from "node:path";
import type { Storage } from "./types";

/** Local disk. Used when the studio runs on a normal server or in `next dev`. */
export function filesystemStorage(root: string): Storage {
  const resolved = path.resolve(root);

  // Keys are opaque to callers, so refuse anything that could escape the root.
  const fileFor = (key: string) => {
    const full = path.join(resolved, key.replace(/[^A-Za-z0-9._/-]/g, "_"));
    if (!full.startsWith(resolved + path.sep)) throw new Error("Invalid storage key.");
    return full;
  };

  return {
    id: `filesystem(${resolved})`,

    async get(key) {
      try {
        const file = fileFor(key);
        const [bytes, meta] = await Promise.all([
          fs.readFile(file),
          fs.readFile(`${file}.type`, "utf8").catch(() => "application/octet-stream"),
        ]);
        return { bytes, mimeType: meta.trim() };
      } catch {
        return null;
      }
    },

    async set(key, bytes, mimeType) {
      const file = fileFor(key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, bytes);
      await fs.writeFile(`${file}.type`, mimeType, "utf8");
    },

    async delete(key) {
      const file = fileFor(key);
      await Promise.all([
        fs.rm(file, { force: true }),
        fs.rm(`${file}.type`, { force: true }),
      ]);
    },
  };
}
