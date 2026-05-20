import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TradeForm } from "../components/TradeForm.js";

vi.mock("../lib/api.js", () => ({
  api: {
    suggestVendors: vi.fn().mockResolvedValue({ vendors: [] }),
    suggestBrands: vi.fn().mockResolvedValue({ brands: [] }),
    suggestStyles: vi.fn().mockResolvedValue({ styles: [] }),
    suggestColors: vi.fn().mockResolvedValue({ colors: [] }),
    suggestSkus: vi.fn().mockResolvedValue({ skus: [] }),
    skuForColor: vi.fn().mockResolvedValue({ sku: null }),
    getManufacturerImage: vi.fn().mockResolvedValue(null),
  },
}));

describe("TradeForm", () => {
  it("renders brand, style, color, and SKU fields for the tile trade", async () => {
    render(
      <TradeForm trade="tile" onCancel={() => {}} onSave={() => {}} />,
    );
    expect(screen.getByText("Brand")).toBeInTheDocument();
    expect(screen.getByText("Style")).toBeInTheDocument();
    expect(screen.getByText("Color")).toBeInTheDocument();
    expect(screen.getByText("SKU")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save entry/i })).toBeInTheDocument();
    // Flush pending suggestion fetches so act() warnings don't leak.
    await waitFor(() => undefined);
  });
});
