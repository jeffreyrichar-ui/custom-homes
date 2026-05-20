import { describe, expect, it } from "vitest";
import { detectShape, detectAspect } from "@custom-homes/shared";

describe("detectShape", () => {
  it("matches named shapes from notes", () => {
    expect(detectShape({ notes: "2 inch penny round" })).toBe("penny round");
    expect(detectShape({ notes: "3 inch hex / 6 inch splash" })).toBe("hexagon");
    expect(detectShape({ color: "Pearl MR 44 PICKET" })).toBe("picket");
    expect(detectShape({ style: "Subway" })).toBe("subway");
    expect(detectShape({ notes: "Mosaic Palladiana under tub" })).toBe("palladiana mosaic");
  });

  it("falls back to square vs rectangle from dimensions", () => {
    expect(detectShape({ notes: "24x24; cut to fit" })).toBe("square");
    expect(detectShape({ notes: "12x24 parallel with vanity" })).toBe("rectangle");
    expect(detectShape({ size: "2x10" })).toBe("rectangle");
    expect(detectShape({ notes: "4x4 ring pattern" })).toBe("square");
  });

  it("returns unknown when no signal", () => {
    expect(detectShape({})).toBe("unknown");
    expect(detectShape({ notes: "nothing useful" })).toBe("unknown");
  });

  it("prefers named shapes over dimensional inference", () => {
    expect(detectShape({ notes: "0.75 inch penny round (3/4)" })).toBe("penny round");
  });
});

describe("detectAspect", () => {
  it("derives w/h from notes", () => {
    expect(detectAspect({ notes: "12x24" })).toBeCloseTo(0.5);
    expect(detectAspect({ notes: "24x12" })).toBeCloseTo(2);
    expect(detectAspect({ notes: "4x4" })).toBeCloseTo(1);
  });
  it("defaults to 2 when no dim found", () => {
    expect(detectAspect({})).toBe(2);
  });
});
