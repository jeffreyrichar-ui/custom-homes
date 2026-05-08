import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { TRADE_KINDS } from "@custom-homes/shared";
import { api, type ProjectDetailResponse } from "../lib/api.js";

const HIDE_KEYS = new Set([
  "id",
  "room_id",
  "created_at",
  "synced_at",
  "external_id",
  "external_source",
]);

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ProjectDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .getProject(id)
      .then((res) => setData(res))
      .catch((err: Error) => setError(err.message));
  }, [id]);

  if (error)
    return (
      <>
        <h1>Project</h1>
        <div className="errors">Failed to load: {error}</div>
      </>
    );
  if (!data) return <p>Loading…</p>;

  const { project, rooms } = data;

  return (
    <>
      <p>
        <Link to="/projects">← All projects</Link>
      </p>
      <h1>{project.name}</h1>
      {project.address && <p>{project.address}</p>}
      {project.external_id && (
        <p>
          <code>
            {project.external_source}:{project.external_id}
          </code>
        </p>
      )}

      {rooms.map((room) => (
        <div key={room.id} className="room-block">
          <h2>{room.room_name}</h2>
          {TRADE_KINDS.map((trade) => {
            const entries = room.entries_by_trade[trade] ?? [];
            if (entries.length === 0) return null;
            const cols = collectColumns(entries);
            return (
              <div key={trade} className="trade-section">
                <h3>{trade}</h3>
                <table className="trade-table">
                  <thead>
                    <tr>
                      {cols.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e, i) => (
                      <tr key={i}>
                        {cols.map((c) => (
                          <td key={c}>{formatCell(e[c])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

function collectColumns(rows: Array<Record<string, unknown>>): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (HIDE_KEYS.has(k)) continue;
      if (r[k] === null || r[k] === undefined) continue;
      set.add(k);
    }
  }
  return Array.from(set);
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}
