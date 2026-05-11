import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { EntryImage } from "./EntryImage.js";
import { PatternPreview } from "./PatternPreview.js";

type Props = {
  entry: Record<string, unknown>;
};

export function TileEntryPreview({ entry }: Props) {
  const brand = typeof entry.brand === "string" ? entry.brand : null;
  const sku = typeof entry.sku === "string" ? entry.sku : null;
  const groutColor = typeof entry.grout_color === "string" ? entry.grout_color : null;
  const pattern = typeof entry.pattern === "string" ? entry.pattern : null;

  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!brand || !sku) return;
    let cancelled = false;
    api
      .getManufacturerImage(brand, sku)
      .then((res) => {
        if (!cancelled) setImageUrl(res?.image_url ?? null);
      })
      .catch(() => { /* ignore */ });
    return () => {
      cancelled = true;
    };
  }, [brand, sku]);

  // Show pattern preview if we have at least pattern or grout to render.
  const showPattern = !!(pattern || groutColor);

  if (!showPattern) {
    return <EntryImage brand={brand} sku={sku} />;
  }

  return (
    <div className="tile-entry-preview">
      <PatternPreview
        imageUrl={imageUrl}
        groutColor={groutColor}
        pattern={pattern}
        cols={5}
        rows={4}
      />
      {!imageUrl && <EntryImage brand={brand} sku={sku} />}
    </div>
  );
}
