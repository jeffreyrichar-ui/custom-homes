import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

type Stats = {
  projects: number;
  rooms: number;
  entries: Record<string, number>;
  top_brands: { brand: string; count: number }[];
  top_vendors: { vendor: string; count: number }[];
  novel_entries: number;
};

export function StatsStrip() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getStats()
      .then((res) => {
        if (!cancelled) setStats(res);
      })
      .catch(() => {
        /* silently ignore — strip is non-critical */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!stats) return null;

  const topBrandName = stats.top_brands[0]?.brand ?? "—";

  return (
    <div className="summary-tiles">
      <div className="summary-tile">
        <div className="summary-tile-value">{stats.projects}</div>
        <div className="summary-tile-label">Projects</div>
      </div>
      <div className="summary-tile">
        <div className="summary-tile-value">{stats.rooms}</div>
        <div className="summary-tile-label">Rooms</div>
      </div>
      <div className="summary-tile">
        <div className="summary-tile-value">{stats.entries.total ?? 0}</div>
        <div className="summary-tile-label">Total selections</div>
      </div>
      <div className="summary-tile">
        <div className="summary-tile-value">{stats.novel_entries}</div>
        <div className="summary-tile-label">New combinations</div>
      </div>
      <div className="summary-tile">
        <div className="summary-tile-value">{topBrandName}</div>
        <div className="summary-tile-label">Top brand</div>
      </div>
    </div>
  );
}
