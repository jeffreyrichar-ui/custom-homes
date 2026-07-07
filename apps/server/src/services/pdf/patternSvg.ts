import {
  detectShape,
  detectAspect,
  normalizePattern,
  type RenderMode,
  type TileShape,
} from "@custom-homes/shared";

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
  const mode = normalizePattern(opts.pattern);

  switch (mode) {
    case "herringbone":
      return renderHerringboneSvg({ imageUrl: opts.imageUrl, groutFill, placeholderFill, cols, rows, aspect });
    case "checkerboard-on-point":
      return renderCheckerboardOnPointSvg({ imageUrl: opts.imageUrl, groutFill, placeholderFill, cols, rows });
    case "parquet":
      return renderParquetSvg({ imageUrl: opts.imageUrl, groutFill, placeholderFill, cols, rows });
    case "lattice":
      return renderLatticeSvg({ imageUrl: opts.imageUrl, groutFill, placeholderFill, cols, rows });
    case "stripes-vertical":
      return renderStripesVerticalSvg({ imageUrl: opts.imageUrl, groutFill, placeholderFill, cols, rows, aspect });
    case "random":
      return renderRandomRotationSvg({ imageUrl: opts.imageUrl, groutFill, placeholderFill, cols, rows, aspect });
    default:
      return renderRectSvg({
        imageUrl: opts.imageUrl,
        groutFill,
        placeholderFill,
        cols,
        rows,
        aspect,
        mode,
      });
  }
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

function renderHerringboneSvg(o: {
  imageUrl?: string | null;
  groutFill: string;
  placeholderFill: string;
  cols: number;
  rows: number;
  aspect: number;
}) {
  // True 2:1 domino herringbone, mirrored in PatternPreview.tsx. The plane
  // is tiled by an H tile [0,2S]x[0,S] and its V partner [2S,3S]x[-S,S]
  // repeated at every lattice translation (p+3q, p-q)·S — each tile's end
  // abuts the side of its perpendicular neighbor, forming the interlocking
  // L-joints. The whole field is rotated 45° for the classic point-up look
  // Tamara's "1/2 x 1 herringbone" describes. The 2:1 ratio is inherent to
  // the pattern, so the detected tile aspect is deliberately ignored.
  const S = 26;
  const inset = 1;
  const totalW = o.cols * S * 1.6;
  const totalH = o.rows * S * 1.6;
  const cx = totalW / 2;
  const cy = totalH / 2;
  // Cover the rotated frame: generate lattice tiles within a radius that
  // reaches the viewBox corners from the center.
  const reach = Math.ceil((totalW + totalH) / (2 * S)) + 2;
  const parts: string[] = [];
  parts.push(`<g transform="rotate(45 ${cx} ${cy})">`);
  let n = 0;
  for (let p = -reach; p <= reach; p++) {
    for (let q = -reach; q <= reach; q++) {
      const ox = cx + (p + 3 * q) * S;
      const oy = cy + (p - q) * S;
      // Skip lattice cells outside the disc that circumscribes the frame —
      // rotation means axis-aligned bounds can't be used directly.
      const dx = ox - cx;
      const dy = oy - cy;
      const radius = Math.sqrt(totalW * totalW + totalH * totalH) / 2 + 3 * S;
      if (dx * dx + dy * dy > radius * radius) continue;
      const rects = [
        { x: ox + inset, y: oy + inset, w: 2 * S - 2 * inset, h: S - 2 * inset },
        { x: ox + 2 * S + inset, y: oy - S + inset, w: S - 2 * inset, h: 2 * S - 2 * inset },
      ];
      for (const rct of rects) {
        if (o.imageUrl) {
          const id = `hb-${n++}`;
          parts.push(`<defs><clipPath id="${id}"><rect x="${rct.x}" y="${rct.y}" width="${rct.w}" height="${rct.h}"/></clipPath></defs>`);
          parts.push(`<image href="${esc(o.imageUrl)}" x="${rct.x}" y="${rct.y}" width="${rct.w}" height="${rct.h}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`);
        } else {
          parts.push(`<rect x="${rct.x}" y="${rct.y}" width="${rct.w}" height="${rct.h}" fill="${o.placeholderFill}"/>`);
        }
      }
    }
  }
  parts.push(`</g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" preserveAspectRatio="xMidYMid meet" class="pattern-svg"><rect x="0" y="0" width="${totalW}" height="${totalH}" fill="${o.groutFill}"/>${parts.join("")}</svg>`;
}

function renderCheckerboardOnPointSvg(o: {
  imageUrl?: string | null;
  groutFill: string;
  placeholderFill: string;
  cols: number;
  rows: number;
}) {
  // Mirror of renderCheckerboardOnPoint — a chessboard rotated 45°.
  // Diamond centers within a row sit one full diagonal apart (touching at
  // left/right points); each successive row drops half a diagonal and
  // shifts half a diagonal, filling the gaps. Rotating a chessboard 45°
  // makes its diagonals horizontal, and diagonals are monochrome — so the
  // dim tint alternates BY ROW, giving every diamond four opposite-color
  // edge neighbors.
  const side = 80;
  const diag = side * Math.SQRT2;
  const half = diag / 2;
  const pad = half;
  const dcols = Math.max(2, Math.ceil(o.cols / 2));
  const drows = o.rows * 2;
  const totalW = dcols * diag + 2 * pad;
  const totalH = drows * half + 2 * pad;
  const parts: string[] = [];
  // Inset each drawn square slightly so a grout seam shows between diamonds.
  const inset = 1.5;
  const drawSide = side - 2 * inset;
  for (let r = 0; r <= drows; r++) {
    const rowShift = r % 2 === 1 ? half : 0;
    const dimmed = r % 2 === 1;
    for (let c = 0; c <= dcols; c++) {
      const ccx = pad + c * diag + rowShift;
      const ccy = pad + r * half;
      const x = ccx - drawSide / 2;
      const y = ccy - drawSide / 2;
      if (o.imageUrl) {
        const id = `cob-${r}-${c}`;
        parts.push(`<g transform="rotate(45 ${ccx} ${ccy})">`);
        parts.push(`<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${drawSide}" height="${drawSide}"/></clipPath></defs>`);
        parts.push(`<image href="${esc(o.imageUrl)}" x="${x}" y="${y}" width="${drawSide}" height="${drawSide}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`);
        if (dimmed) {
          parts.push(`<rect x="${x}" y="${y}" width="${drawSide}" height="${drawSide}" fill="${o.groutFill}" opacity="0.45"/>`);
        }
        parts.push(`</g>`);
      } else {
        parts.push(`<rect x="${x}" y="${y}" width="${drawSide}" height="${drawSide}" fill="${dimmed ? o.groutFill : o.placeholderFill}" transform="rotate(45 ${ccx} ${ccy})"/>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" preserveAspectRatio="xMidYMid meet" class="pattern-svg"><rect x="0" y="0" width="${totalW}" height="${totalH}" fill="${o.groutFill}"/>${parts.join("")}</svg>`;
}

function renderParquetSvg(o: {
  imageUrl?: string | null;
  groutFill: string;
  placeholderFill: string;
  cols: number;
  rows: number;
}) {
  // 4-vertical + 4-horizontal alternating blocks. Each block is a square.
  const tileLong = 80;
  const block = tileLong;
  const groutWidth = 2;
  const bcols = Math.max(2, Math.ceil(o.cols / 2));
  const brows = Math.max(2, Math.ceil(o.rows / 2));
  const totalW = bcols * block + groutWidth * (bcols + 1);
  const totalH = brows * block + groutWidth * (brows + 1);
  const parts: string[] = [];
  // Grout seams between the four strips of a block; flush strips render
  // as one solid square.
  const stripShort = (tileLong - 3 * groutWidth) / 4;
  for (let br = 0; br < brows; br++) {
    for (let bc = 0; bc < bcols; bc++) {
      const x0 = bc * block + groutWidth * (bc + 1);
      const y0 = br * block + groutWidth * (br + 1);
      const vertical = (br + bc) % 2 === 0;
      for (let i = 0; i < 4; i++) {
        const step = i * (stripShort + groutWidth);
        const x = vertical ? x0 + step : x0;
        const y = vertical ? y0 : y0 + step;
        const w = vertical ? stripShort : tileLong;
        const h = vertical ? tileLong : stripShort;
        if (o.imageUrl) {
          parts.push(`<image href="${esc(o.imageUrl)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`);
        } else {
          parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${o.placeholderFill}"/>`);
        }
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" preserveAspectRatio="xMidYMid meet" class="pattern-svg"><rect x="0" y="0" width="${totalW}" height="${totalH}" fill="${o.groutFill}"/>${parts.join("")}</svg>`;
}

function renderLatticeSvg(o: {
  imageUrl?: string | null;
  groutFill: string;
  placeholderFill: string;
  cols: number;
  rows: number;
}) {
  // Basket weave. Each super-cell alternates which strip pair is "over".
  const long = 80;
  const short = long / 2;
  const cell = long;
  const groutWidth = 2;
  const ucols = Math.max(2, Math.ceil(o.cols / 2));
  const urows = Math.max(2, Math.ceil(o.rows / 2));
  const totalW = ucols * cell + groutWidth * (ucols + 1);
  const totalH = urows * cell + groutWidth * (urows + 1);
  // Strips within a pair are separated by an internal grout seam; without
  // it both pairs fill the identical square and the weave reads as one
  // solid tile.
  const stripShort = (long - groutWidth) / 2;
  const parts: string[] = [];
  for (let ur = 0; ur < urows; ur++) {
    for (let uc = 0; uc < ucols; uc++) {
      const x0 = uc * cell + groutWidth * (uc + 1);
      const y0 = ur * cell + groutWidth * (ur + 1);
      const flip = (ur + uc) % 2 === 1;
      // Alternate super-cells between a stacked horizontal pair and a
      // side-by-side vertical pair — the classic basket weave.
      const pair = flip
        ? [
            { x: x0, y: y0, w: long, h: stripShort },
            { x: x0, y: y0 + stripShort + groutWidth, w: long, h: stripShort },
          ]
        : [
            { x: x0, y: y0, w: stripShort, h: long },
            { x: x0 + stripShort + groutWidth, y: y0, w: stripShort, h: long },
          ];
      for (const p of pair) {
        if (o.imageUrl) {
          parts.push(`<image href="${esc(o.imageUrl)}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" preserveAspectRatio="xMidYMid slice"/>`);
        } else {
          parts.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${o.placeholderFill}"/>`);
        }
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" preserveAspectRatio="xMidYMid meet" class="pattern-svg"><rect x="0" y="0" width="${totalW}" height="${totalH}" fill="${o.groutFill}"/>${parts.join("")}</svg>`;
}

function renderStripesVerticalSvg(o: {
  imageUrl?: string | null;
  groutFill: string;
  placeholderFill: string;
  cols: number;
  rows: number;
  aspect: number;
}) {
  // Mirror of renderStripesVertical — alternating columns get a darker
  // tint overlay.
  const tileBase = 80;
  const tileW = tileBase / Math.max(1.5, o.aspect);
  const tileH = tileBase * 1.5;
  const groutWidth = 2;
  const totalW = o.cols * tileW + groutWidth * (o.cols + 1);
  const totalH = o.rows * tileH + groutWidth * (o.rows + 1);
  const parts: string[] = [];
  for (let r = 0; r < o.rows; r++) {
    for (let c = 0; c < o.cols; c++) {
      const x = c * tileW + groutWidth * (c + 1);
      const y = r * tileH + groutWidth * (r + 1);
      const darker = c % 2 === 1;
      if (o.imageUrl) {
        parts.push(`<image href="${esc(o.imageUrl)}" x="${x}" y="${y}" width="${tileW}" height="${tileH}" preserveAspectRatio="xMidYMid slice"/>`);
        if (darker) {
          parts.push(`<rect x="${x}" y="${y}" width="${tileW}" height="${tileH}" fill="#000" opacity="0.18"/>`);
        }
      } else {
        parts.push(`<rect x="${x}" y="${y}" width="${tileW}" height="${tileH}" fill="${darker ? "#9a958a" : o.placeholderFill}"/>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" preserveAspectRatio="xMidYMid meet" class="pattern-svg"><rect x="0" y="0" width="${totalW}" height="${totalH}" fill="${o.groutFill}"/>${parts.join("")}</svg>`;
}

function renderRandomRotationSvg(o: {
  imageUrl?: string | null;
  groutFill: string;
  placeholderFill: string;
  cols: number;
  rows: number;
  aspect: number;
}) {
  // Each cell rotated 0/90/180/270° based on a deterministic seed so the
  // PDF matches the live preview exactly.
  const tileBase = 80;
  const side = Math.min(tileBase, tileBase / o.aspect) * 1.1;
  const groutWidth = 2;
  const totalW = o.cols * side + groutWidth * (o.cols + 1);
  const totalH = o.rows * side + groutWidth * (o.rows + 1);
  const parts: string[] = [];
  for (let r = 0; r < o.rows; r++) {
    for (let c = 0; c < o.cols; c++) {
      const x = c * side + groutWidth * (c + 1);
      const y = r * side + groutWidth * (r + 1);
      const seed = (r * 31 + c * 17 + r * c) % 4;
      const rot = seed * 90;
      const cx = x + side / 2;
      const cy = y + side / 2;
      if (o.imageUrl) {
        parts.push(`<image href="${esc(o.imageUrl)}" x="${x}" y="${y}" width="${side}" height="${side}" transform="rotate(${rot} ${cx} ${cy})" preserveAspectRatio="xMidYMid slice"/>`);
      } else {
        parts.push(`<rect x="${x}" y="${y}" width="${side}" height="${side}" fill="${o.placeholderFill}" transform="rotate(${rot} ${cx} ${cy})"/>`);
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
  mode: RenderMode;
}) {
  const tileBase = 80;
  const isVertical = o.mode === "straight-vertical" || o.mode === "staggered-vertical";
  const tileW = isVertical ? tileBase / o.aspect : tileBase;
  const tileH = isVertical ? tileBase : tileBase / o.aspect;
  const groutWidth = 2;
  const totalW = o.cols * tileW + groutWidth * (o.cols + 1);
  const totalH = o.rows * tileH + groutWidth * (o.rows + 1);
  // 30-70 uses a 30%-width row offset; plain staggered uses 50%.
  const offsetFraction = o.mode === "30-70" ? 0.3 : 0.5;
  const parts: string[] = [];
  const pushTile = (x: number, y: number, w: number, h: number) => {
    if (w < 1 || h < 1) return;
    if (o.imageUrl) {
      parts.push(`<image href="${esc(o.imageUrl)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`);
    } else {
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${o.placeholderFill}"/>`);
    }
  };
  for (let r = 0; r < o.rows; r++) {
    const rowOffsetX = (o.mode === "staggered-horizontal" || o.mode === "30-70") ? (r % 2) * (tileW * offsetFraction) : 0;
    // Offset rows start with a cut tile filling the leading gap, the way a
    // real running-bond course starts against a wall.
    if (rowOffsetX > 0) {
      const y = r * tileH + groutWidth * (r + 1);
      pushTile(groutWidth, y, rowOffsetX - groutWidth, Math.min(tileH, totalH - y - groutWidth));
    }
    for (let c = 0; c < o.cols; c++) {
      const colOffsetY = o.mode === "staggered-vertical" ? (c % 2) * (tileH * 0.5) : 0;
      // Offset columns likewise get a leading cut tile at the top.
      if (r === 0 && colOffsetY > 0) {
        const cx = c * tileW + groutWidth * (c + 1);
        pushTile(cx, groutWidth, Math.min(tileW, totalW - cx - groutWidth), colOffsetY - groutWidth);
      }
      const x = c * tileW + groutWidth * (c + 1) + rowOffsetX;
      const y = r * tileH + groutWidth * (r + 1) + colOffsetY;
      if (x >= totalW || y >= totalH) continue;
      const cw = Math.min(tileW, totalW - x - groutWidth);
      const ch = Math.min(tileH, totalH - y - groutWidth);
      pushTile(x, y, cw, ch);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" preserveAspectRatio="xMidYMid meet" class="pattern-svg"><rect x="0" y="0" width="${totalW}" height="${totalH}" fill="${o.groutFill}"/>${parts.join("")}</svg>`;
}
