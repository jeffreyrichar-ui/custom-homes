import { describe, expect, it } from "vitest";
import {
  normalizeEntry,
  STYLE_BRAND_HINTS,
  COLOR_BRAND_HINTS,
  type TileEntry,
} from "../src/db/normalizeSeedBrands.js";

function tileEntry(overrides: Partial<TileEntry>): TileEntry {
  return {
    trade: "tile",
    brand: "Unknown",
    style: null,
    color: null,
    sku: null,
    grout_color: null,
    edge_profile: null,
    pattern: null,
    location_in_room: "vanity_backsplash",
    notes: null,
    vendor: null,
    ...overrides,
  };
}

describe("normalizeSeedBrands.normalizeEntry — Unknown resolution", () => {
  it("resolves brand=Unknown + style='Lana ZL 07' to Marazzi Zellige Neo", () => {
    const out = normalizeEntry(
      tileEntry({
        style: "Lana ZL 07",
        notes: "Updated 4.23.26.",
      }),
    );
    expect(out.brand).toBe("Marazzi");
    expect(out.style).toBe("Zellige Neo");
    expect(out.color).toBe("Lana ZL 07");
    expect(out.notes).toMatch(/RESOLVED: Marazzi Zellige Neo/);
  });

  it("strips the MANUFACTURER UNKNOWN marker when style resolves", () => {
    const out = normalizeEntry(
      tileEntry({
        style: "Lana ZL 07",
        notes: "1.5x9 | MANUFACTURER UNKNOWN: confirm with Tamara",
      }),
    );
    expect(out.notes).not.toMatch(/MANUFACTURER UNKNOWN/);
    expect(out.notes).toMatch(/1\.5x9/);
    expect(out.notes).toMatch(/RESOLVED/);
  });

  it("resolves brand=Unknown + style=null + color='Rolling Fog' to Emser Visconde", () => {
    const out = normalizeEntry(
      tileEntry({
        style: null,
        color: "Rolling Fog",
        location_in_room: "tub_surround",
        notes: "AMBIGUOUS: portal listed 'Color Number: Rolling Fog' with no brand. 12x24. Confirm brand with Tamara.",
      }),
    );
    expect(out.brand).toBe("Emser");
    expect(out.style).toBe("Visconde");
    expect(out.color).toBe("Rolling Fog");
    expect(out.sku).toBe("Rolling Fog");
    expect(out.notes).toMatch(/RESOLVED: Emser Visconde/);
    expect(out.notes).not.toMatch(/AMBIGUOUS/);
    expect(out.notes).not.toMatch(/Confirm brand with Tamara/);
  });

  it("does NOT match color hints when a style is already set", () => {
    // brand=Unknown + style="Pins Blue Mosaic" + color="Rolling Fog"
    // is genuinely ambiguous — color hints only apply when style is empty.
    const out = normalizeEntry(
      tileEntry({
        style: "Pins Blue Mosaic",
        color: "Rolling Fog",
        vendor: "Masonry Center",
        notes: "wainscot cap with jolly to match | MANUFACTURER UNKNOWN: confirm with Tamara",
      }),
    );
    expect(out.brand).not.toBe("Emser");
  });

  it("restores brand=vendor when Unknown + vendor known + no hint matches", () => {
    // The 13 Masonry Center entries with un-identifiable styles
    // (Zagara, Pascal, Brechia Mandoria, etc.) become brand=Masonry
    // Center so the distribution reflects "vendor known, manufacturer
    // unknown" rather than the opaque "Unknown".
    const out = normalizeEntry(
      tileEntry({
        style: "Zagara",
        color: "Matte",
        vendor: "Masonry Center",
        notes: "3x6; to ceiling | MANUFACTURER UNKNOWN: confirm with Tamara",
      }),
    );
    expect(out.brand).toBe("Masonry Center");
    expect(out.vendor).toBe("Masonry Center");
    expect(out.style).toBe("Zagara");
    expect(out.notes).toMatch(/MANUFACTURER UNKNOWN/);
  });

  it("leaves brand=Unknown alone when style/color are blank and no vendor known", () => {
    const out = normalizeEntry(
      tileEntry({
        style: null,
        color: null,
        vendor: null,
      }),
    );
    expect(out.brand).toBe("Unknown");
  });

  it("is idempotent — re-running normalize on the output yields the same entry", () => {
    const input = tileEntry({
      style: "Lana ZL 07",
      notes: "Updated 4.23.26.",
    });
    const once = normalizeEntry(input);
    const twice = normalizeEntry(once);
    expect(twice).toEqual(once);
  });

  it("is idempotent for vendor-restore case as well", () => {
    const input = tileEntry({
      style: "Zagara",
      color: "Matte",
      vendor: "Masonry Center",
      notes: "MANUFACTURER UNKNOWN: confirm with Tamara",
    });
    const once = normalizeEntry(input);
    const twice = normalizeEntry(once);
    expect(twice).toEqual(once);
  });

  it("preserves prior real-manufacturer normalizations (vendor + brand set)", () => {
    const input = tileEntry({
      brand: "Ragno",
      style: "Look Olivia",
      vendor: "Masonry Center",
    });
    expect(normalizeEntry(input)).toEqual(input);
  });
});

describe("normalizeSeedBrands.normalizeEntry — existing rules (regression)", () => {
  it("promotes Masonry Center vendor + identifiable style to manufacturer", () => {
    const out = normalizeEntry(
      tileEntry({
        brand: "Masonry Center",
        style: "Persuade White",
      }),
    );
    expect(out.brand).toBe("Marazzi");
    expect(out.vendor).toBe("Masonry Center");
    expect(out.style).toBe("White");
  });

  it("renames Dal → Daltile", () => {
    const out = normalizeEntry(tileEntry({ brand: "Dal", style: "Remedy" }));
    expect(out.brand).toBe("Daltile");
  });

  it("expands Dal Spirit → Daltile with Spirit-prefixed style", () => {
    const out = normalizeEntry(
      tileEntry({ brand: "Dal Spirit", style: "Mesmerist MM30" }),
    );
    expect(out.brand).toBe("Daltile");
    expect(out.style).toBe("Spirit Mesmerist MM30");
  });
});

describe("STYLE_BRAND_HINTS and COLOR_BRAND_HINTS shape", () => {
  it("each STYLE_BRAND_HINTS entry has a non-empty style and brand", () => {
    for (const h of STYLE_BRAND_HINTS) {
      expect(h.style.length).toBeGreaterThan(0);
      expect(h.brand.length).toBeGreaterThan(0);
    }
  });

  it("each COLOR_BRAND_HINTS entry has a non-empty color, brand, and style", () => {
    for (const h of COLOR_BRAND_HINTS) {
      expect(h.color.length).toBeGreaterThan(0);
      expect(h.brand.length).toBeGreaterThan(0);
      expect(h.style.length).toBeGreaterThan(0);
    }
  });
});
