import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ProjectSummary } from "../lib/api.js";

type Sort = "recent" | "name" | "rooms";

export function ProjectsList() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");

  useEffect(() => {
    api
      .listProjects()
      .then((res) => setProjects(res.projects))
      .catch((err: Error) => setError(err.message));
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
        <div className="projects-loading">Loading…</div>
      </>
    );
  }

  return (
    <>
      <div className="projects-header">
        <h1>Projects</h1>
        <Link to="/selections/new" className="primary-link">
          + New project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          <p>No projects yet.</p>
          <p>
            <Link to="/selections/new">Create your first project →</Link> or{" "}
            <Link to="/admin/import">import from JSON →</Link>
          </p>
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
                  <h3>{p.name}</h3>
                  {p.address && <p className="subtle">{p.address}</p>}
                  <div className="project-meta">
                    <span>
                      {p.room_count} {p.room_count === 1 ? "room" : "rooms"}
                    </span>
                    <span>·</span>
                    <span>{new Date(p.created_at).toLocaleDateString()}</span>
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
