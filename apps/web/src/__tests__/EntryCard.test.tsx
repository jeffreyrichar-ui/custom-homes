import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EntryCard } from "../components/EntryCard.js";

vi.mock("../lib/api.js", () => ({
  api: {
    getManufacturerImage: vi.fn().mockResolvedValue(null),
  },
}));

describe("EntryCard", () => {
  it("renders primary fields and edit/delete actions for a tile entry", () => {
    const entry = {
      id: "e1",
      brand: "Daltile",
      color: "Arctic White",
      style: "Subway",
      location_in_room: "shower_walls",
      pattern: "staggered horizontal",
    };
    render(
      <EntryCard
        trade="tile"
        entry={entry}
        rooms={[{ id: "r1", room_name: "Master Bath" }]}
        currentRoomId="r1"
        onEdit={() => {}}
        onDelete={() => {}}
        onDuplicate={() => {}}
      />,
    );
    expect(screen.getByText("Daltile")).toBeInTheDocument();
    expect(screen.getByText("Arctic White")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });
});
