import { describe, expect, it } from "vitest";
import { renderPatternSvg } from "../src/services/pdf/patternSvg.js";
import { renderProjectHtml } from "../src/services/pdf/html.js";

type FixtureEntry = Record<string, unknown>;
type FixtureRoom = {
  id: string;
  room_name: string;
  entries_by_trade: Record<string, FixtureEntry[]>;
};

describe("renderPatternSvg", () => {
  it("returns a string containing '<svg' and resolves the input grout color as hex", () => {
    const svg = renderPatternSvg({ groutColor: "#abc123", notes: "12x24" });
    expect(typeof svg).toBe("string");
    expect(svg).toContain("<svg");
    expect(svg).toContain("#abc123");
  });

  it("renders penny round shapes as circles when notes say 'penny round'", () => {
    const svg = renderPatternSvg({ notes: "2 inch penny round" });
    expect(svg).toContain("<svg");
    expect(svg).toContain("<circle");
  });

  it("renders hexagon shapes as polygons when notes say 'hex'", () => {
    const svg = renderPatternSvg({ notes: "3 inch hex" });
    expect(svg).toContain("<svg");
    expect(svg).toContain("<polygon");
  });

  it("renders picket shapes as a 6-point polygon with pointed top and bottom", () => {
    const svg = renderPatternSvg({ notes: "picket tile" });
    expect(svg).toContain("<svg");
    expect(svg).toContain("<polygon");
    // The picket polygon should have exactly 6 points per tile:
    // top-middle, top-right, bottom-right, bottom-middle, bottom-left, top-left.
    // We pull the first <polygon points="..."/> and assert it has 6 coordinate pairs.
    const m = svg.match(/<polygon points="([^"]+)"/);
    expect(m).not.toBeNull();
    const pts = m![1]!.trim().split(/\s+/);
    expect(pts).toHaveLength(6);
    // Picket shape: first and fourth points share the same x (middle),
    // with the first having the smallest y (pointed top) and the fourth the largest (pointed bottom).
    const xy = pts.map((p) => p.split(",").map(Number) as [number, number]);
    const [topMidX, topMidY] = xy[0]!;
    const [bottomMidX, bottomMidY] = xy[3]!;
    expect(topMidX).toBeCloseTo(bottomMidX);
    expect(topMidY).toBeLessThan(bottomMidY);
    // Pointed top: the second/sixth points sit lower than the top-middle.
    expect(xy[1]![1]).toBeGreaterThan(topMidY);
    expect(xy[5]![1]).toBeGreaterThan(topMidY);
    // Pointed bottom: the third/fifth points sit higher than the bottom-middle.
    expect(xy[2]![1]).toBeLessThan(bottomMidY);
    expect(xy[4]![1]).toBeLessThan(bottomMidY);
  });

  it("renders plain rectangle inputs as rects with non-equal width and height", () => {
    const svg = renderPatternSvg({ notes: "12x24" });
    expect(svg).toContain("<rect");
    // Find a tile <rect> (skip the first one which is the full-svg grout backing).
    // The tile rects use the placeholder fill #d8d2c4.
    const tileRect = svg.match(/<rect [^>]*fill="#d8d2c4"[^>]*\/>/);
    expect(tileRect).not.toBeNull();
    const w = tileRect![0].match(/width="([\d.]+)"/);
    const h = tileRect![0].match(/height="([\d.]+)"/);
    expect(w).not.toBeNull();
    expect(h).not.toBeNull();
    expect(parseFloat(w![1]!)).not.toBeCloseTo(parseFloat(h![1]!));
  });

  it("renders square inputs as rects with equal tile width and height", () => {
    const svg = renderPatternSvg({ notes: "4x4" });
    expect(svg).toContain("<rect");
    // Verify the viewBox + grid math: a 5x4 grid of square tiles + 2px grout
    // should yield viewBox dims where (totalW - groutOffsets) / cols == (totalH - groutOffsets) / rows.
    const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    expect(vb).not.toBeNull();
    const totalW = parseFloat(vb![1]!);
    const totalH = parseFloat(vb![2]!);
    const cols = 5;
    const rows = 4;
    const groutWidth = 2;
    const tileW = (totalW - groutWidth * (cols + 1)) / cols;
    const tileH = (totalH - groutWidth * (rows + 1)) / rows;
    expect(tileW).toBeCloseTo(tileH);
    // And a tile <rect> should be square.
    const tileRect = svg.match(/<rect [^>]*fill="#d8d2c4"[^>]*\/>/);
    expect(tileRect).not.toBeNull();
    const w = parseFloat(tileRect![0].match(/width="([\d.]+)"/)![1]!);
    const h = parseFloat(tileRect![0].match(/height="([\d.]+)"/)![1]!);
    expect(w).toBeCloseTo(h);
  });

  it("renders <image href=...> elements when imageUrl is provided", () => {
    const url = "https://example.com/tile.png";
    const svg = renderPatternSvg({ imageUrl: url, notes: "12x24" });
    expect(svg).toContain("<image href=");
    expect(svg).toContain(url);
  });

  it("resolves the named grout color 'Bleached Wood' to '#c9bfa9'", () => {
    const svg = renderPatternSvg({ groutColor: "Bleached Wood", notes: "12x24" });
    expect(svg).toContain("#c9bfa9");
  });

  it("passes through a literal hex grout color like '#abc123'", () => {
    const svg = renderPatternSvg({ groutColor: "#abc123", notes: "12x24" });
    expect(svg).toContain("#abc123");
  });
});

describe("renderProjectHtml", () => {
  const project = {
    id: "p1",
    name: "Maple St Renovation",
    address: "123 Maple St",
  };
  const generatedAt = new Date("2026-05-18T00:00:00Z");
  const imageByBrandSku = new Map<string, string>();

  it("produces valid HTML wrapping (doctype + matching html tags)", () => {
    const html = renderProjectHtml({
      project,
      rooms: [],
      imageByBrandSku,
      generatedAt,
    });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  it("renders one <section class=\"room\"> per room in the full project layout", () => {
    const rooms: FixtureRoom[] = [
      {
        id: "r1",
        room_name: "Primary Bath",
        entries_by_trade: {
          tile: [{ brand: "Daltile", sku: "T-1", location_in_room: "floor" }],
        },
      },
      {
        id: "r2",
        room_name: "Guest Bath",
        entries_by_trade: {
          paint: [{ brand: "Sherwin-Williams", color_name: "Alabaster", sku: "SW-7008" }],
        },
      },
    ];
    const html = renderProjectHtml({
      project,
      rooms,
      imageByBrandSku,
      generatedAt,
    });
    const sectionMatches = html.match(/<section class="room">/g);
    expect(sectionMatches).not.toBeNull();
    expect(sectionMatches!.length).toBe(2);
    expect(html).toContain("Primary Bath");
    expect(html).toContain("Guest Bath");
  });

  it("uses per-room paging layout and subtitle for tradeFilter='tile'", () => {
    const rooms: FixtureRoom[] = [
      {
        id: "r1",
        room_name: "Primary Bath",
        entries_by_trade: {
          tile: [{ brand: "Daltile", sku: "T-1", location_in_room: "floor" }],
        },
      },
    ];
    const html = renderProjectHtml({
      project,
      rooms,
      tradeFilter: "tile",
      imageByBrandSku,
      generatedAt,
    });
    expect(html).toContain('class="room-page"');
    expect(html).toContain("page-break-after: always");
    expect(html).toContain("Per-room tile reference. One bathroom per page.");
  });

  it("sorts entries in spatial order in the per-trade layout", () => {
    const rooms: FixtureRoom[] = [
      {
        id: "r1",
        room_name: "Primary Bath",
        entries_by_trade: {
          tile: [
            { brand: "B", sku: "VAN", location_in_room: "vanity_backsplash", notes: "vanity note" },
            { brand: "B", sku: "TUB", location_in_room: "tub_surround", notes: "tub note" },
            { brand: "B", sku: "NICHE", location_in_room: "shower_niche", notes: "niche note" },
            { brand: "B", sku: "WALL", location_in_room: "shower_walls", notes: "wall note" },
            { brand: "B", sku: "FLR", location_in_room: "floor", notes: "floor note" },
          ],
        },
      },
    ];
    const html = renderProjectHtml({
      project,
      rooms,
      tradeFilter: "tile",
      imageByBrandSku,
      generatedAt,
    });
    // Each entry's notes are unique, so we can locate their offsets in the
    // rendered HTML and assert the correct ordering.
    const idxFloor = html.indexOf("floor note");
    const idxWall = html.indexOf("wall note");
    const idxNiche = html.indexOf("niche note");
    const idxTub = html.indexOf("tub note");
    const idxVan = html.indexOf("vanity note");
    expect(idxFloor).toBeGreaterThan(-1);
    expect(idxWall).toBeGreaterThan(-1);
    expect(idxNiche).toBeGreaterThan(-1);
    expect(idxTub).toBeGreaterThan(-1);
    expect(idxVan).toBeGreaterThan(-1);
    expect(idxFloor).toBeLessThan(idxWall);
    expect(idxWall).toBeLessThan(idxNiche);
    expect(idxNiche).toBeLessThan(idxTub);
    expect(idxTub).toBeLessThan(idxVan);
  });

  it("renders grout-color chips in the room header for the per-trade layout", () => {
    const rooms: FixtureRoom[] = [
      {
        id: "r1",
        room_name: "Primary Bath",
        entries_by_trade: {
          tile: [
            { brand: "Daltile", sku: "T-1", location_in_room: "floor", grout_color: "Bleached Wood" },
            { brand: "Daltile", sku: "T-2", location_in_room: "shower_walls", grout_color: "Snow White" },
          ],
        },
      },
    ];
    const html = renderProjectHtml({
      project,
      rooms,
      tradeFilter: "tile",
      imageByBrandSku,
      generatedAt,
    });
    expect(html).toContain('class="chip grout"');
    expect(html).toContain("grout: Bleached Wood");
    expect(html).toContain("grout: Snow White");
  });

  it("renders notes inside a <div class=\"entry-notes\"> block", () => {
    const rooms: FixtureRoom[] = [
      {
        id: "r1",
        room_name: "Primary Bath",
        entries_by_trade: {
          tile: [
            {
              brand: "Daltile",
              sku: "T-1",
              location_in_room: "floor",
              notes: "Lay parallel with vanity",
            },
          ],
        },
      },
    ];
    const html = renderProjectHtml({
      project,
      rooms,
      imageByBrandSku,
      generatedAt,
    });
    expect(html).toContain('<div class="entry-notes">');
    expect(html).toContain("Lay parallel with vanity");
    // The notes string should appear inside the entry-notes div.
    const noteBlock = html.match(/<div class="entry-notes">([^<]*)<\/div>/);
    expect(noteBlock).not.toBeNull();
    expect(noteBlock![1]).toContain("Lay parallel with vanity");
  });
});
