import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { exampleProject, type ImportResult } from "@custom-homes/shared";
import {
  api,
  getAdminToken,
  setAdminToken,
  clearAdminToken,
} from "../lib/api.js";
import { Icon } from "../components/Icon.js";
import { useToast } from "../lib/toast.js";

const STARTER_TEXT = JSON.stringify(exampleProject, null, 2);
const FORMAT_DOCS_URL =
  "https://github.com/toddcampbellcustomhomes/custom-homes/blob/main/packages/shared/src/importContract.ts";

type Status =
  | { kind: "idle" }
  | { kind: "running"; mode: "dry-run" | "import" }
  | { kind: "ok"; mode: "dry-run" | "import"; result: ImportResult }
  | { kind: "error"; message: string };

const TABLE_LABELS: Record<string, string> = {
  projects: "Projects",
  rooms: "Rooms",
  tile_entries: "Tile",
  paint_entries: "Paint",
  carpet_entries: "Carpet",
  hardwood_entries: "Hardwood",
  cabinet_entries: "Cabinets",
  countertop_entries: "Countertops",
};

export function AdminImport() {
  const [text, setText] = useState("");
  const [token, setToken] = useState<string | null>(getAdminToken());
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [parseError, setParseError] = useState<string | null>(null);
  const { notify } = useToast();

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
    } catch {
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

  const promptForToken = () => {
    const entered = window.prompt("Enter ADMIN_TOKEN");
    if (entered) {
      setAdminToken(entered);
      setToken(entered);
    }
  };

  const resetToken = () => {
    clearAdminToken();
    setToken(null);
    notify("info", "Admin token cleared.");
  };

  const run = async (mode: "dry-run" | "import") => {
    if (!parsedPayload) return;
    setStatus({ kind: "running", mode });
    try {
      const result =
        mode === "dry-run"
          ? await api.importDryRun(parsedPayload)
          : await api.import(parsedPayload);
      setStatus({ kind: "ok", mode, result });
      if (mode === "import" && result.errors.length === 0) {
        notify("success", "Import complete.");
      } else if (mode === "dry-run" && result.errors.length === 0) {
        notify("success", "Validation passed.");
      } else {
        notify("error", `${result.errors.length} validation error(s).`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message });
      notify("error", message);
    }
  };

  const isRunning = status.kind === "running";
  const runningLabel =
    status.kind === "running"
      ? status.mode === "dry-run"
        ? "Validating…"
        : "Importing…"
      : null;
  const canRun = Boolean(parsedPayload) && !isRunning;

  return (
    <div className="admin-import-page">
      <div className="admin-import-header">
        <h1>Import historical data</h1>
        <p className="subtle">
          Paste a project JSON exported from Claude desktop. Use this to backfill
          spreadsheet-era selections so they're searchable and printable
          alongside new work.
        </p>
        <p className="muted">
          <a
            href={FORMAT_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="icon-link"
          >
            Format docs <Icon name="external" size={11} />
          </a>
        </p>
      </div>

      <div className="admin-import-card">
        <textarea
          className="admin-import-textarea"
          rows={32}
          placeholder="Paste project JSON here…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          disabled={isRunning}
        />

        {parseError && (
          <div className="errors admin-import-parse-error">
            <strong>JSON parse error:</strong> {parseError}
          </div>
        )}

        <div className="button-row admin-import-actions">
          <button
            className="secondary icon-button"
            onClick={() => setText(STARTER_TEXT)}
            disabled={isRunning}
          >
            <Icon name="image" />
            <span>Load example</span>
          </button>
          <button
            className="secondary icon-button"
            onClick={() => run("dry-run")}
            disabled={!canRun}
            title={
              !parsedPayload
                ? "Paste valid JSON to enable"
                : "Run a dry-run with no writes"
            }
          >
            <Icon name="check" />
            <span>Validate</span>
          </button>
          <button
            className="icon-button"
            onClick={() => run("import")}
            disabled={!canRun}
            title={!parsedPayload ? "Paste valid JSON to enable" : "Commit rows"}
          >
            <Icon name="upload" />
            <span>Import</span>
          </button>
          {text.trim() && !isRunning && (
            <button
              className="secondary icon-button admin-import-clear"
              onClick={() => {
                setText("");
                setStatus({ kind: "idle" });
              }}
            >
              <Icon name="x" />
              <span>Clear</span>
            </button>
          )}
          {runningLabel && (
            <span
              className="subtle admin-import-running"
              role="status"
              aria-live="polite"
            >
              <span className="skeleton-pulse admin-import-running-dot" />
              {runningLabel}
            </span>
          )}
        </div>

        <div className="admin-import-token-footer">
          {token ? (
            <>
              <span className="muted">Authenticated as admin</span>
              <span className="muted">·</span>
              <button className="link" onClick={resetToken}>
                Reset token
              </button>
            </>
          ) : (
            <>
              <span className="muted">No admin token set</span>
              <span className="muted">·</span>
              <button className="link" onClick={promptForToken}>
                Set token
              </button>
            </>
          )}
        </div>
      </div>

      {status.kind === "error" && (
        <div className="import-result-card import-result-card--error">
          <div className="import-result-header">
            <span className="import-result-icon" aria-hidden="true">
              <Icon name="warn" size={16} />
            </span>
            <div>
              <h2 className="import-result-title">Request failed</h2>
              <p className="subtle">{status.message}</p>
            </div>
          </div>
        </div>
      )}

      {status.kind === "ok" && <ResultPanel status={status} />}
    </div>
  );
}

function ResultPanel({
  status,
}: {
  status: Extract<Status, { kind: "ok" }>;
}) {
  const { result, mode } = status;
  const passed = result.errors.length === 0;
  const totals = Object.values(result.summary).reduce(
    (acc, s) => {
      acc.created += s.created;
      acc.updated += s.updated;
      acc.skipped += s.skipped;
      acc.failed += s.failed;
      return acc;
    },
    { created: 0, updated: 0, skipped: 0, failed: 0 },
  );
  const headline =
    mode === "dry-run"
      ? passed
        ? "Validation passed"
        : "Validation found issues"
      : passed
        ? "Import complete"
        : "Import finished with errors";
  const summary =
    totals.created > 0
      ? `${totals.created} row${totals.created === 1 ? "" : "s"} created`
      : totals.updated > 0
        ? `${totals.updated} row${totals.updated === 1 ? "" : "s"} updated`
        : "No changes";

  return (
    <div
      className={`import-result-card ${
        passed ? "import-result-card--ok" : "import-result-card--warn"
      }`}
    >
      <div className="import-result-header">
        <span className="import-result-icon" aria-hidden="true">
          <Icon name={passed ? "check" : "warn"} size={16} />
        </span>
        <div>
          <h2 className="import-result-title">
            {headline}
            <span className="import-result-subtitle"> · {summary}</span>
          </h2>
          <p className="subtle">
            {mode === "dry-run"
              ? "Dry-run — no rows were written. Run Import to commit."
              : "Rows have been written to the database."}
          </p>
        </div>
      </div>

      <div className="import-result-grid">
        {Object.entries(result.summary).map(([table, s]) => {
          const total = s.created + s.updated + s.skipped + s.failed;
          if (total === 0) return null;
          return (
            <div key={table} className="import-result-cell">
              <div className="import-result-cell-label">
                {TABLE_LABELS[table] ?? table}
              </div>
              <div className="import-result-cell-counts">
                {s.created > 0 && (
                  <span className="import-count import-count--created">
                    +{s.created} created
                  </span>
                )}
                {s.updated > 0 && (
                  <span className="import-count import-count--updated">
                    ~{s.updated} updated
                  </span>
                )}
                {s.skipped > 0 && (
                  <span className="import-count import-count--skipped">
                    ·{s.skipped} skipped
                  </span>
                )}
                {s.failed > 0 && (
                  <span className="import-count import-count--failed">
                    !{s.failed} failed
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {result.errors.length > 0 && (
        <ImportErrorList errors={result.errors} />
      )}

      {mode === "import" && passed && result.project_id && (
        <div className="import-result-cta">
          <Link
            to={`/selections/${result.project_id}`}
            className="primary-link"
          >
            View imported project →
          </Link>
        </div>
      )}
    </div>
  );
}

function ImportErrorList({
  errors,
}: {
  errors: ImportResult["errors"];
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, ImportResult["errors"]>();
    for (const err of errors) {
      const prefix = err.path.split(/[./]/).slice(0, 2).join(".") || "(root)";
      const list = map.get(prefix) ?? [];
      list.push(err);
      map.set(prefix, list);
    }
    return Array.from(map.entries());
  }, [errors]);

  return (
    <details className="import-error-group" open={errors.length <= 10}>
      <summary>
        {errors.length} validation error{errors.length === 1 ? "" : "s"}
      </summary>
      {grouped.map(([prefix, items]) => (
        <div key={prefix} className="import-error-prefix">
          <div className="import-error-prefix-label">{prefix}</div>
          {items.map((e, i) => (
            <div key={i} className="import-error-item">
              <code>{e.path}</code>
              {e.trade && <span className="muted"> · {e.trade}</span>}
              <span className="import-error-message"> — {e.message}</span>
            </div>
          ))}
        </div>
      ))}
    </details>
  );
}
