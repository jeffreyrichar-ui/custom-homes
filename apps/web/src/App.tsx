import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AdminImport } from "./pages/AdminImport.js";
import { ProjectsList } from "./pages/ProjectsList.js";
import { ProjectDetail } from "./pages/ProjectDetail.js";
import { NewProject } from "./pages/NewProject.js";
import { SelectionsEdit } from "./pages/SelectionsEdit.js";
import { Login } from "./pages/Login.js";
import { api } from "./lib/api.js";

type User = { id: string; email: string; name: string | null; role: string };

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    api
      .authMe()
      .then((res) => setUser(res?.user ?? null))
      .finally(() => setAuthChecked(true));
  }, []);

  if (!authChecked) return <p>Loading…</p>;

  return (
    <>
      <Nav user={user} onLogout={() => setUser(null)} />
      <main>
        <Routes>
          <Route path="/" element={<Navigate to={user ? "/projects" : "/login"} replace />} />
          <Route
            path="/login"
            element={user ? <Navigate to="/projects" replace /> : <Login onLoggedIn={setUser} />}
          />
          <Route path="/projects" element={user ? <ProjectsList /> : <Navigate to="/login" replace />} />
          <Route path="/projects/:id" element={user ? <ProjectDetail /> : <Navigate to="/login" replace />} />
          <Route path="/selections/new" element={user ? <NewProject /> : <Navigate to="/login" replace />} />
          <Route path="/selections/:id" element={user ? <SelectionsEdit /> : <Navigate to="/login" replace />} />
          <Route path="/admin/import" element={user ? <AdminImport /> : <Navigate to="/login" replace />} />
          <Route path="*" element={<p>Not found</p>} />
        </Routes>
      </main>
    </>
  );
}

function Nav({ user, onLogout }: { user: User | null; onLogout: () => void }) {
  const navigate = useNavigate();
  return (
    <nav>
      <strong>Custom Homes</strong>
      {user && (
        <>
          <Link to="/projects">Projects</Link>
          <Link to="/selections/new">+ New project</Link>
          <Link to="/admin/import">Admin Import</Link>
        </>
      )}
      <span style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
        {user ? (
          <>
            <span style={{ opacity: 0.7, fontSize: 13 }}>{user.email}</span>
            <button
              className="secondary"
              onClick={async () => {
                await api.authLogout();
                onLogout();
                navigate("/login");
              }}
            >
              Sign out
            </button>
          </>
        ) : (
          <Link to="/login">Sign in</Link>
        )}
      </span>
    </nav>
  );
}
