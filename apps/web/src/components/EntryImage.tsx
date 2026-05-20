import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";

type Props = {
  brand?: string | null;
  sku?: string | null;
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; url: string }
  | { kind: "missing" }
  | { kind: "scraping" }
  | { kind: "error"; message: string };

export function EntryImage({ brand, sku }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!brand || !sku) {
      setState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    api
      .getManufacturerImage(brand, sku)
      .then((res) => {
        if (cancelled) return;
        if (res) setState({ kind: "loaded", url: res.image_url });
        else setState({ kind: "missing" });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ kind: "error", message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [brand, sku]);

  if (!brand || !sku) return null;

  const handleUpload = async (file: File) => {
    setState({ kind: "loading" });
    try {
      const dataUrl = await readAsDataUrl(file);
      const res = await api.uploadManufacturerImage(brand, sku, dataUrl);
      setState({ kind: "loaded", url: res.image_url });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleScrape = async () => {
    setState({ kind: "scraping" });
    const res = await api.triggerScrape(brand, sku);
    if (res.outcome.kind === "scraped" || res.outcome.kind === "cached") {
      setState({ kind: "loaded", url: res.outcome.imageUrl });
    } else if (res.outcome.kind === "no-scraper") {
      setState({
        kind: "missing",
      });
      window.alert(
        `No scraper registered for ${brand}. Upload the product image manually.`,
      );
    } else {
      setState({ kind: "missing" });
      window.alert(
        `Auto-fetch failed: ${res.outcome.reason}\n\nUpload the product image manually.`,
      );
    }
  };

  return (
    <div className="entry-image">
      {state.kind === "loaded" && (
        <img src={state.url} alt={`${brand} ${sku}`} className="entry-image-img" />
      )}
      {state.kind === "loading" && (
        <div className="entry-image-placeholder">Loading…</div>
      )}
      {state.kind === "scraping" && (
        <div className="entry-image-placeholder">Trying auto-fetch…</div>
      )}
      {state.kind === "missing" && (
        <div className="entry-image-placeholder">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
          >
            Upload image
          </button>
          <button
            type="button"
            className="link experimental"
            onClick={handleScrape}
            title="Best-effort fetch from manufacturer site. Often fails — manual upload is the reliable path."
          >
            try auto-fetch (experimental)
          </button>
        </div>
      )}
      {state.kind === "error" && (
        <div className="entry-image-placeholder error">
          {state.message}{" "}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
          >
            Upload manually
          </button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
        }}
      />
    </div>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}
