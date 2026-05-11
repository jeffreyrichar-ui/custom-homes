type Pattern =
  | "set straight"
  | "set vertical"
  | "staggered horizontal"
  | "staggered vertical"
  | "checkerboard"
  | "stacked";

const NAMED_GROUT_COLORS: Record<string, string> = {
  "delorean gray": "#9a9a96",
  "snow white": "#f3f1ec",
  "warm gray": "#a6a098",
  charcoal: "#4a4a4a",
  "bright white": "#ffffff",
};

function resolveGrout(input: string | null | undefined): string {
  if (!input) return "#cccccc";
  const key = input.trim().toLowerCase();
  if (NAMED_GROUT_COLORS[key]) return NAMED_GROUT_COLORS[key]!;
  if (/^#([0-9a-f]{3}){1,2}$/i.test(input.trim())) return input.trim();
  return "#cccccc";
}

function normalizePattern(p?: string | null): Pattern {
  const n = (p ?? "").trim().toLowerCase();
  if (n === "set vertical") return "set vertical";
  if (n === "staggered horizontal" || n === "brick" || n === "running bond") return "staggered horizontal";
  if (n === "staggered vertical") return "staggered vertical";
  if (n === "checkerboard") return "checkerboard";
  if (n === "stacked") return "stacked";
  return "set straight";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function renderPatternSvg(opts: {
  imageUrl?: string | null;
  groutColor?: string | null;
  pattern?: string | null;
  cols?: number;
  rows?: number;
}): string {
  const cols = opts.cols ?? 5;
  const rows = opts.rows ?? 4;
  const p = normalizePattern(opts.pattern);
  const isVertical = p === "set vertical" || p === "staggered vertical";
  const tileBase = 80;
  const aspect = 2;
  const tileW = isVertical ? tileBase / aspect : tileBase;
  const tileH = isVertical ? tileBase : tileBase / aspect;
  const groutWidth = 2;
  const groutFill = resolveGrout(opts.groutColor);
  const placeholderFill = "#d8d2c4";
  const placeholderAlt = "#a89c84";
  const totalW = cols * tileW + groutWidth * (cols + 1);
  const totalH = rows * tileH + groutWidth * (rows + 1);

  const tiles: string[] = [];
  for (let r = 0; r < rows; r += 1) {
    const rowOffsetX = p === "staggered horizontal" ? (r % 2) * (tileW / 2) : 0;
    for (let c = 0; c < cols; c += 1) {
      const colOffsetY = p === "staggered vertical" ? (c % 2) * (tileH / 2) : 0;
      const x = c * tileW + groutWidth * (c + 1) + rowOffsetX;
      const y = r * tileH + groutWidth * (r + 1) + colOffsetY;
      if (x >= totalW || y >= totalH) continue;
      const clippedW = Math.min(tileW, totalW - x - groutWidth);
      const clippedH = Math.min(tileH, totalH - y - groutWidth);
      const useAlt = p === "checkerboard" && (r + c) % 2 === 1;
      if (opts.imageUrl && !useAlt) {
        tiles.push(
          `<image href="${esc(opts.imageUrl)}" x="${x}" y="${y}" width="${clippedW}" height="${clippedH}" preserveAspectRatio="xMidYMid slice"/>`,
        );
      } else {
        const fill = useAlt ? placeholderAlt : opts.imageUrl ? "transparent" : placeholderFill;
        tiles.push(`<rect x="${x}" y="${y}" width="${clippedW}" height="${clippedH}" fill="${fill}"/>`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" preserveAspectRatio="xMidYMid meet" class="pattern-svg"><rect x="0" y="0" width="${totalW}" height="${totalH}" fill="${groutFill}"/>${tiles.join("")}</svg>`;
}
