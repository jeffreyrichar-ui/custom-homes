export type ScrapeInput = {
  brand: string;
  sku?: string | null;
  style?: string | null;
  color?: string | null;
  /** Free-text size like "12x24", "0.5x4". Optional. */
  size?: string | null;
  /** Notes from the entry — we mine it for shape + size hints. */
  notes?: string | null;
};

export type ScrapeResult = {
  imageBuffer: Buffer;
  contentType: string;
  sourceUrl: string;
};

export type Scraper = {
  brand: string; // canonical brand/manufacturer name
  matches(brand: string): boolean;
  scrape(input: ScrapeInput): Promise<ScrapeResult | null>;
};

export class ScrapeError extends Error {
  public override cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

/**
 * Shape is the critical disambiguator — the pattern compositor uses the
 * image as a tile texture, and a circle laid out in a rectangular grid
 * looks wrong. Within a single shape (e.g. 2x10 vs 3x12 rectangle), the
 * image is close enough; across shapes (circle vs rectangle vs hex) the
 * match has to be exact.
 *
 * Detection priority:
 *   1. Named shapes mentioned anywhere (penny round, hex, picket, etc.)
 *   2. Dimensional inference (AxB with A≈B → square, A≠B → rectangle)
 */
export function extractShape(input: ScrapeInput): string | null {
  const haystack = [input.style, input.color, input.notes]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const namedShapes: Array<{ pat: RegExp; label: string }> = [
    { pat: /\bpenny\s*round\b|\bpenny\b/, label: "penny round" },
    { pat: /\bhex\b|\bhexagon\b/, label: "hexagon" },
    { pat: /\bpicket\b/, label: "picket" },
    { pat: /\btrapezoid\b/, label: "trapezoid" },
    { pat: /\bsubway\b/, label: "subway" },
    { pat: /\bpalladiana\b/, label: "palladiana mosaic" },
    { pat: /\bmosaic\b/, label: "mosaic" },
    { pat: /\bfan(\s+undulated)?\b/, label: "fan" },
  ];
  for (const { pat, label } of namedShapes) {
    if (pat.test(haystack)) return label;
  }

  // Dimensional inference. Skip if the dim is part of "X inch" wording.
  const dim = haystack.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/);
  if (dim) {
    const a = parseFloat(dim[1]!);
    const b = parseFloat(dim[2]!);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      if (Math.abs(a - b) < 0.5) return "square";
      return "rectangle";
    }
  }
  return null;
}

/** Just the raw size token, e.g. "12x24" or "0.5x4". */
export function extractSize(input: ScrapeInput): string {
  if (input.size) return input.size.replace(/\s+/g, "");
  const notes = input.notes ?? "";
  const dim = notes.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/);
  return dim ? `${dim[1]}x${dim[2]}` : "";
}

/**
 * Build a search query weighted toward shape match.
 *
 * Order is deliberate: shape first because that's the disambiguator,
 * then style + color + sku to narrow within the shape, then size as
 * a tiebreaker. Search engines weight earlier terms more heavily.
 */
export function searchQuery(input: ScrapeInput): string {
  const shape = extractShape(input);
  const size = extractSize(input);
  return [shape, input.style, input.color, input.sku, size]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
