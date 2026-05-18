import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { exampleProject, type ImportResult } from "@custom-homes/shared";
import {
  api,
  getAdminToken,
  setAdminToken,
  clearAdminToken,
} from "../lib/api.js";

const STARTER_TEXT = JSON.stringify(exampleProject, null, 2);

type Status =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; mode: "dry-run" | "import"; result: ImportResult }
  | { kind: "error"; message: string };

export function AdminImport() {
  const [text, setText] = useState("");
  const [token, setToken] = useState<string | null>(getAdminToken());
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      const entered = window.prompt(
        "Enter ADMIN_TOKEN (matches your server's .env)",
      );
      if (entered) {
        setAdminToken(entered);
        setToken(entered);
      }
    }
  }, [token]);

  const parsedPayload = useMemo(() => {
    if (!text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [text]);

  useEffect(() => {
    if (text.trim()) {
      try {
        JSON.parse(text);
        setParseError(null);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : String(err));
      }
    } else {
      setParseError(null);
    }
  }, [text]);

  const run = async (mode: "dry-run" | "import") => {
    if (!parsedPayload) return;
    setStatus({ kind: "running" });
    try {
      const result =
        mode === "dry-run"
          ? await api.importDryRun(parsedPayload)
          : await api.import(parsedPayload);
      setStatus({ kind: "ok", mode, result });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <>
      <div className="admin-import-header">
        <h1>Import historical projects</h1>
        <p className="subtle">
          Paste structured JSON from a past project. <strong>Validate</strong>{" "}
          runs a dry-run; <strong>Import</strong> commits the rows.
          Re-importing is idempotent.
        </p>
      </div>

      {!token && (
        <div className="token-banner">
          No admin token set.{" "}
          <button
            className="secondary"
            onClick={() => {
              const entered = window.prompt("Enter ADMIN_TOKEN");
              if (entered) {
                setAdminToken(entered);
                setToken(entered);
              }
            }}
          >
            Set token
          </button>
        </div>
      )}
      {token && (
        <div className="token-banner token-banner-ok">
          ✓ Admin token configured.
          <button
            className="link"
            style={{ marginLeft: "auto" }}
            onClick={() => {
              clearAdminToken();
              setToken(null);
            }}
          >
            Clear
          </button>
        </div>
      )}

      <div className="import-layout">
        <div>
          <textarea
            rows={32}
            placeholder="Paste project JSON here..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="button-row">
            <button
              onClick={() => run("dry-run")}
              disabled={!parsedPayload || status.kind === "running"}
            >
              Validate
            </button>
            <button
              onClick={() => run("import")}
              disabled={!parsedPayload || status.kind === "running"}
            >
              Import
            </button>
            <button
              className="secondary"
              onClick={() => setText(STARTER_TEXT)}
            >
              Load example
            </button>
            <button className="secondary" onClick={() => setText("")}>
              Clear
            </button>
          </div>
          {parseError && (
            <div className="errors">
              <strong>JSON parse error:</strong> {parseError}
            </div>
          )}
        </div>

        <div>
          <ResultsPanel status={status} />
        </div>
      </div>
    </>
  );
}

function ResultsPanel({ status }: { status: Status }) {
  if (status.kind === "idle") {
    return (
      <div className="results">
        <em>Run Validate or Import to see results.</em>
      </div>
    );
  }
  if (status.kind === "running") {
    return (
      <div className="results">
        <em>Running…</em>
      </div>
    );
  }
  if (status.kind === "error") {
    return (
      <div className="results errors">
        <strong>Request failed:</strong> {status.message}
      </div>
    );
  }
  const { result, mode } = status;
  return (
    <div className="results">
      <h3>{mode === "dry-run" ? "Dry-run result" : "Import result"}</h3>
      {mode === "import" && result.project_id && (
        <p>
          Project saved.{" "}
          <Link to={`/projects/${result.project_id}`}>View project →</Link>
        </p>
      )}
      {Object.entries(result.summary).map(([table, s]) => {
        const total = s.created + s.updated + s.skipped + s.failed;
        if (total === 0) return null;
        return (
          <div key={table} className="summary-row">
            <span>{table}</span>
            <span>
              {s.created > 0 && <span className="tag created">+{s.created}</span>}
              {s.updated > 0 && <span className="tag updated">~{s.updated}</span>}
              {s.skipped > 0 && <span className="tag skipped">·{s.skipped}</span>}
              {s.failed > 0 && <span className="tag failed">!{s.failed}</span>}
            </span>
          </div>
        );
      })}
      {result.errors.length > 0 && (
        <details className="errors" open>
          <summary>{result.errors.length} error(s)</summary>
          {result.errors.map((e, i) => (
            <div key={i} className="error-item">
              <strong>{e.path}</strong> {e.trade && <code>{e.trade}</code>} —{" "}
              {e.message}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
