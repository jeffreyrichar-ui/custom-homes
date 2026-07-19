import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  btSnapshotSchema,
  type BtSnapshot,
} from "@custom-homes/shared";

/**
 * Transport abstraction for BuilderTrend. The sync engine only ever sees a
 * validated BtSnapshot, so the fixture client (dev/sandbox/tests) and the
 * HTTP client (production, once partner credentials exist) are drop-in
 * replacements for each other.
 */
export type BtClient = {
  fetchSnapshot(): Promise<BtSnapshot>;
};

/** Reads a checked-in snapshot — the sandbox has no route to BT's servers. */
export function makeFixtureBtClient(
  file = path.resolve(process.cwd(), "../../seed/buildertrend/snapshot.json"),
): BtClient {
  return {
    async fetchSnapshot() {
      const raw = JSON.parse(await readFile(file, "utf8"));
      return btSnapshotSchema.parse(raw);
    },
  };
}

/**
 * Live partner-API client. The endpoint shape is provisional — adjust the
 * paths/paging when real credentials arrive in September; everything past
 * this file is transport-independent and will not need to change.
 */
export function makeHttpBtClient(opts: { baseUrl: string; apiKey: string }): BtClient {
  const headers = {
    accept: "application/json",
    "x-api-key": opts.apiKey,
  };
  const get = async (p: string): Promise<unknown> => {
    const res = await fetch(`${opts.baseUrl.replace(/\/$/, "")}${p}`, { headers });
    if (!res.ok) {
      throw new Error(`BuilderTrend ${p} responded ${res.status}`);
    }
    return res.json();
  };
  return {
    async fetchSnapshot() {
      const jobs = (await get("/v1/jobs")) as unknown[];
      const selections: unknown[] = [];
      for (const job of jobs as Array<{ id?: unknown }>) {
        if (typeof job?.id !== "string") continue;
        const rows = (await get(`/v1/jobs/${encodeURIComponent(job.id)}/selections`)) as unknown[];
        selections.push(...rows);
      }
      return btSnapshotSchema.parse({ jobs, selections });
    },
  };
}
