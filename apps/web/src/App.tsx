import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AdminImport } from "./pages/AdminImport.js";
import { ProjectsList } from "./pages/ProjectsList.js";
import { ProjectDetail } from "./pages/ProjectDetail.js";
import { NewProject } from "./pages/NewProject.js";
import { SelectionsEdit } from "./pages/SelectionsEdit.js";
import { Login } from "./pages/Login.js";
import { CommandBar } from "./components/CommandBar.js";
import { Icon } from "./components/Icon.js";
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
      {user && <CommandBar />}
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
      <Link to={user ? "/projects" : "/login"} style={{ textDecoration: "none" }}>
        <strong>Custom Homes</strong>
      </Link>
      {user && (
        <>
          <Link to="/projects">Projects</Link>
          <Link to="/selections/new">New project</Link>
          <Link to="/admin/import">Import</Link>
        </>
      )}
      <span className="nav-right">
        {user ? (
          <>
            <span className="nav-user muted">
              <Icon name="user" size={12} />
              {user.email}
            </span>
            <button
              className="secondary icon-button"
              onClick={async () => {
                await api.authLogout();
                onLogout();
                navigate("/login");
              }}
            >
              <Icon name="logout" />
              <span>Sign out</span>
            </button>
          </>
        ) : (
          <Link to="/login">Sign in</Link>
        )}
      </span>
    </nav>
  );
}
