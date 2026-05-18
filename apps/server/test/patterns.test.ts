import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizePattern, RENDER_MODES, type RenderMode } from "@custom-homes/shared";

// Tamara's full pattern catalogue, dumped from seed/bath-tile/*.json with:
//   jq -r '.rooms[].entries[] | select(.trade=="tile") | .pattern' \
//     seed/bath-tile/*.json | grep -v '^null$' | sort | uniq -c | sort -rn
// The file holds every distinct string she's written across 218 historical
// entries. If this drifts and the count changes, regenerate the file and
// extend the explicit-mapping assertions below as needed.
const FREQ_TABLE_PATH = "/tmp/tamara-patterns.txt";

function loadFreqTable(): Array<{ count: number; pattern: string }> {
  const text = readFileSync(FREQ_TABLE_PATH, "utf8");
  const out: Array<{ count: number; pattern: string }> = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    out.push({ count: parseInt(m[1]!, 10), pattern: m[2]! });
  }
  return out;
}

const VALID: ReadonlySet<RenderMode> = new Set(RENDER_MODES);

describe("normalizePattern — explicit anchors", () => {
  it("recognises Tamara's top dropdown vocabulary verbatim", () => {
    expect(normalizePattern("set straight")).toBe("straight");
    expect(normalizePattern("set vertical straight")).toBe("straight-vertical");
    expect(normalizePattern("set horizontal straight")).toBe("straight-horizontal");
    expect(normalizePattern("set straight parallel with vanity")).toBe("straight");
    expect(normalizePattern("set horizontal staggered")).toBe("staggered-horizontal");
    expect(normalizePattern("set 30/70")).toBe("30-70");
    expect(normalizePattern("1/2 x 1 herringbone")).toBe("herringbone");
    expect(normalizePattern("set checkerboard on point")).toBe("checkerboard-on-point");
    expect(normalizePattern("4 vertical + 4 horizontal parquet design")).toBe("parquet");
    expect(normalizePattern("Lattice")).toBe("lattice");
    expect(normalizePattern("set vertical stripes")).toBe("stripes-vertical");
    expect(normalizePattern("6x6 set random, all vertical")).toBe("random");
  });

  it("treats 'set straight vertical' as an alias of 'set vertical straight'", () => {
    expect(normalizePattern("set straight vertical")).toBe("straight-vertical");
  });

  it("maps bare orientation strings", () => {
    expect(normalizePattern("set vertical")).toBe("straight-vertical");
    expect(normalizePattern("set horizontal")).toBe("straight-horizontal");
    expect(normalizePattern("straight horizontal")).toBe("straight-horizontal");
    expect(normalizePattern("shower set vertical")).toBe("straight-vertical");
    expect(normalizePattern("horizontal in shower")).toBe("straight-horizontal");
  });

  it("named layouts win over orientation hints", () => {
    expect(normalizePattern("4 vertical + 4 horizontal parquet design")).toBe("parquet");
    expect(normalizePattern("fluted set stripes vertical")).toBe("stripes-vertical");
    expect(normalizePattern("6x6 set random, all vertical")).toBe("random");
  });

  it("30-70 wins over plain orientation", () => {
    expect(normalizePattern("set 30/70")).toBe("30-70");
    expect(normalizePattern("set vertical 30/70")).toBe("30-70");
  });

  it("staggered honors orientation", () => {
    expect(normalizePattern("set horizontal staggered")).toBe("staggered-horizontal");
    expect(normalizePattern("set staggered")).toBe("staggered-horizontal");
    expect(normalizePattern("set staggered vertical")).toBe("staggered-vertical");
  });

  it("anchoring / coverage / splash-height phrases fall through to straight", () => {
    expect(normalizePattern("set straight parallel with vanity")).toBe("straight");
    expect(normalizePattern("set straight parallel with door")).toBe("straight");
    expect(normalizePattern("set parallel with vanity")).toBe("straight");
    expect(normalizePattern("straight parallel with vanity")).toBe("straight");
    expect(normalizePattern("cut to fit")).toBe("straight");
    expect(normalizePattern("full size tile")).toBe("straight");
    expect(normalizePattern("curbless shower full size tile")).toBe("straight");
    expect(normalizePattern("see attached pictures")).toBe("straight");
    expect(normalizePattern("see attached layout")).toBe("straight");
    expect(normalizePattern("to ceiling, no returns")).toBe("straight");
    expect(normalizePattern("6 inch splash")).toBe("straight");
    expect(normalizePattern("8 inch splash")).toBe("straight");
    expect(normalizePattern("1/2 sheet splash")).toBe("straight");
    expect(normalizePattern("set")).toBe("straight");
    expect(normalizePattern("4x4")).toBe("straight");
  });

  it("splash + orientation keeps the orientation", () => {
    expect(normalizePattern("set vertical, 6 inch splash")).toBe("straight-vertical");
    expect(normalizePattern("24 inch tall splash, set vertical")).toBe("straight-vertical");
    expect(normalizePattern("set vertical mosaic 12 inch splash")).toBe("straight-vertical");
    expect(normalizePattern("to ceiling vertical, no returns")).toBe("straight-vertical");
    expect(normalizePattern("all vertical with border")).toBe("straight-vertical");
    expect(normalizePattern("set vertical, all walls")).toBe("straight-vertical");
  });

  it("compound mixed-row strings fall back to straight (no layout we render today)", () => {
    // "one row straight + one row horizontal repeat" etc. — these are
    // alternating-row layouts we can't render visually yet, so we send them
    // to the plain grid. The orientation in the second clause shouldn't
    // hijack the first clause's intent, so we accept either-orientation.
    const a = normalizePattern("one row straight + one row horizontal repeat");
    expect(a === "straight" || a === "straight-horizontal").toBe(true);
    const b = normalizePattern("one row set straight + one row horizontal repeat");
    expect(b === "straight" || b === "straight-horizontal").toBe(true);
    const c = normalizePattern("one row straight + one row vertical repeat");
    expect(c === "straight" || c === "straight-vertical").toBe(true);
    const d = normalizePattern("one row horizontal + one row vertical repeat");
    // first occurrence wins in our normalizer (horizontal); either is fine.
    expect(["straight-horizontal", "straight-vertical"].includes(d)).toBe(true);
  });

  it("handles null / empty / whitespace inputs as straight", () => {
    expect(normalizePattern(null)).toBe("straight");
    expect(normalizePattern(undefined)).toBe("straight");
    expect(normalizePattern("")).toBe("straight");
    expect(normalizePattern("   ")).toBe("straight");
  });

  it("is case insensitive", () => {
    expect(normalizePattern("HERRINGBONE")).toBe("herringbone");
    expect(normalizePattern("Lattice")).toBe("lattice");
    expect(normalizePattern("SET VERTICAL STRAIGHT")).toBe("straight-vertical");
  });
});

describe("normalizePattern — every Tamara string maps to a valid render mode", () => {
  const rows = loadFreqTable();

  it("loaded the frequency table", () => {
    expect(rows.length).toBeGreaterThan(40);
  });

  it("every distinct pattern string maps to a known render mode", () => {
    const bad: string[] = [];
    for (const { pattern } of rows) {
      const mode = normalizePattern(pattern);
      if (!VALID.has(mode)) bad.push(`${pattern} → ${mode}`);
    }
    expect(bad).toEqual([]);
  });

  it("covers every historical non-null entry", () => {
    // 218 historical tile entries; ~191 carry a pattern string (rest are
    // null). Every non-null one must round-trip through the normalizer.
    const totalEntries = rows.reduce((sum, r) => sum + r.count, 0);
    expect(totalEntries).toBeGreaterThanOrEqual(150);
    for (const { pattern } of rows) {
      const mode = normalizePattern(pattern);
      expect(VALID.has(mode)).toBe(true);
    }
  });
});
