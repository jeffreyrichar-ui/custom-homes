import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { TRADE_KINDS, type TradeKind } from "@custom-homes/shared";
import { api, type ProjectDetailResponse } from "../lib/api.js";

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

  const summary = useMemo(() => {
    if (!data) return null;
    const counts: Record<TradeKind, number> = {
      tile: 0,
      paint: 0,
      carpet: 0,
      hardwood: 0,
      cabinet: 0,
      countertop: 0,
    };
    let total = 0;
    for (const room of data.rooms) {
      for (const trade of TRADE_KINDS) {
        const n = room.entries_by_trade[trade]?.length ?? 0;
        counts[trade] += n;
        total += n;
      }
    }
    return { counts, total };
  }, [data]);

  if (error)
    return (
      <>
        <h1>Project</h1>
        <div className="errors">Failed to load: {error}</div>
      </>
    );
  if (!data || !summary)
    return (
      <>
        <h1>Loading…</h1>
        <div className="project-detail-loading">
          <div className="skeleton skeleton-line skeleton-line-lg" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-block" />
        </div>
      </>
    );

  const { project, rooms } = data;

  return (
    <>
      <p>
        <Link to="/projects">← All projects</Link>
      </p>
      <div className="project-detail-header">
        <div>
          <h1>{project.name}</h1>
          {project.address && <p className="subtle">{project.address}</p>}
          {project.external_id && (
            <p className="muted">
              <code>
                {project.external_source}:{project.external_id}
              </code>
            </p>
          )}
        </div>
        <Link to={`/selections/${project.id}`} className="primary-link">
          Open in editor →
        </Link>
      </div>

      <div className="summary-tiles">
        <div className="summary-tile">
          <div className="summary-tile-value">{rooms.length}</div>
          <div className="summary-tile-label">Rooms</div>
        </div>
        <div className="summary-tile">
          <div className="summary-tile-value">{summary.total}</div>
          <div className="summary-tile-label">Total selections</div>
        </div>
        {TRADE_KINDS.filter((t) => summary.counts[t] > 0).map((t) => (
          <div key={t} className="summary-tile">
            <div className="summary-tile-value">{summary.counts[t]}</div>
            <div className="summary-tile-label">{t}</div>
          </div>
        ))}
      </div>

      {rooms.map((room) => {
        const roomTotal = TRADE_KINDS.reduce(
          (n, t) => n + (room.entries_by_trade[t]?.length ?? 0),
          0,
        );
        return (
          <div key={room.id} className="room-block">
            <div className="room-header">
              <h2>{room.room_name}</h2>
              <span className="room-count">
                {roomTotal} {roomTotal === 1 ? "selection" : "selections"}
              </span>
            </div>
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
                          <th key={c}>{c.replace(/_/g, " ")}</th>
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
        );
      })}
    </>
  );
}

const HIDE_KEYS = new Set([
  "id",
  "room_id",
  "created_at",
  "synced_at",
  "external_id",
  "external_source",
  "trade",
  "is_new_entry",
  "status",
  "allowance",
  "deadline",
  "image_url",
]);

function collectColumns(rows: Array<Record<string, unknown>>): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (HIDE_KEYS.has(k)) continue;
      if (r[k] === null || r[k] === undefined || r[k] === "") continue;
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
