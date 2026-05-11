import { useState } from "react";
import { TRADE_KINDS } from "@custom-homes/shared";
import { api } from "../lib/api.js";

type Props = { projectId: string };

type State =
  | { kind: "idle" }
  | { kind: "running"; label: string }
  | { kind: "done"; url: string; label: string }
  | { kind: "error"; message: string };

export function PdfActions({ projectId }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const run = async (label: string, fn: () => Promise<{ pdf_url: string }>) => {
    setState({ kind: "running", label });
    try {
      const res = await fn();
      setState({ kind: "done", url: res.pdf_url, label });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="pdf-actions">
      <button
        type="button"
        disabled={state.kind === "running"}
        onClick={() =>
          run("Full project", () => api.generateFullPdf(projectId))
        }
      >
        Full project PDF
      </button>
      <select
        className="ac-input"
        style={{ width: "auto" }}
        defaultValue=""
        onChange={(e) => {
          const t = e.target.value;
          e.currentTarget.value = "";
          if (!t) return;
          run(`${t} sheet`, () => api.generateTradePdf(projectId, t));
        }}
      >
        <option value="">Per-trade PDF…</option>
        {TRADE_KINDS.map((t) => (
          <option key={t} value={t}>
            {t} sheet
          </option>
        ))}
      </select>
      {state.kind === "running" && (
        <span className="pdf-status">Generating {state.label}…</span>
      )}
      {state.kind === "done" && (
        <span className="pdf-status">
          {state.label} ready —{" "}
          <a href={state.url} target="_blank" rel="noopener noreferrer">
            open / copy link
          </a>
        </span>
      )}
      {state.kind === "error" && (
        <span className="pdf-status error">{state.message}</span>
      )}
    </div>
  );
}
