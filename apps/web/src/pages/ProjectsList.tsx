import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ProjectSummary } from "../lib/api.js";

export function ProjectsList() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listProjects()
      .then((res) => setProjects(res.projects))
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error)
    return (
      <>
        <h1>Projects</h1>
        <div className="errors">Failed to load: {error}</div>
      </>
    );
  if (!projects) return <p>Loading…</p>;

  return (
    <>
      <h1>Projects</h1>
      {projects.length === 0 ? (
        <p>
          No projects yet. <Link to="/admin/import">Import some →</Link>
        </p>
      ) : (
        projects.map((p) => (
          <div key={p.id} className="project-card">
            <h3>
              <Link to={`/projects/${p.id}`}>{p.name}</Link>
            </h3>
            {p.address && <p>{p.address}</p>}
            <small>
              {p.room_count} room{p.room_count === 1 ? "" : "s"} · created{" "}
              {new Date(p.created_at).toLocaleString()}
            </small>
          </div>
        ))
      )}
    </>
  );
}
