import { detectShape, detectAspect, type TileShape } from "@custom-homes/shared";

const NAMED_GROUT_COLORS: Record<string, string> = {
  "delorean gray": "#9a9a96",
  "snow white": "#f3f1ec",
  "warm gray": "#a6a098",
  "bleached wood": "#c9bfa9",
  "saddle brown": "#7a5a40",
  "urban putty": "#a8a298",
  "bright white": "#ffffff",
  "tobacco brown": "#5a4a36",
  "rolling fog": "#b0b3b0",
  "natural gray": "#9a9a9a",
  "oyster gray": "#a39e92",
  "sable brown": "#6b5240",
  ash: "#9a958a",
  bone: "#d6cbb8",
  charcoal: "#4a4a4a",
};

function resolveGrout(input: string | null | undefined): string {
  if (!input) return "#cccccc";
  const key = input.trim().toLowerCase();
  if (NAMED_GROUT_COLORS[key]) return NAMED_GROUT_COLORS[key]!;
  if (/^#([0-9a-f]{3}){1,2}$/i.test(input.trim())) return input.trim();
  return "#cccccc";
}

function normalizePattern(p?: string | null): string {
  const n = (p ?? "").trim().toLowerCase();
  if (n.includes("set vertical")) return "set vertical";
  if (n.includes("staggered horizontal") || n.includes("brick") || n.includes("running bond"))
    return "staggered horizontal";
  if (n.includes("staggered vertical")) return "staggered vertical";
  if (n.includes("checkerboard")) return "checkerboard";
  if (n.includes("stacked")) return "stacked";
  return "set straight";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function renderPatternSvg(opts: {
  imageUrl?: string | null;
  groutColor?: string | null;
  pattern?: string | null;
  style?: string | null;
  color?: string | null;
  notes?: string | null;
  cols?: number;
  rows?: number;
}): string {
  const cols = opts.cols ?? 5;
  const rows = opts.rows ?? 4;
  const shape: TileShape = detectShape({
    style: opts.style,
    color: opts.color,
    notes: opts.notes,
    pattern: opts.pattern,
  });
  const groutFill = resolveGrout(opts.groutColor);
  const placeholderFill = "#d8d2c4";

  if (shape === "penny round" || shape === "mosaic" || shape === "palladiana mosaic") {
    return renderCirclesSvg({ imageUrl: opts.imageUrl, groutFill, placeholderFill, cols: cols + 2, rows: rows + 2 });
  }
  if (shape === "hexagon") {
    return renderHexSvg({ imageUrl: opts.imageUrl, groutFill, placeholderFill, cols: cols + 1, rows: rows + 1 });
  }
  if (shape === "picket") {
    return renderPicketSvg({ imageUrl: opts.imageUrl, groutFill, placeholderFill, cols, rows: rows + 2 });
  }
  const aspect = shape === "square" ? 1 : detectAspect({ notes: opts.notes });
  return renderRectSvg({
    imageUrl: opts.imageUrl,
    groutFill,
    placeholderFill,
    cols,
    rows,
    aspect,
    pattern: normalizePattern(opts.pattern),
  });
}

function renderCirclesSvg(o: { imageUrl?: string | null; groutFill: string; placeholderFill: string; cols: number; rows: number }) {
  const r = 20;
  const gap = 2;
  const dx = 2 * r + gap;
  const dy = (2 * r + gap) * 0.866;
  const totalW = o.cols * dx + r;
  const totalH = o.rows * dy + r;
  const parts: string[] = [];
  for (let row = 0; row < o.rows; row++) {
    const ox = row % 2 === 1 ? dx / 2 : 0;
    for (let c = 0; c < o.cols; c++) {
      const cx = c * dx + r + ox;
      const cy = row * dy + r;
      if (o.imageUrl) {
        const id = `c-${row}-${c}`;
        parts.push(`<defs><clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath></defs>`);
        parts.push(`<image href="${esc(o.imageUrl)}" x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`);
      } else {
        parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${o.placeholderFill}"/>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" preserveAspectRatio="xMidYMid meet" class="pattern-svg"><rect x="0" y="0" width="${totalW}" height="${totalH}" fill="${o.groutFill}"/>${parts.join("")}</svg>`;
}

function renderHexSvg(o: { imageUrl?: string | null; groutFill: string; placeholderFill: string; cols: number; rows: number }) {
  const size = 20;
  const w = size * 2;
  const h = size * Math.sqrt(3);
  const dx = w * 0.75;
  const dy = h;
  const totalW = o.cols * dx + size / 2;
  const totalH = o.rows * dy + h;
  const parts: string[] = [];
  for (let row = 0; row < o.rows; row++) {
    for (let c = 0; c < o.cols; c++) {
      const cx = c * dx + size;
      const cy = row * dy + (c % 2 === 1 ? dy / 2 : 0) + h / 2;
      const points = [0, 1, 2, 3, 4, 5]
        .map((i) => `${cx + size * Math.cos((Math.PI / 3) * i)},${cy + size * Math.sin((Math.PI / 3) * i)}`)
        .join(" ");
      if (o.imageUrl) {
        const id = `h-${row}-${c}`;
        parts.push(`<defs><clipPath id="${id}"><polygon points="${points}"/></clipPath></defs>`);
        parts.push(`<image href="${esc(o.imageUrl)}" x="${cx - size}" y="${cy - size}" width="${2 * size}" height="${2 * size}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`);
      } else {
        parts.push(`<polygon points="${points}" fill="${o.placeholderFill}"/>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" preserveAspectRatio="xMidYMid meet" class="pattern-svg"><rect x="0" y="0" width="${totalW}" height="${totalH}" fill="${o.groutFill}"/>${parts.join("")}</svg>`;
}

function renderPicketSvg(o: { imageUrl?: string | null; groutFill: string; placeholderFill: string; cols: number; rows: number }) {
  const w = 50;
  const h = w * 2;
  const gap = 2;
  const dx = w + gap;
  const dy = h * 0.75 + gap;
  const totalW = o.cols * dx + w;
  const totalH = o.rows * dy + h / 4;
  const parts: string[] = [];
  for (let row = 0; row < o.rows; row++) {
    const ox = row % 2 === 1 ? dx / 2 : 0;
    for (let c = 0; c < o.cols; c++) {
      const x = c * dx + ox;
      const y = row * dy;
      const points = [
        `${x + w / 2},${y}`,
        `${x + w},${y + h / 4}`,
        `${x + w},${y + (h * 3) / 4}`,
        `${x + w / 2},${y + h}`,
        `${x},${y + (h * 3) / 4}`,
        `${x},${y + h / 4}`,
      ].join(" ");
      if (o.imageUrl) {
        const id = `p-${row}-${c}`;
        parts.push(`<defs><clipPath id="${id}"><polygon points="${points}"/></clipPath></defs>`);
        parts.push(`<image href="${esc(o.imageUrl)}" x="${x}" y="${y}" width="${w}" height="${h}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`);
      } else {
        parts.push(`<polygon points="${points}" fill="${o.placeholderFill}"/>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" preserveAspectRatio="xMidYMid meet" class="pattern-svg"><rect x="0" y="0" width="${totalW}" height="${totalH}" fill="${o.groutFill}"/>${parts.join("")}</svg>`;
}

function renderRectSvg(o: {
  imageUrl?: string | null;
  groutFill: string;
  placeholderFill: string;
  cols: number;
  rows: number;
  aspect: number;
  pattern: string;
}) {
  const tileBase = 80;
  const isVertical = o.pattern === "set vertical" || o.pattern === "staggered vertical";
  const tileW = isVertical ? tileBase / o.aspect : tileBase;
  const tileH = isVertical ? tileBase : tileBase / o.aspect;
  const groutWidth = 2;
  const totalW = o.cols * tileW + groutWidth * (o.cols + 1);
  const totalH = o.rows * tileH + groutWidth * (o.rows + 1);
  const parts: string[] = [];
  for (let r = 0; r < o.rows; r++) {
    const rowOffsetX = o.pattern === "staggered horizontal" ? (r % 2) * (tileW / 2) : 0;
    for (let c = 0; c < o.cols; c++) {
      const colOffsetY = o.pattern === "staggered vertical" ? (c % 2) * (tileH / 2) : 0;
      const x = c * tileW + groutWidth * (c + 1) + rowOffsetX;
      const y = r * tileH + groutWidth * (r + 1) + colOffsetY;
      if (x >= totalW || y >= totalH) continue;
      const cw = Math.min(tileW, totalW - x - groutWidth);
      const ch = Math.min(tileH, totalH - y - groutWidth);
      if (o.imageUrl) {
        parts.push(`<image href="${esc(o.imageUrl)}" x="${x}" y="${y}" width="${cw}" height="${ch}" preserveAspectRatio="xMidYMid slice"/>`);
      } else {
        parts.push(`<rect x="${x}" y="${y}" width="${cw}" height="${ch}" fill="${o.placeholderFill}"/>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" preserveAspectRatio="xMidYMid meet" class="pattern-svg"><rect x="0" y="0" width="${totalW}" height="${totalH}" fill="${o.groutFill}"/>${parts.join("")}</svg>`;
}
