/**
 * Tile shape detection — used by both the scraper (to disambiguate
 * product variants) and the pattern compositor (to render the right
 * geometry). Shared between server and client.
 */

export type TileShape =
  | "penny round"
  | "hexagon"
  | "picket"
  | "trapezoid"
  | "subway"
  | "palladiana mosaic"
  | "mosaic"
  | "fan"
  | "square"
  | "rectangle"
  | "unknown";

export type ShapeInput = {
  style?: string | null;
  color?: string | null;
  notes?: string | null;
  pattern?: string | null;
  size?: string | null;
};

/**
 * Returns the most specific shape that matches the input.
 * Detection priority:
 *   1. Named shapes mentioned anywhere (penny round, hex, picket, etc.)
 *   2. Dimensional inference (AxB with A≈B → square, A≠B → rectangle)
 *   3. "unknown" when no signal
 */
export function detectShape(input: ShapeInput): TileShape {
  const haystack = [input.style, input.color, input.notes, input.pattern, input.size]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const namedShapes: Array<{ pat: RegExp; label: TileShape }> = [
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

  // Dimensional inference
  const dim = haystack.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/);
  if (dim) {
    const a = parseFloat(dim[1]!);
    const b = parseFloat(dim[2]!);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      if (Math.abs(a - b) < 0.5) return "square";
      return "rectangle";
    }
  }

  return "unknown";
}

/** Extract a tile aspect ratio (width / height) from notes when present. */
export function detectAspect(input: ShapeInput): number {
  const haystack = [input.notes, input.size].filter(Boolean).join(" ");
  const dim = haystack.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/);
  if (!dim) return 2; // default rectangle aspect
  const a = parseFloat(dim[1]!);
  const b = parseFloat(dim[2]!);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0 || b === 0) return 2;
  return a / b;
}
