import {
  detectShape,
  detectAspect,
  normalizePattern,
  type RenderMode,
  type TileShape,
} from "@custom-homes/shared";

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
  const mode = normalizePattern(pattern);

  switch (mode) {
    case "herringbone":
      return renderHerringbone({ imageUrl, groutFill, placeholderFill, cols, rows, tileWidth, aspect });
    case "checkerboard-on-point":
      return renderCheckerboardOnPoint({ imageUrl, groutFill, placeholderFill, cols, rows, tileWidth });
    case "parquet":
      return renderParquet({ imageUrl, groutFill, placeholderFill, cols, rows, tileWidth });
    case "lattice":
      return renderLattice({ imageUrl, groutFill, placeholderFill, cols, rows, tileWidth });
    case "stripes-vertical":
      return renderStripesVertical({ imageUrl, groutFill, placeholderFill, cols, rows, tileWidth, aspect });
    case "random":
      return renderRandomRotation({ imageUrl, groutFill, placeholderFill, cols, rows, tileWidth, aspect });
    default:
      return renderRectangleGrid({
        imageUrl,
        groutFill,
        placeholderFill,
        cols,
        rows,
        tileWidth,
        aspect,
        mode,
        groutWidth,
      });
  }
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
  const { imageUrl, groutFill, placeholderFill, cols, rows, tileWidth } = opts;
  void tileWidth;
  void opts.aspect;
  // True 2:1 domino herringbone, mirroring renderHerringboneSvg in the
  // server PDF renderer. The plane is tiled by an H tile [0,2S]x[0,S] and
  // its V partner [2S,3S]x[-S,S] repeated at every lattice translation
  // (p+3q, p-q)·S — each tile's end abuts the side of its perpendicular
  // neighbor, forming the interlocking L-joints. The whole field is rotated
  // 45° for the classic point-up look Tamara's "1/2 x 1 herringbone"
  // describes. The 2:1 ratio is inherent to the pattern, so the detected
  // tile aspect is deliberately ignored.
  const S = 26;
  const inset = 1;
  const totalW = cols * S * 1.6;
  const totalH = rows * S * 1.6;
  const cx = totalW / 2;
  const cy = totalH / 2;
  const reach = Math.ceil((totalW + totalH) / (2 * S)) + 2;
  const radius = Math.sqrt(totalW * totalW + totalH * totalH) / 2 + 3 * S;

  const tiles: React.ReactElement[] = [];
  let n = 0;
  for (let p = -reach; p <= reach; p++) {
    for (let q = -reach; q <= reach; q++) {
      const ox = cx + (p + 3 * q) * S;
      const oy = cy + (p - q) * S;
      const dx = ox - cx;
      const dy = oy - cy;
      if (dx * dx + dy * dy > radius * radius) continue;
      const rects = [
        { x: ox + inset, y: oy + inset, w: 2 * S - 2 * inset, h: S - 2 * inset },
        { x: ox + 2 * S + inset, y: oy - S + inset, w: S - 2 * inset, h: 2 * S - 2 * inset },
      ];
      for (const rct of rects) {
        const id = `hb-${n++}`;
        if (imageUrl) {
          tiles.push(
            <g key={id}>
              <defs>
                <clipPath id={id}>
                  <rect x={rct.x} y={rct.y} width={rct.w} height={rct.h} />
                </clipPath>
              </defs>
              <image
                href={imageUrl}
                x={rct.x}
                y={rct.y}
                width={rct.w}
                height={rct.h}
                clipPath={`url(#${id})`}
                preserveAspectRatio="xMidYMid slice"
              />
            </g>,
          );
        } else {
          tiles.push(
            <rect key={id} x={rct.x} y={rct.y} width={rct.w} height={rct.h} fill={placeholderFill} />,
          );
        }
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
      <g transform={`rotate(45 ${cx} ${cy})`}>{tiles}</g>
    </svg>
  );
}

function renderCheckerboardOnPoint(opts: {
  imageUrl?: string | null;
  groutFill: string;
  placeholderFill: string;
  cols: number;
  rows: number;
  tileWidth: number;
}) {
  const { imageUrl, groutFill, placeholderFill, cols, rows, tileWidth } = opts;
  // A chessboard rotated 45°. Diamond centers within a row sit one full
  // diagonal apart (touching at left/right points); each successive row
  // drops half a diagonal and shifts half a diagonal, filling the gaps.
  // Rotating a chessboard 45° makes its diagonals horizontal, and diagonals
  // are monochrome — so the dim tint alternates BY ROW, giving every
  // diamond four opposite-color edge neighbors. Mirrors
  // renderCheckerboardOnPointSvg in the server PDF renderer.
  const side = tileWidth;
  const diag = side * Math.SQRT2;
  const half = diag / 2;
  const pad = half;
  const dcols = Math.max(2, Math.ceil(cols / 2));
  const drows = rows * 2;
  const totalW = dcols * diag + 2 * pad;
  const totalH = drows * half + 2 * pad;
  // Inset each drawn square slightly so a grout seam shows between diamonds.
  const inset = 1.5;
  const drawSide = side - 2 * inset;

  const tiles: React.ReactElement[] = [];
  for (let r = 0; r <= drows; r++) {
    const rowShift = r % 2 === 1 ? half : 0;
    const dimmed = r % 2 === 1;
    for (let c = 0; c <= dcols; c++) {
      const ccx = pad + c * diag + rowShift;
      const ccy = pad + r * half;
      const x = ccx - drawSide / 2;
      const y = ccy - drawSide / 2;
      const id = `cob-${r}-${c}`;
      if (imageUrl) {
        tiles.push(
          <g key={`img-${r}-${c}`} transform={`rotate(45 ${ccx} ${ccy})`}>
            <defs>
              <clipPath id={id}>
                <rect x={x} y={y} width={drawSide} height={drawSide} />
              </clipPath>
            </defs>
            <image
              href={imageUrl}
              x={x}
              y={y}
              width={drawSide}
              height={drawSide}
              clipPath={`url(#${id})`}
              preserveAspectRatio="xMidYMid slice"
            />
            {dimmed && (
              <rect
                x={x}
                y={y}
                width={drawSide}
                height={drawSide}
                fill={groutFill}
                opacity={0.45}
              />
            )}
          </g>,
        );
      } else {
        tiles.push(
          <rect
            key={`bg-${r}-${c}`}
            x={x}
            y={y}
            width={drawSide}
            height={drawSide}
            fill={dimmed ? groutFill : placeholderFill}
            transform={`rotate(45 ${ccx} ${ccy})`}
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

function renderParquet(opts: {
  imageUrl?: string | null;
  groutFill: string;
  placeholderFill: string;
  cols: number;
  rows: number;
  tileWidth: number;
}) {
  const { imageUrl, groutFill, placeholderFill, cols, rows, tileWidth } = opts;
  // Tamara's "4 vertical + 4 horizontal" — square parquet blocks of 4 tiles,
  // alternating block orientation in a checkerboard arrangement. Grout seams
  // between the four strips of a block; flush strips render as one solid
  // square. Mirrors renderParquetSvg in the server PDF renderer.
  const tileLong = tileWidth;
  const block = tileLong; // square block side = 4 short × 1 long
  const groutWidth = 2;
  const stripShort = (tileLong - 3 * groutWidth) / 4;
  const bcols = Math.max(2, Math.ceil(cols / 2));
  const brows = Math.max(2, Math.ceil(rows / 2));
  const totalW = bcols * block + groutWidth * (bcols + 1);
  const totalH = brows * block + groutWidth * (brows + 1);

  const tiles: React.ReactElement[] = [];
  for (let br = 0; br < brows; br++) {
    for (let bc = 0; bc < bcols; bc++) {
      const x0 = bc * block + groutWidth * (bc + 1);
      const y0 = br * block + groutWidth * (br + 1);
      const vertical = (br + bc) % 2 === 0; // alternate block orientation
      for (let i = 0; i < 4; i++) {
        const step = i * (stripShort + groutWidth);
        const x = vertical ? x0 + step : x0;
        const y = vertical ? y0 : y0 + step;
        const w = vertical ? stripShort : tileLong;
        const h = vertical ? tileLong : stripShort;
        if (imageUrl) {
          tiles.push(
            <image
              key={`p-${br}-${bc}-${i}`}
              href={imageUrl}
              x={x}
              y={y}
              width={w}
              height={h}
              preserveAspectRatio="xMidYMid slice"
            />,
          );
        } else {
          tiles.push(
            <rect key={`p-${br}-${bc}-${i}`} x={x} y={y} width={w} height={h} fill={placeholderFill} />,
          );
        }
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

function renderLattice(opts: {
  imageUrl?: string | null;
  groutFill: string;
  placeholderFill: string;
  cols: number;
  rows: number;
  tileWidth: number;
}) {
  const { imageUrl, groutFill, placeholderFill, cols, rows, tileWidth } = opts;
  // Basket weave — super-cells alternate between a stacked horizontal pair
  // and a side-by-side vertical pair, separated by an internal grout seam.
  // Drawing both pairs in one cell just paints the later pair over the
  // earlier one, so each cell draws only its winning pair. Mirrors
  // renderLatticeSvg in the server PDF renderer.
  const long = tileWidth;
  const cell = long; // super-cell side (one weave unit)
  const groutWidth = 2;
  const stripShort = (long - groutWidth) / 2;
  const ucols = Math.max(2, Math.ceil(cols / 2));
  const urows = Math.max(2, Math.ceil(rows / 2));
  const totalW = ucols * cell + groutWidth * (ucols + 1);
  const totalH = urows * cell + groutWidth * (urows + 1);

  const tiles: React.ReactElement[] = [];
  for (let ur = 0; ur < urows; ur++) {
    for (let uc = 0; uc < ucols; uc++) {
      const x0 = uc * cell + groutWidth * (uc + 1);
      const y0 = ur * cell + groutWidth * (ur + 1);
      const flip = (ur + uc) % 2 === 1;
      const pair = flip
        ? [
            { x: x0, y: y0, w: long, h: stripShort },
            { x: x0, y: y0 + stripShort + groutWidth, w: long, h: stripShort },
          ]
        : [
            { x: x0, y: y0, w: stripShort, h: long },
            { x: x0 + stripShort + groutWidth, y: y0, w: stripShort, h: long },
          ];
      for (let i = 0; i < pair.length; i++) {
        const p = pair[i]!;
        if (imageUrl) {
          tiles.push(
            <image
              key={`l-${ur}-${uc}-${i}`}
              href={imageUrl}
              x={p.x}
              y={p.y}
              width={p.w}
              height={p.h}
              preserveAspectRatio="xMidYMid slice"
            />,
          );
        } else {
          tiles.push(
            <rect
              key={`l-${ur}-${uc}-${i}`}
              x={p.x}
              y={p.y}
              width={p.w}
              height={p.h}
              fill={placeholderFill}
            />,
          );
        }
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

function renderStripesVertical(opts: {
  imageUrl?: string | null;
  groutFill: string;
  placeholderFill: string;
  cols: number;
  rows: number;
  tileWidth: number;
  aspect: number;
}) {
  const { imageUrl, groutFill, placeholderFill, cols, rows, tileWidth, aspect } = opts;
  // Tall narrow tiles set in columns. Alternate columns get a darker tint
  // overlay to simulate the two-tone stripe (e.g. fluted alternating color).
  const tileW = tileWidth / Math.max(1.5, aspect);
  const tileH = tileWidth * 1.5;
  const groutWidth = 2;
  const totalW = cols * tileW + groutWidth * (cols + 1);
  const totalH = rows * tileH + groutWidth * (rows + 1);

  const tiles: React.ReactElement[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * tileW + groutWidth * (c + 1);
      const y = r * tileH + groutWidth * (r + 1);
      const darker = c % 2 === 1;
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
        if (darker) {
          tiles.push(
            <rect
              key={`tint-${r}-${c}`}
              x={x}
              y={y}
              width={tileW}
              height={tileH}
              fill="#000"
              opacity={0.18}
            />,
          );
        }
      } else {
        tiles.push(
          <rect
            key={`bg-${r}-${c}`}
            x={x}
            y={y}
            width={tileW}
            height={tileH}
            fill={darker ? "#9a958a" : placeholderFill}
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

function renderRandomRotation(opts: {
  imageUrl?: string | null;
  groutFill: string;
  placeholderFill: string;
  cols: number;
  rows: number;
  tileWidth: number;
  aspect: number;
}) {
  const { imageUrl, groutFill, placeholderFill, cols, rows, tileWidth, aspect } = opts;
  // "6x6 set random, all vertical" — same square-ish tile per cell, but each
  // cell is rotated by one of {0, 90, 180, 270}° based on a deterministic
  // pseudo-random seed so layouts are reproducible.
  const side = Math.min(tileWidth, tileWidth / aspect) * 1.1;
  const groutWidth = 2;
  const totalW = cols * side + groutWidth * (cols + 1);
  const totalH = rows * side + groutWidth * (rows + 1);

  const tiles: React.ReactElement[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * side + groutWidth * (c + 1);
      const y = r * side + groutWidth * (r + 1);
      // Deterministic pseudo-randomization — same seed always picks the
      // same rotation, so the layout matches the PDF.
      const seed = (r * 31 + c * 17 + r * c) % 4;
      const rot = seed * 90;
      const cx = x + side / 2;
      const cy = y + side / 2;
      if (imageUrl) {
        tiles.push(
          <image
            key={`r-${r}-${c}`}
            href={imageUrl}
            x={x}
            y={y}
            width={side}
            height={side}
            transform={`rotate(${rot} ${cx} ${cy})`}
            preserveAspectRatio="xMidYMid slice"
          />,
        );
      } else {
        tiles.push(
          <rect
            key={`r-${r}-${c}`}
            x={x}
            y={y}
            width={side}
            height={side}
            fill={placeholderFill}
            transform={`rotate(${rot} ${cx} ${cy})`}
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
  mode: RenderMode;
  groutWidth: number;
}) {
  const { imageUrl, groutFill, placeholderFill, cols, rows, tileWidth, aspect, mode, groutWidth } = opts;
  const isVertical = mode === "straight-vertical" || mode === "staggered-vertical";
  const tileW = isVertical ? tileWidth / aspect : tileWidth;
  const tileH = isVertical ? tileWidth : tileWidth / aspect;
  // Stagger offset — half-tile for plain staggered, ~1/3 tile for the
  // 30/70 asymmetric variant Tamara uses (where each row offsets by 30%).
  const offsetFraction = mode === "30-70" ? 0.3 : 0.5;
  const offsetX = mode === "staggered-horizontal" || mode === "30-70" ? tileW * offsetFraction : 0;
  const offsetY = mode === "staggered-vertical" ? tileH * 0.5 : 0;
  const totalW = cols * tileW + groutWidth * (cols + 1);
  const totalH = rows * tileH + groutWidth * (rows + 1);

  const tiles: React.ReactElement[] = [];
  const pushTile = (key: string, x: number, y: number, w: number, h: number) => {
    if (w < 1 || h < 1) return;
    tiles.push(
      imageUrl ? (
        <image
          key={key}
          href={imageUrl}
          x={x}
          y={y}
          width={w}
          height={h}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <rect key={key} x={x} y={y} width={w} height={h} fill={placeholderFill} />
      ),
    );
  };
  for (let r = 0; r < rows; r++) {
    const rowOffsetX = (mode === "staggered-horizontal" || mode === "30-70") ? (r % 2) * offsetX : 0;
    // Offset rows start with a cut tile filling the leading gap, the way a
    // real running-bond course starts against a wall. Mirrors the server
    // renderer.
    if (rowOffsetX > 0) {
      const y = r * tileH + groutWidth * (r + 1);
      pushTile(`cut-r${r}`, groutWidth, y, rowOffsetX - groutWidth, Math.min(tileH, totalH - y - groutWidth));
    }
    for (let c = 0; c < cols; c++) {
      const colOffsetY = mode === "staggered-vertical" ? (c % 2) * offsetY : 0;
      // Offset columns likewise get a leading cut tile at the top.
      if (r === 0 && colOffsetY > 0) {
        const cx = c * tileW + groutWidth * (c + 1);
        pushTile(`cut-c${c}`, cx, groutWidth, Math.min(tileW, totalW - cx - groutWidth), colOffsetY - groutWidth);
      }
      const x = c * tileW + groutWidth * (c + 1) + rowOffsetX;
      const y = r * tileH + groutWidth * (r + 1) + colOffsetY;
      if (x >= totalW || y >= totalH) continue;
      const clippedW = Math.min(tileW, totalW - x - groutWidth);
      const clippedH = Math.min(tileH, totalH - y - groutWidth);
      pushTile(`${r}-${c}`, x, y, clippedW, clippedH);
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
