import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "../lib/toast.js";

function Trigger() {
  const { notify } = useToast();
  return (
    <button type="button" onClick={() => notify("success", "Saved!")}>
      fire
    </button>
  );
}

describe("useToast", () => {
  it("renders a toast message after notify() is called", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "fire" }));
    expect(await screen.findByText("Saved!")).toBeInTheDocument();
  });
});
