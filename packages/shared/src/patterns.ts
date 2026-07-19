/**
 * Tile pattern normalization — converts Tamara's free-text pattern strings
 * (as written in her spreadsheets) into a small canonical set of render-mode
 * IDs that both the React/SVG compositor and the server-side PDF renderer
 * understand. Shared so client and server produce identical visuals.
 *
 * Mapping rules (highest specificity wins):
 *   1. Named layouts: herringbone, parquet, lattice, checkerboard, stripes,
 *      random — these always trump orientation hints.
 *   2. Offset: 30/70 (asymmetric horizontal stagger), staggered (50% stagger,
 *      orientation-aware).
 *   3. Orientation only: vertical → straight-vertical, horizontal →
 *      straight-horizontal.
 *   4. Anchoring ("parallel with vanity"), coverage ("cut to fit", "full size
 *      tile", "to ceiling", "see attached"), and backsplash height strings
 *      ("6 inch splash", "1/2 sheet splash") all fall through to "straight".
 */

export const RENDER_MODES = [
  "straight",
  "straight-vertical",
  "straight-horizontal",
  "staggered-horizontal",
  "staggered-vertical",
  "30-70",
  "alternating-rows",
  "herringbone",
  "checkerboard-on-point",
  "parquet",
  "lattice",
  "stripes-vertical",
  "random",
] as const;

export type RenderMode = (typeof RENDER_MODES)[number];

/**
 * Tamara's canonical dropdown vocabulary, in display order. The verbatim
 * strings here are what gets persisted to `tile_entries.pattern`; the
 * renderer normalizes them on read.
 */
export const TAMARA_PATTERN_OPTIONS = [
  "",
  "set straight",
  "set vertical straight",
  "set horizontal straight",
  "set straight parallel with vanity",
  "set horizontal staggered",
  "set 30/70",
  "one row straight + one row horizontal repeat",
  "1/2 x 1 herringbone",
  "set checkerboard on point",
  "4 vertical + 4 horizontal parquet design",
  "Lattice",
  "set vertical stripes",
  "6x6 set random, all vertical",
] as const;

/**
 * Normalize a free-text pattern string to a render-mode ID. Null / empty /
 * unparseable inputs map to "straight".
 */
export function normalizePattern(input?: string | null): RenderMode {
  const n = (input ?? "").trim().toLowerCase();
  if (!n) return "straight";

  // 1. Named layouts — most specific, win over everything else.
  if (n.includes("herringbone")) return "herringbone";
  if (n.includes("parquet")) return "parquet";
  if (n.includes("lattice")) return "lattice";
  if (n.includes("checkerboard")) return "checkerboard-on-point";
  if (n.includes("stripes") || n.includes("striped")) return "stripes-vertical";
  if (n.includes("random")) return "random";

  // 2. Alternating courses — "one row straight + one row horizontal
  // repeat" and variants. Checked before plain orientation so the
  // "horizontal"/"vertical" inside these strings doesn't win first.
  if (/\bone row\b[\s\S]*\brepeat\b/.test(n)) return "alternating-rows";

  // 3. Offset variants.
  if (n.includes("30/70") || n.includes("30-70")) return "30-70";
  if (n.includes("staggered")) {
    if (n.includes("vertical")) return "staggered-vertical";
    return "staggered-horizontal";
  }

  // 4. Plain orientation — vertical / horizontal anywhere in the string.
  // "set parallel with vanity / horizontal in shower" → horizontal wins
  // because it's more specific than the bare anchoring phrase.
  if (/\bvertical\b/.test(n)) return "straight-vertical";
  if (/\bhorizontal\b/.test(n)) return "straight-horizontal";

  // 5. Everything else — anchoring ("parallel with vanity"), coverage
  // ("cut to fit", "full size tile", "to ceiling"), backsplash heights
  // ("6 inch splash", "1/2 sheet splash"), bare "set", "see attached",
  // dimensions like "4x4" — all render as plain set-straight.
  return "straight";
}

/**
 * Whether a render mode lays tiles in a column-dominant (tall) orientation.
 * Used by renderers to decide tile aspect.
 */
export function isVerticalMode(mode: RenderMode): boolean {
  return mode === "straight-vertical" || mode === "staggered-vertical";
}

/**
 * Whether a render mode is "rectangle grid"-shaped — i.e. dispatched to the
 * default grid renderer rather than a specialty one (herringbone, parquet,
 * etc.). Helper for the dispatch tables.
 */
export function isGridMode(mode: RenderMode): boolean {
  return (
    mode === "straight" ||
    mode === "straight-vertical" ||
    mode === "straight-horizontal" ||
    mode === "staggered-horizontal" ||
    mode === "staggered-vertical" ||
    mode === "30-70"
  );
}
