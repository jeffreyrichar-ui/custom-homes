import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AutoComplete, type Suggestion } from "../components/AutoComplete.js";

describe("AutoComplete", () => {
  it("filters options to those matching the typed query", async () => {
    const user = userEvent.setup();
    const options: Suggestion[] = [
      { value: "Daltile" },
      { value: "Bedrosians" },
      { value: "Emser" },
    ];
    render(
      <AutoComplete
        label="Brand"
        value=""
        onChange={() => {}}
        fetchSuggestions={() => Promise.resolve(options)}
        fetchKey="brands"
      />,
    );
    const input = await screen.findByRole("textbox");
    await user.click(input);
    // All three show on focus (empty query).
    expect(await screen.findByText("Daltile")).toBeInTheDocument();
    expect(screen.getByText("Bedrosians")).toBeInTheDocument();
    expect(screen.getByText("Emser")).toBeInTheDocument();
  });
});
