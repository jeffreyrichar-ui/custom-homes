import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Phase 3 uses local disk for image storage. Production will plug in
 * Cloudflare R2 or S3 by implementing the same `ImageStorage` contract.
 */
export type ImageStorage = {
  /** Persist a buffer; returns the public URL clients can fetch. */
  put(key: string, buf: Buffer, contentType: string): Promise<string>;
  /** Returns the public URL for a previously-stored key, or null. */
  urlFor(key: string): Promise<string | null>;
};

export type LocalStorageOptions = {
  rootDir: string; // absolute filesystem path
  publicPrefix: string; // e.g. "/uploads"
};

export function makeLocalStorage(opts: LocalStorageOptions): ImageStorage {
  const fsRoot = opts.rootDir;
  return {
    async put(key, buf, contentType) {
      const ext = extFor(contentType);
      const filename = `${slug(key)}${ext}`;
      const full = path.join(fsRoot, filename);
      await fs.mkdir(fsRoot, { recursive: true });
      await fs.writeFile(full, buf);
      return `${opts.publicPrefix}/${filename}`;
    },
    async urlFor(key) {
      const dir = await fs.readdir(fsRoot).catch(() => [] as string[]);
      const prefix = slug(key);
      const match = dir.find((f) => f.startsWith(prefix + "."));
      return match ? `${opts.publicPrefix}/${match}` : null;
    },
  };
}

function extFor(contentType: string): string {
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("avif")) return ".avif";
  if (contentType.includes("gif")) return ".gif";
  return ".jpg";
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function defaultLocalStorage(): { storage: ImageStorage; serveDir: string; publicPrefix: string } {
  const serveDir = path.resolve(__dirname, "../../uploads");
  const publicPrefix = "/uploads";
  return { storage: makeLocalStorage({ rootDir: serveDir, publicPrefix }), serveDir, publicPrefix };
}

export function imageKey(brand: string, sku: string): string {
  return `${brand}__${sku}`;
}
