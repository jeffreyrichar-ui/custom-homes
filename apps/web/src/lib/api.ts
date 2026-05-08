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
};
