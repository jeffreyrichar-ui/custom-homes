import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ProjectSummary } from "../lib/api.js";
import { StatsStrip } from "../components/StatsStrip.js";
import { Icon } from "../components/Icon.js";

type Sort = "recent" | "name" | "rooms";

const ONBOARDING_KEY = "cb_onboarding_dismissed";

export function ProjectsList() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [totalEntries, setTotalEntries] = useState<number | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(ONBOARDING_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    api
      .listProjects()
      .then((res) => setProjects(res.projects))
      .catch((err: Error) => setError(err.message));
    api
      .getStats()
      .then((s) => setTotalEntries(s.entries.total ?? 0))
      .catch(() => setTotalEntries(0));
  }, []);

  const filtered = useMemo(() => {
    if (!projects) return null;
    const q = query.trim().toLowerCase();
    let out = q
      ? projects.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.address ?? "").toLowerCase().includes(q),
        )
      : [...projects];
    if (sort === "name") {
      out.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "rooms") {
      out.sort((a, b) => b.room_count - a.room_count);
    } else {
      out.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
    return out;
  }, [projects, query, sort]);

  const dismissBanner = () => {
    try {
      window.localStorage.setItem(ONBOARDING_KEY, "1");
    } catch {
      /* ignore */
    }
    setBannerDismissed(true);
  };

  if (error)
    return (
      <>
        <h1>Projects</h1>
        <div className="errors">Failed to load: {error}</div>
      </>
    );

  if (!projects) {
    return (
      <>
        <h1>Projects</h1>
        <div className="project-grid" aria-busy="true" aria-label="Loading projects">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-project-card">
              <div className="skeleton-pulse sk-title" />
              <div className="skeleton-pulse sk-sub" />
              <div className="skeleton-pulse sk-meta" />
            </div>
          ))}
        </div>
      </>
    );
  }

  const showOnboardingBanner =
    !bannerDismissed && projects.length > 0 && totalEntries === 0;

  return (
    <>
      <div className="projects-header">
        <h1>Projects</h1>
        {projects.length > 0 && (
          <Link to="/selections/new" className="primary-link">
            + New project
          </Link>
        )}
      </div>

      {showOnboardingBanner && (
        <div className="onboarding-banner" role="status">
          <span className="onboarding-banner-icon" aria-hidden="true">
            <Icon name="search" size={16} />
          </span>
          <span className="onboarding-banner-text">
            Tip: open a project and press <kbd>⌘K</kbd> to jump quickly between
            rooms and tools.
          </span>
          <button
            type="button"
            className="onboarding-banner-dismiss"
            aria-label="Dismiss tip"
            onClick={dismissBanner}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      <StatsStrip />

      {projects.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-state-card-icon" aria-hidden="true">
            <Icon name="plus" size={28} />
          </div>
          <h2>Start your first project</h2>
          <p>
            Custom Homes structures finish selections — tile, paint, hardwood,
            cabinets — per room per home. Begin with the master bath, the tile
            that everything else negotiates around.
          </p>
          <div className="empty-state-card-actions">
            <Link to="/selections/new" className="primary-link">
              New project
            </Link>
            <Link to="/admin/import" className="secondary-link">
              Import historical data
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="projects-toolbar">
            <input
              className="ac-input"
              placeholder={`Search ${projects.length} projects…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="ac-input"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              style={{ width: "auto" }}
            >
              <option value="recent">Most recent</option>
              <option value="name">Name (A–Z)</option>
              <option value="rooms">Most rooms</option>
            </select>
          </div>

          {filtered && filtered.length === 0 ? (
            <p className="subtle">No projects match "{query}".</p>
          ) : (
            <div className="project-grid">
              {filtered?.map((p) => (
                <Link
                  to={`/selections/${p.id}`}
                  key={p.id}
                  className="project-card"
                >
                  <h3 className="project-card-name">{p.name}</h3>
                  {p.address && <p className="subtle">{p.address}</p>}
                  <div className="project-card-meta-strip">
                    <span>
                      {p.room_count} {p.room_count === 1 ? "room" : "rooms"}
                    </span>
                    {p.entry_count > 0 && (
                      <>
                        <span className="dot">·</span>
                        <span>{p.entry_count} selections</span>
                      </>
                    )}
                    {p.top_brand && (
                      <>
                        <span className="dot">·</span>
                        <span>Top {p.top_brand}</span>
                      </>
                    )}
                    <span className="dot">·</span>
                    <span>
                      Added {new Date(p.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
