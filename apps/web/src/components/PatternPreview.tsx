import { detectShape, detectAspect, type TileShape } from "@custom-homes/shared";

type Props = {
  imageUrl?: string | null;
  groutColor?: string | null;
  pattern?: string | null;
  notes?: string | null;
  style?: string | null;
  color?: string | null;
  /** Logical tile width in SVG units. */
  tileWidth?: number;
  /** Cols and rows in the preview. */
  cols?: number;
  rows?: number;
  /** Grout line thickness in SVG units. */
  groutWidth?: number;
  /** Force a specific shape (otherwise detected from style/color/notes). */
  shape?: TileShape;
};

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
  "ash": "#9a958a",
  "bone": "#d6cbb8",
  charcoal: "#4a4a4a",
};

function resolveGroutFill(input: string | null | undefined): string {
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
  if (n.includes("herringbone")) return "herringbone";
  return "set straight";
}

export function PatternPreview({
  imageUrl,
  groutColor,
  pattern,
  notes,
  style,
  color,
  tileWidth = 80,
  cols = 6,
  rows = 6,
  groutWidth = 2,
  shape: forcedShape,
}: Props) {
  const detectedShape =
    forcedShape ?? detectShape({ style, color, notes, pattern });
  const groutFill = resolveGroutFill(groutColor);
  const placeholderFill = "#d8d2c4";

  if (detectedShape === "penny round" || detectedShape === "mosaic" || detectedShape === "palladiana mosaic") {
    return renderCircles({
      imageUrl,
      groutFill,
      placeholderFill,
      cols: cols + 2,
      rows: rows + 2,
      tileWidth: tileWidth / 2,
    });
  }
  if (detectedShape === "hexagon") {
    return renderHexagons({
      imageUrl,
      groutFill,
      placeholderFill,
      cols: cols + 1,
      rows: rows + 1,
      size: tileWidth / 2,
    });
  }
  if (detectedShape === "picket") {
    return renderPicket({
      imageUrl,
      groutFill,
      placeholderFill,
      cols,
      rows: rows + 2,
      tileWidth,
    });
  }

  // Square, rectangle, subway, trapezoid, fan, unknown → fall back to grid
  const aspect = detectedShape === "square" ? 1 : detectAspect({ notes });
  const norm = normalizePattern(pattern);
  if (norm === "herringbone") {
    return renderHerringbone({
      imageUrl,
      groutFill,
      placeholderFill,
      cols,
      rows,
      tileWidth,
      aspect,
    });
  }
  if (norm === "checkerboard") {
    return renderCheckerboard({
      imageUrl,
      groutFill,
      placeholderFill,
      cols,
      rows,
      tileWidth,
      groutWidth,
    });
  }
  return renderRectangleGrid({
    imageUrl,
    groutFill,
    placeholderFill,
    cols,
    rows,
    tileWidth,
    aspect,
    pattern: norm,
    groutWidth,
  });
}

// ----- shape renderers -----

function renderCircles(opts: {
  imageUrl?: string | null;
  groutFill: string;
  placeholderFill: string;
  cols: number;
  rows: number;
  tileWidth: number;
}) {
  const { imageUrl, groutFill, placeholderFill, cols, rows, tileWidth } = opts;
  const r = tileWidth / 2;
  const gap = 2;
  const dx = 2 * r + gap;
  const dy = (2 * r + gap) * 0.866; // hex packing for circles
  const totalW = cols * dx + r;
  const totalH = rows * dy + r;

  const circles: React.ReactElement[] = [];
  for (let row = 0; row < rows; row++) {
    const offsetX = row % 2 === 1 ? dx / 2 : 0;
    for (let c = 0; c < cols; c++) {
      const cx = c * dx + r + offsetX;
      const cy = row * dy + r;
      if (imageUrl) {
        const id = `clip-${row}-${c}`;
        circles.push(
          <g key={`${row}-${c}`}>
            <defs>
              <clipPath id={id}>
                <circle cx={cx} cy={cy} r={r} />
              </clipPath>
            </defs>
            <image
              href={imageUrl}
              x={cx - r}
              y={cy - r}
              width={2 * r}
              height={2 * r}
              clipPath={`url(#${id})`}
              preserveAspectRatio="xMidYMid slice"
            />
          </g>,
        );
      } else {
        circles.push(
          <circle key={`${row}-${c}`} cx={cx} cy={cy} r={r} fill={placeholderFill} />,
        );
      }
    }
  }
  return (
    <svg
      viewBox={`0 0 ${totalW} ${totalH}`}
      className="pattern-preview"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x={0} y={0} width={totalW} height={totalH} fill={groutFill} />
      {circles}
    </svg>
  );
}

function renderHexagons(opts: {
  imageUrl?: string | null;
  groutFill: string;
  placeholderFill: string;
  cols: number;
  rows: number;
  size: number;
}) {
  const { imageUrl, groutFill, placeholderFill, cols, rows, size } = opts;
  // Flat-top hex packing
  const w = size * 2;
  const h = size * Math.sqrt(3);
  const dx = w * 0.75;
  const dy = h;
  const totalW = cols * dx + size / 2;
  const totalH = rows * dy + h;

  const hexes: React.ReactElement[] = [];
  for (let row = 0; row < rows; row++) {
    for (let c = 0; c < cols; c++) {
      const cx = c * dx + size;
      const cy = row * dy + (c % 2 === 1 ? dy / 2 : 0) + h / 2;
      const points = [0, 1, 2, 3, 4, 5]
        .map((i) => {
          const angle = (Math.PI / 3) * i;
          return `${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`;
        })
        .join(" ");
      const id = `hex-${row}-${c}`;
      if (imageUrl) {
        hexes.push(
          <g key={`${row}-${c}`}>
            <defs>
              <clipPath id={id}>
                <polygon points={points} />
              </clipPath>
            </defs>
            <image
              href={imageUrl}
              x={cx - size}
              y={cy - size}
              width={2 * size}
              height={2 * size}
              clipPath={`url(#${id})`}
              preserveAspectRatio="xMidYMid slice"
            />
          </g>,
        );
      } else {
        hexes.push(<polygon key={`${row}-${c}`} points={points} fill={placeholderFill} />);
      }
    }
  }
  return (
    <svg
      viewBox={`0 0 ${totalW} ${totalH}`}
      className="pattern-preview"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x={0} y={0} width={totalW} height={totalH} fill={groutFill} />
      {hexes}
    </svg>
  );
}

function renderPicket(opts: {
  imageUrl?: string | null;
  groutFill: string;
  placeholderFill: string;
  cols: number;
  rows: number;
  tileWidth: number;
}) {
  const { imageUrl, groutFill, placeholderFill, cols, rows, tileWidth } = opts;
  const w = tileWidth;
  const h = tileWidth * 2;
  const gap = 2;
  const dx = w + gap;
  const dy = h * 0.75 + gap;
  const totalW = cols * dx + w;
  const totalH = rows * dy + h / 4;

  const tiles: React.ReactElement[] = [];
  for (let row = 0; row < rows; row++) {
    const offsetX = row % 2 === 1 ? dx / 2 : 0;
    for (let c = 0; c < cols; c++) {
      const x = c * dx + offsetX;
      const y = row * dy;
      // Elongated hexagon (picket) — pointed top + bottom
      const points = [
        `${x + w / 2},${y}`,
        `${x + w},${y + h / 4}`,
        `${x + w},${y + (h * 3) / 4}`,
        `${x + w / 2},${y + h}`,
        `${x},${y + (h * 3) / 4}`,
        `${x},${y + h / 4}`,
      ].join(" ");
      const id = `pick-${row}-${c}`;
      if (imageUrl) {
        tiles.push(
          <g key={`${row}-${c}`}>
            <defs>
              <clipPath id={id}>
                <polygon points={points} />
              </clipPath>
            </defs>
            <image
              href={imageUrl}
              x={x}
              y={y}
              width={w}
              height={h}
              clipPath={`url(#${id})`}
              preserveAspectRatio="xMidYMid slice"
            />
          </g>,
        );
      } else {
        tiles.push(<polygon key={`${row}-${c}`} points={points} fill={placeholderFill} />);
      }
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

function renderHerringbone(opts: {
  imageUrl?: string | null;
  groutFill: string;
  placeholderFill: string;
  cols: number;
  rows: number;
  tileWidth: number;
  aspect: number;
}) {
  const { imageUrl, groutFill, placeholderFill, cols, rows, tileWidth, aspect } = opts;
  // Each grid cell holds one rotated rectangle. Alternating ±45° per cell
  // forms the classic single-weave herringbone — adjacent tiles meet at L-joints.
  const tileW = tileWidth;
  const tileH = tileWidth / aspect;
  const cellSize = Math.max(tileW, tileH) * 0.75;
  // Half-cell padding around the grid so corners of rotated tiles don't clip.
  const pad = cellSize / 2;
  const totalW = cols * cellSize + 2 * pad;
  const totalH = rows * cellSize + 2 * pad;

  const tiles: React.ReactElement[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = pad + c * cellSize + cellSize / 2;
      const cy = pad + r * cellSize + cellSize / 2;
      const angle = (r + c) % 2 === 0 ? 45 : -45;
      const x = cx - tileW / 2;
      const y = cy - tileH / 2;
      const id = `hb-${r}-${c}`;
      if (imageUrl) {
        tiles.push(
          <g key={`${r}-${c}`} transform={`rotate(${angle} ${cx} ${cy})`}>
            <defs>
              <clipPath id={id}>
                <rect x={x} y={y} width={tileW} height={tileH} />
              </clipPath>
            </defs>
            <image
              href={imageUrl}
              x={x}
              y={y}
              width={tileW}
              height={tileH}
              clipPath={`url(#${id})`}
              preserveAspectRatio="xMidYMid slice"
            />
          </g>,
        );
      } else {
        tiles.push(
          <rect
            key={`${r}-${c}`}
            x={x}
            y={y}
            width={tileW}
            height={tileH}
            fill={placeholderFill}
            transform={`rotate(${angle} ${cx} ${cy})`}
          />,
        );
      }
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

function renderCheckerboard(opts: {
  imageUrl?: string | null;
  groutFill: string;
  placeholderFill: string;
  cols: number;
  rows: number;
  tileWidth: number;
  groutWidth: number;
}) {
  const { imageUrl, groutFill, placeholderFill, cols, rows, tileWidth, groutWidth } = opts;
  // Checkerboard implies square cells regardless of detected aspect.
  const tileW = tileWidth;
  const tileH = tileWidth;
  const totalW = cols * tileW + groutWidth * (cols + 1);
  const totalH = rows * tileH + groutWidth * (rows + 1);

  const tiles: React.ReactElement[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * tileW + groutWidth * (c + 1);
      const y = r * tileH + groutWidth * (r + 1);
      const dimmed = (r + c) % 2 === 1;
      if (imageUrl) {
        tiles.push(
          <image
            key={`img-${r}-${c}`}
            href={imageUrl}
            x={x}
            y={y}
            width={tileW}
            height={tileH}
            preserveAspectRatio="xMidYMid slice"
          />,
        );
      } else {
        tiles.push(
          <rect key={`bg-${r}-${c}`} x={x} y={y} width={tileW} height={tileH} fill={placeholderFill} />,
        );
      }
      if (dimmed) {
        tiles.push(
          <rect
            key={`tint-${r}-${c}`}
            x={x}
            y={y}
            width={tileW}
            height={tileH}
            fill={groutFill}
            opacity={0.35}
          />,
        );
      }
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

function renderRectangleGrid(opts: {
  imageUrl?: string | null;
  groutFill: string;
  placeholderFill: string;
  cols: number;
  rows: number;
  tileWidth: number;
  aspect: number;
  pattern: string;
  groutWidth: number;
}) {
  const { imageUrl, groutFill, placeholderFill, cols, rows, tileWidth, aspect, pattern, groutWidth } = opts;
  const isVertical = pattern === "set vertical" || pattern === "staggered vertical";
  const tileW = isVertical ? tileWidth / aspect : tileWidth;
  const tileH = isVertical ? tileWidth : tileWidth / aspect;
  const offsetX = pattern === "staggered horizontal" ? tileW / 2 : 0;
  const offsetY = pattern === "staggered vertical" ? tileH / 2 : 0;
  const totalW = cols * tileW + groutWidth * (cols + 1);
  const totalH = rows * tileH + groutWidth * (rows + 1);

  const tiles: React.ReactElement[] = [];
  for (let r = 0; r < rows; r++) {
    const rowOffsetX = pattern === "staggered horizontal" ? (r % 2) * offsetX : 0;
    for (let c = 0; c < cols; c++) {
      const colOffsetY = pattern === "staggered vertical" ? (c % 2) * offsetY : 0;
      const x = c * tileW + groutWidth * (c + 1) + rowOffsetX;
      const y = r * tileH + groutWidth * (r + 1) + colOffsetY;
      if (x >= totalW || y >= totalH) continue;
      const clippedW = Math.min(tileW, totalW - x - groutWidth);
      const clippedH = Math.min(tileH, totalH - y - groutWidth);
      tiles.push(
        imageUrl ? (
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
            fill={placeholderFill}
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
