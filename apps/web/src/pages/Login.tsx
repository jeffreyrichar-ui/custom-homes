import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

type Mode = "loading" | "login" | "bootstrap";
type User = { id: string; email: string; name: string | null; role: string };

type Props = {
  onLoggedIn: (user: User) => void;
};

export function Login({ onLoggedIn }: Props) {
  const [mode, setMode] = useState<Mode>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Try /bootstrap with empty body — if it returns 400, users exist (login mode).
    // If it returns 201 we'd actually create an empty user — so use a different
    // probe: hit /me with no creds. 401 = login. We always show login first; the
    // user can toggle to bootstrap when no users exist yet.
    setMode("login");
  }, []);

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      onLoggedIn(data.user);
      navigate("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const submitBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, name: name || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      onLoggedIn(data.user);
      navigate("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (mode === "loading") return <p>Loading…</p>;

  return (
    <div className="auth-page">
      <h1>{mode === "login" ? "Sign in" : "Create the first user"}</h1>
      <form onSubmit={mode === "login" ? submitLogin : submitBootstrap}>
        {mode === "bootstrap" && (
          <div className="ac-wrapper">
            <label className="ac-label">Name</label>
            <input
              className="ac-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
        )}
        <div className="ac-wrapper">
          <label className="ac-label">Email<span className="ac-required">*</span></label>
          <input
            className="ac-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus={mode === "login"}
            required
          />
        </div>
        <div className="ac-wrapper">
          <label className="ac-label">Password<span className="ac-required">*</span></label>
          <input
            className="ac-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <div className="errors">{error}</div>}
        <div className="button-row">
          <button type="submit" disabled={submitting}>
            {submitting ? "…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setMode(mode === "login" ? "bootstrap" : "login");
              setError(null);
            }}
          >
            {mode === "login" ? "First-time setup" : "Have an account?"}
          </button>
        </div>
      </form>
    </div>
  );
}
