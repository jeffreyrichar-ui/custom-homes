type Pattern =
  | "set straight"
  | "set vertical"
  | "staggered horizontal"
  | "staggered vertical"
  | "checkerboard"
  | "stacked";

type Props = {
  imageUrl?: string | null;
  groutColor?: string | null;
  pattern?: string | null;
  /** Aspect ratio of one tile (width / height). Default 2 (e.g. 12x6) */
  tileAspect?: number;
  /** Logical tile width in SVG units. */
  tileWidth?: number;
  /** Cols and rows in the preview. */
  cols?: number;
  rows?: number;
  /** Grout line thickness in SVG units. */
  groutWidth?: number;
  /** Optional secondary fill for checkerboard alternates when no image. */
  altColor?: string | null;
};

const NAMED_GROUT_COLORS: Record<string, string> = {
  "delorean gray": "#9a9a96",
  "snow white": "#f3f1ec",
  "warm gray": "#a6a098",
  "charcoal": "#4a4a4a",
  "bright white": "#ffffff",
};

function resolveGroutFill(input: string | null | undefined): string {
  if (!input) return "#cccccc";
  const key = input.trim().toLowerCase();
  if (NAMED_GROUT_COLORS[key]) return NAMED_GROUT_COLORS[key]!;
  // If it's already a hex/css color, use it; otherwise neutral fallback.
  if (/^#([0-9a-f]{3}){1,2}$/i.test(input.trim())) return input.trim();
  return "#cccccc";
}

function normalizePattern(p?: string | null): Pattern {
  const n = (p ?? "").trim().toLowerCase();
  if (n === "set vertical") return "set vertical";
  if (n === "staggered horizontal" || n === "brick" || n === "running bond")
    return "staggered horizontal";
  if (n === "staggered vertical") return "staggered vertical";
  if (n === "checkerboard") return "checkerboard";
  if (n === "stacked") return "stacked";
  return "set straight";
}

export function PatternPreview({
  imageUrl,
  groutColor,
  pattern,
  tileAspect = 2,
  tileWidth = 80,
  cols = 6,
  rows = 6,
  groutWidth = 2,
  altColor,
}: Props) {
  const p = normalizePattern(pattern);
  const isVertical = p === "set vertical" || p === "staggered vertical";

  // For vertical patterns, swap orientation: tile is taller than wide.
  const tileW = isVertical ? tileWidth / tileAspect : tileWidth;
  const tileH = isVertical ? tileWidth : tileWidth / tileAspect;

  const offsetX =
    p === "staggered horizontal" ? tileW / 2 : 0;
  const offsetY = p === "staggered vertical" ? tileH / 2 : 0;

  const groutFill = resolveGroutFill(groutColor);
  const placeholderFill = "#d8d2c4"; // soft tile color when no image
  const placeholderAlt = resolveGroutFill(altColor) || "#a89c84";

  const totalW = cols * tileW + groutWidth * (cols + 1);
  const totalH = rows * tileH + groutWidth * (rows + 1);

  const tiles: React.ReactElement[] = [];
  for (let r = 0; r < rows; r += 1) {
    const rowOffsetX = p === "staggered horizontal" ? (r % 2) * offsetX : 0;
    for (let c = 0; c < cols; c += 1) {
      const colOffsetY = p === "staggered vertical" ? (c % 2) * offsetY : 0;
      const x = c * tileW + groutWidth * (c + 1) + rowOffsetX;
      const y = r * tileH + groutWidth * (r + 1) + colOffsetY;
      // Skip if a staggered offset pushes the tile off the visible area
      if (x >= totalW || y >= totalH) continue;
      const clippedW = Math.min(tileW, totalW - x - groutWidth);
      const clippedH = Math.min(tileH, totalH - y - groutWidth);
      const useAlt = p === "checkerboard" && (r + c) % 2 === 1;
      tiles.push(
        imageUrl && !useAlt ? (
          <image
            key={`${r}-${c}`}
            href={imageUrl}
            x={x}
            y={y}
            width={clippedW}
            height={clippedH}
            preserveAspectRatio="xMidYMid slice"
          />
        ) : (
          <rect
            key={`${r}-${c}`}
            x={x}
            y={y}
            width={clippedW}
            height={clippedH}
            fill={useAlt ? placeholderAlt : imageUrl ? "transparent" : placeholderFill}
          />
        ),
      );
    }
  }

  return (
    <svg
      viewBox={`0 0 ${totalW} ${totalH}`}
      className="pattern-preview"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x={0} y={0} width={totalW} height={totalH} fill={groutFill} />
      {tiles}
    </svg>
  );
}
