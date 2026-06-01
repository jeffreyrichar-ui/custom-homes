import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type RecentActivityItem } from "../lib/api.js";

// Tiny relative-time helper — no new dependency required.
function timeAgo(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const sec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (sec < 45) return "just now";
  if (sec < 90) return "a minute ago";
  const min = Math.round(sec / 60);
  if (min < 45) return `${min} minutes ago`;
  if (min < 90) return "an hour ago";
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hours ago`;
  const day = Math.round(hr / 24);
  if (day < 2) return "yesterday";
  if (day < 30) return `${day} days ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo} months ago`;
  const yr = Math.round(mo / 12);
  return yr === 1 ? "a year ago" : `${yr} years ago`;
}

function dotClass(kind: RecentActivityItem["kind"]): string {
  switch (kind) {
    case "project":
      return "recent-activity-dot dot-project";
    case "room":
      return "recent-activity-dot dot-room";
    case "entry":
      return "recent-activity-dot dot-entry";
  }
}

export function RecentActivity() {
  const [items, setItems] = useState<RecentActivityItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getStats()
      .then((res) => {
        if (!cancelled) setItems(res.recent_activity ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!items) return null;
  if (items.length === 0) return null;

  return (
    <section className="recent-activity-panel" aria-label="Recent activity">
      <h2 className="recent-activity-title">Recent activity</h2>
      <ul className="recent-activity-list">
        {items.map((item, i) => {
          const body = (
            <>
              <span className={dotClass(item.kind)} aria-hidden="true" />
              <span className="recent-activity-label">{item.label}</span>
              <span className="recent-activity-time">{timeAgo(item.when)}</span>
            </>
          );
          return (
            <li key={`${item.when}-${i}`} className="recent-activity-item">
              {item.project_id ? (
                <Link
                  to={`/selections/${item.project_id}`}
                  className="recent-activity-link"
                >
                  {body}
                </Link>
              ) : (
                <span className="recent-activity-link recent-activity-link-static">
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
