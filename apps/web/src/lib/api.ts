import type { ImportResult } from "@custom-homes/shared";

const TOKEN_KEY = "custom-homes:adminToken";

export function getAdminToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; admin?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.admin) {
    const token = getAdminToken();
    if (token) headers["x-admin-token"] = token;
  }
  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    credentials: "include",
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* leave as null */
  }
  if (!res.ok) {
    const message =
      (data as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

export type ProjectSummary = {
  id: string;
  name: string;
  address: string | null;
  created_at: string;
  room_count: number;
};

export type ProjectDetailResponse = {
  project: {
    id: string;
    name: string;
    address: string | null;
    created_at: string;
    external_id: string | null;
    external_source: string | null;
  };
  rooms: Array<{
    id: string;
    room_name: string;
    external_id: string | null;
    entries_by_trade: Record<string, Array<Record<string, unknown>>>;
  }>;
};

export const api = {
  listProjects: () => request<{ projects: ProjectSummary[] }>("/api/projects"),
  getProject: (id: string) =>
    request<ProjectDetailResponse>(`/api/projects/${id}`),
  importDryRun: (payload: unknown) =>
    request<ImportResult>("/api/admin/import/dry-run", {
      method: "POST",
      body: payload,
      admin: true,
    }),
  import: (payload: unknown) =>
    request<ImportResult>("/api/admin/import", {
      method: "POST",
      body: payload,
      admin: true,
    }),

  // Phase 2 — suggestions
  suggestVendors: () =>
    request<{ vendors: { value: string; count: number }[] }>(
      `/api/suggest/vendors`,
    ),
  suggestBrands: (trade?: string) =>
    request<{ brands: { value: string; count: number }[] }>(
      `/api/suggest/brands${trade ? `?trade=${encodeURIComponent(trade)}` : ""}`,
    ),
  suggestStyles: (trade: string, brand: string) =>
    request<{ styles: { value: string; count: number }[] }>(
      `/api/suggest/styles?trade=${encodeURIComponent(trade)}&brand=${encodeURIComponent(brand)}`,
    ),
  suggestColors: (trade: string, brand: string, style?: string) =>
    request<{
      colors: { value: string; image_url: string | null; count: number }[];
    }>(
      `/api/suggest/colors?trade=${encodeURIComponent(trade)}&brand=${encodeURIComponent(brand)}${
        style ? `&style=${encodeURIComponent(style)}` : ""
      }`,
    ),
  suggestSkus: (trade: string, brand: string, color?: string) =>
    request<{ skus: { value: string; count: number }[] }>(
      `/api/suggest/skus?trade=${encodeURIComponent(trade)}&brand=${encodeURIComponent(brand)}${
        color ? `&color=${encodeURIComponent(color)}` : ""
      }`,
    ),
  skuForColor: (trade: string, brand: string, color: string) =>
    request<{ sku: string | null }>(
      `/api/suggest/sku-for-color?trade=${encodeURIComponent(trade)}&brand=${encodeURIComponent(brand)}&color=${encodeURIComponent(color)}`,
    ),

  // Phase 2 — selections writes
  createProject: (name: string, address?: string) =>
    request<{ id: string; name: string; address: string | null }>(
      "/api/selections/projects",
      { method: "POST", body: { name, address }, admin: true },
    ),
  addRoom: (projectId: string, room_name: string) =>
    request<{ id: string; room_name: string; project_id: string }>(
      `/api/selections/projects/${projectId}/rooms`,
      { method: "POST", body: { room_name }, admin: true },
    ),
  saveEntry: (roomId: string, entry: Record<string, unknown>) =>
    request<{ id: string; trade: string; is_new_entry: boolean }>(
      `/api/selections/rooms/${roomId}/entries`,
      { method: "POST", body: entry, admin: true },
    ),
  updateEntry: (
    trade: string,
    entryId: string,
    entry: Record<string, unknown>,
  ) =>
    request<{ id: string; trade: string; is_new_entry: boolean }>(
      `/api/selections/entries/${trade}/${entryId}`,
      { method: "PUT", body: entry, admin: true },
    ),
  deleteEntry: (trade: string, entryId: string) =>
    request<void>(`/api/selections/entries/${trade}/${entryId}`, {
      method: "DELETE",
      admin: true,
    }),

  // Phase 3 — manufacturer images
  getManufacturerImage: (
    brand: string,
    sku: string | null | undefined,
    style?: string | null,
    color?: string | null,
  ) => {
    const params = new URLSearchParams({ brand });
    if (sku) params.set("sku", sku);
    if (style) params.set("style", style);
    if (color) params.set("color", color);
    return request<{ image_url: string; scraped_at: string }>(
      `/api/manufacturer-images?${params.toString()}`,
    ).catch((err: Error) => {
      if (err.message === "not cached") return null;
      throw err;
    });
  },
  triggerScrape: (brand: string, sku: string) =>
    request<{
      outcome:
        | { kind: "cached"; imageUrl: string }
        | { kind: "scraped"; imageUrl: string }
        | { kind: "no-scraper"; brand: string }
        | { kind: "failed"; brand: string; sku: string; reason: string };
      registered_brands: string[];
    }>("/api/manufacturer-images/scrape", {
      method: "POST",
      body: { brand, sku },
      admin: true,
    }),
  uploadManufacturerImage: (brand: string, sku: string, dataUrl: string) =>
    request<{ image_url: string }>("/api/manufacturer-images/upload", {
      method: "POST",
      body: { brand, sku, data_url: dataUrl },
      admin: true,
    }),

  // Phase 5 — PDFs
  generateFullPdf: (projectId: string) =>
    request<{ pdf_url: string }>(`/api/pdfs/projects/${projectId}/full`, {
      method: "POST",
      admin: true,
    }),
  generateTradePdf: (projectId: string, trade: string) =>
    request<{ pdf_url: string }>(
      `/api/pdfs/projects/${projectId}/trade/${trade}`,
      { method: "POST", admin: true },
    ),

  // Phase 6 — auth
  authMe: () =>
    request<{ user: { id: string; email: string; name: string | null; role: string } }>(
      "/api/auth/check",
    ).catch((err: Error) => {
      if (err.message.includes("401") || err.message.includes("auth required") || err.message.includes("not authenticated")) {
        return null;
      }
      throw err;
    }),
  authLogout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
};
