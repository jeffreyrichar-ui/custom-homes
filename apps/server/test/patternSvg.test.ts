import { describe, expect, it } from "vitest";
import { renderPatternSvg } from "../src/services/pdf/patternSvg.js";

describe("renderPatternSvg dispatch", () => {
  it("renders palladiana as irregular polygon shards, not circles", () => {
    const svg = renderPatternSvg({ style: "Palladiana", pattern: "" });
    expect(svg).toContain("<polygon");
    expect(svg).not.toContain("<circle");
  });

  it("keeps penny round on circles", () => {
    const svg = renderPatternSvg({ style: "Penny Round Mosaic", pattern: "" });
    expect(svg).toContain("<circle");
  });

  it("palladiana layout is deterministic (web preview must match PDF)", () => {
    // clipPath ids are intentionally unique per render — strip them before
    // comparing; the geometry itself must be identical run to run.
    const stripIds = (svg: string) =>
      svg.replace(/id="[^"]*"/g, "").replace(/url\(#[^)]*\)/g, "");
    const a = renderPatternSvg({ style: "Palladiana", pattern: "" });
    const b = renderPatternSvg({ style: "Palladiana", pattern: "" });
    expect(stripIds(a)).toBe(stripIds(b));
  });

  it("orients by pattern mode, not written dimension order", () => {
    const horizontal = renderPatternSvg({ pattern: "set horizontal straight", notes: "12x24" });
    const flipped = renderPatternSvg({ pattern: "set horizontal straight", notes: "24x12" });
    expect(horizontal).toBe(flipped);
  });

  it("alternating-rows mixes landscape and portrait courses", () => {
    const svg = renderPatternSvg({
      pattern: "one row straight + one row horizontal repeat",
      notes: "12x24",
    });
    expect(svg).toContain("<rect");
    // Courses alternate orientation — the placeholder rects must include at
    // least one landscape (w > h) and one portrait (h > w) tile.
    const tiles = Array.from(
      svg.matchAll(/<rect x="[^"]+" y="[^"]+" width="([\d.]+)" height="([\d.]+)" fill="#d8d2c4"\/>/g),
    ).map((m) => ({ w: Number(m[1]), h: Number(m[2]) }));
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.some((t) => t.w > t.h)).toBe(true);
    expect(tiles.some((t) => t.h > t.w)).toBe(true);
  });
});

describe("renderPatternSvg image underlay", () => {
  const url = "https://example.com/tile.jpg";

  it.each([
    ["grid", { pattern: "set straight", notes: "12x24" }],
    ["staggered", { pattern: "set horizontal staggered", notes: "3x6 subway" }],
    ["hexagon", { style: "8 inch hexagon" }],
    ["penny round", { style: "Penny Round" }],
    ["picket", { style: "Picket" }],
    ["palladiana", { style: "Palladiana" }],
    ["herringbone", { pattern: "1/2 x 1 herringbone" }],
    ["checkerboard", { pattern: "set checkerboard on point" }],
    ["parquet", { pattern: "4 vertical + 4 horizontal parquet design" }],
    ["lattice", { pattern: "Lattice" }],
    ["stripes", { pattern: "set vertical stripes" }],
    ["random", { pattern: "6x6 set random, all vertical" }],
    ["alternating rows", { pattern: "one row straight + one row horizontal repeat", notes: "12x24" }],
  ] as const)(
    "%s draws a placeholder underlay beneath every image tile",
    (_name, opts) => {
      const svg = renderPatternSvg({ ...opts, imageUrl: url });
      const images = (svg.match(/<image /g) ?? []).length;
      const placeholders = (svg.match(/#d8d2c4/g) ?? []).length;
      expect(images).toBeGreaterThan(0);
      // At least one placeholder-filled shape per image tile — a broken
      // image URL must degrade to the normal pattern, not a blank slab.
      expect(placeholders).toBeGreaterThanOrEqual(images);
    },
  );
});
