import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProjectsList } from "../pages/ProjectsList.js";

vi.mock("../lib/api.js", () => ({
  api: {
    listProjects: vi.fn(),
    getStats: vi.fn(),
  },
}));

import { api } from "../lib/api.js";

describe("ProjectsList", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders the empty-state hero card when there are zero projects", async () => {
    (api.listProjects as ReturnType<typeof vi.fn>).mockResolvedValue({
      projects: [],
    });
    (api.getStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      projects: 0,
      rooms: 0,
      entries: { total: 0 },
      top_brands: [],
      top_vendors: [],
      novel_entries: 0,
    });

    render(
      <MemoryRouter>
        <ProjectsList />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: /start your first project/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^new project$/i })).toHaveAttribute(
      "href",
      "/selections/new",
    );
    expect(
      screen.getByRole("link", { name: /import historical data/i }),
    ).toHaveAttribute("href", "/admin/import");
  });

  it("renders skeleton placeholders while projects are loading", () => {
    // Never-resolving promise so we stay in the loading state.
    (api.listProjects as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );
    (api.getStats as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );

    const { container } = render(
      <MemoryRouter>
        <ProjectsList />
      </MemoryRouter>,
    );

    expect(
      container.querySelector("[aria-busy='true']"),
    ).toBeInTheDocument();
    expect(
      container.querySelectorAll(".skeleton-project-card").length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("shows the onboarding banner when projects exist but no entries do", async () => {
    (api.listProjects as ReturnType<typeof vi.fn>).mockResolvedValue({
      projects: [
        {
          id: "p1",
          name: "Henderson Residence",
          address: "812 Oak Ridge Dr",
          created_at: "2026-05-01T00:00:00Z",
          room_count: 2,
        },
      ],
    });
    (api.getStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      projects: 1,
      rooms: 2,
      entries: { total: 0 },
      top_brands: [],
      top_vendors: [],
      novel_entries: 0,
    });

    render(
      <MemoryRouter>
        <ProjectsList />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/Tip: open a project and press/i),
    ).toBeInTheDocument();
    // Project card uses the polished class.
    await waitFor(() => {
      expect(screen.getByText("Henderson Residence")).toBeInTheDocument();
    });
  });

  it("hides the onboarding banner once dismissed in localStorage", async () => {
    window.localStorage.setItem("cb_onboarding_dismissed", "1");
    (api.listProjects as ReturnType<typeof vi.fn>).mockResolvedValue({
      projects: [
        {
          id: "p1",
          name: "Henderson Residence",
          address: null,
          created_at: "2026-05-01T00:00:00Z",
          room_count: 0,
        },
      ],
    });
    (api.getStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      projects: 1,
      rooms: 0,
      entries: { total: 0 },
      top_brands: [],
      top_vendors: [],
      novel_entries: 0,
    });

    render(
      <MemoryRouter>
        <ProjectsList />
      </MemoryRouter>,
    );

    await screen.findByText("Henderson Residence");
    expect(screen.queryByText(/Tip: open a project/i)).not.toBeInTheDocument();
  });
});
