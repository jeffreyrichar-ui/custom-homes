import { useEffect, useMemo, useState } from "react";
import { TAMARA_PATTERN_OPTIONS, type TradeKind } from "@custom-homes/shared";
import { api } from "../lib/api.js";
import { AutoComplete, type Suggestion } from "./AutoComplete.js";
import { PatternPreview } from "./PatternPreview.js";
import { Icon } from "./Icon.js";

type FieldKind =
  | "text"
  | "ac-vendor"
  | "ac-brand"
  | "ac-style"
  | "ac-color"
  | "ac-sku"
  | "select";

type FieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: string[];
};

const TRADE_FIELDS: Record<TradeKind, FieldDef[]> = {
  tile: [
    { key: "vendor", label: "Vendor", kind: "ac-vendor" },
    { key: "brand", label: "Brand", kind: "ac-brand", required: true },
    { key: "style", label: "Style", kind: "ac-style" },
    { key: "color", label: "Color", kind: "ac-color" },
    { key: "sku", label: "SKU", kind: "ac-sku" },
    { key: "grout_color", label: "Grout color", kind: "text" },
    { key: "grout_sku", label: "Grout SKU", kind: "text" },
    { key: "edge_profile", label: "Edge profile", kind: "text" },
    {
      key: "pattern",
      label: "Pattern",
      kind: "select",
      // Tamara's verbatim vocabulary, ordered by frequency in seed data.
      // Both the live SVG preview and PDF renderer normalize these strings
      // to a render-mode ID at draw time.
      options: [...TAMARA_PATTERN_OPTIONS],
    },
    {
      key: "location_in_room",
      label: "Location",
      kind: "select",
      required: true,
      options: [
        "",
        "floor",
        "shower_walls",
        "shower_floor",
        "shower_niche",
        "shower_walls_accent",
        "shower_bench",
        "tub_surround",
        "vanity_backsplash",
        "backsplash",
        "kitchen_backsplash",
        "fireplace",
        "wainscot",
      ],
    },
    { key: "notes", label: "Notes", kind: "text" },
  ],
  paint: [
    { key: "brand", label: "Brand", kind: "ac-brand", required: true },
    { key: "color_name", label: "Color name", kind: "ac-color", required: true },
    { key: "sku", label: "SKU", kind: "ac-sku" },
    {
      key: "sheen",
      label: "Sheen",
      kind: "select",
      options: ["", "flat", "matte", "eggshell", "satin", "semi-gloss", "gloss"],
    },
    {
      key: "surface_application",
      label: "Surface",
      kind: "select",
      options: ["", "walls", "trim", "ceiling", "doors", "cabinets", "exterior"],
    },
    { key: "notes", label: "Notes", kind: "text" },
  ],
  carpet: [
    { key: "brand", label: "Brand", kind: "ac-brand", required: true },
    { key: "style", label: "Style", kind: "ac-style" },
    { key: "color", label: "Color", kind: "ac-color" },
    { key: "sku", label: "SKU", kind: "ac-sku" },
    { key: "pile", label: "Pile", kind: "text" },
    { key: "notes", label: "Notes", kind: "text" },
  ],
  hardwood: [
    { key: "brand", label: "Brand", kind: "ac-brand", required: true },
    { key: "species", label: "Species", kind: "ac-style" },
    { key: "color", label: "Color", kind: "ac-color" },
    { key: "sku", label: "SKU", kind: "ac-sku" },
    { key: "plank_width", label: "Plank width", kind: "text" },
    {
      key: "pattern",
      label: "Pattern",
      kind: "select",
      options: ["", "set straight", "herringbone", "chevron", "staggered"],
    },
    { key: "notes", label: "Notes", kind: "text" },
  ],
  cabinet: [
    { key: "brand", label: "Brand", kind: "ac-brand", required: true },
    { key: "style", label: "Style", kind: "ac-style" },
    { key: "color", label: "Color", kind: "ac-color" },
    { key: "hardware", label: "Hardware", kind: "text" },
    { key: "notes", label: "Notes", kind: "text" },
  ],
  countertop: [
    {
      key: "material",
      label: "Material",
      kind: "select",
      required: true,
      options: ["", "quartz", "quartzite", "granite", "marble", "soapstone", "wood", "laminate"],
    },
    { key: "brand", label: "Brand", kind: "ac-brand", required: true },
    { key: "color", label: "Color", kind: "ac-color" },
    { key: "edge_profile", label: "Edge profile", kind: "text" },
    { key: "notes", label: "Notes", kind: "text" },
  ],
};

type Props = {
  trade: TradeKind;
  initial?: Record<string, unknown>;
  onCancel: () => void;
  onSave: (entry: Record<string, unknown>) => void | Promise<void>;
};

export function TradeForm({ trade, initial, onCancel, onSave }: Props) {
  const fields = TRADE_FIELDS[trade];
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of fields) {
      const existing = initial?.[f.key];
      v[f.key] = existing == null ? "" : String(existing);
    }
    return v;
  });
  const [skuMismatch, setSkuMismatch] = useState<{ historical: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const brand = values.brand?.trim() ?? "";
  const styleKey = trade === "hardwood" ? "species" : trade === "countertop" ? "material" : "style";
  const colorKey = trade === "paint" ? "color_name" : "color";
  const style = values[styleKey] ?? "";
  const color = values[colorKey] ?? "";

  // Cross-field completion suggestions. Logical field name (matches the
  // server's contract: brand/style/color/sku/pattern/edge_profile) → most
  // likely value + confidence over the candidate set. We map style/color
  // back to the trade's physical form key (species/material/color_name)
  // when rendering and applying.
  const [completions, setCompletions] = useState<Record<string, { value: string; confidence: number }>>({});
  const COMPLETION_THRESHOLD = 0.5;
  const logicalToFormKey: Record<string, string> = {
    brand: "brand",
    style: styleKey,
    color: colorKey,
    sku: "sku",
    pattern: "pattern",
    edge_profile: "edge_profile",
  };

  // Debounced call: whenever the user fills in at least one of the lookup
  // fields, ask the server what the empty fields most likely should be.
  useEffect(() => {
    const partial: Record<string, string> = {
      brand: values.brand?.trim() ?? "",
      style: values[styleKey]?.trim() ?? "",
      color: values[colorKey]?.trim() ?? "",
      sku: values.sku?.trim() ?? "",
      pattern: values.pattern?.trim() ?? "",
      edge_profile: values.edge_profile?.trim() ?? "",
    };
    const anyFilled = Object.values(partial).some((v) => v !== "");
    if (!anyFilled) {
      setCompletions({});
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .suggestComplete(trade, partial)
        .then((res) => {
          if (cancelled) return;
          const next: Record<string, { value: string; confidence: number }> = {};
          for (const [field, s] of Object.entries(res.suggestions ?? {})) {
            if (!s?.value) continue;
            if (s.confidence < COMPLETION_THRESHOLD) continue;
            const formKey = logicalToFormKey[field];
            if (!formKey) continue;
            // Don't suggest something the user already typed.
            const current = values[formKey]?.trim() ?? "";
            if (current && current.toLowerCase() === s.value.toLowerCase()) continue;
            next[formKey] = { value: s.value, confidence: s.confidence };
          }
          setCompletions(next);
        })
        .catch(() => {
          /* ignore network/404 errors — completion hints are best-effort */
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    trade,
    values.brand,
    values[styleKey],
    values[colorKey],
    values.sku,
    values.pattern,
    values.edge_profile,
  ]);

  // Fetch the cached manufacturer image whenever brand+sku change (tile only).
  useEffect(() => {
    if (trade !== "tile") {
      setPreviewImage(null);
      return;
    }
    const sku = values.sku?.trim();
    if (!brand || !sku) {
      setPreviewImage(null);
      return;
    }
    let cancelled = false;
    api
      .getManufacturerImage(brand, sku)
      .then((res) => {
        if (cancelled) return;
        setPreviewImage(res?.image_url ?? null);
      })
      .catch(() => {/* ignore */});
    return () => {
      cancelled = true;
    };
  }, [trade, brand, values.sku]);

  // SKU pre-fill + mismatch detection when color locks
  useEffect(() => {
    if (!brand || !color) {
      setSkuMismatch(null);
      return;
    }
    let cancelled = false;
    api.skuForColor(trade, brand, color).then((res) => {
      if (cancelled) return;
      const historical = res.sku;
      const current = values.sku?.trim();
      if (historical && !current) {
        setValues((v) => ({ ...v, sku: historical }));
        setSkuMismatch(null);
      } else if (historical && current && current.toLowerCase() !== historical.toLowerCase()) {
        setSkuMismatch({ historical });
      } else {
        setSkuMismatch(null);
      }
    }).catch(() => { /* ignore */ });
    return () => {
      cancelled = true;
    };
  }, [brand, color, values.sku, trade]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate required fields client-side
    for (const f of fields) {
      if (f.required && !values[f.key]?.trim()) {
        setError(`${f.label} is required`);
        return;
      }
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { trade };
      for (const f of fields) {
        const v = values[f.key];
        payload[f.key] = v?.trim() ? v.trim() : null;
      }
      await onSave(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const fetchVendorsKey = `vendors`;
  const fetchVendors = useMemo(
    () => async (): Promise<Suggestion[]> => {
      const res = await api.suggestVendors();
      return res.vendors;
    },
    [],
  );

  const fetchBrandsKey = `brands:${trade}`;
  const fetchBrands = useMemo(
    () => async (): Promise<Suggestion[]> => {
      const res = await api.suggestBrands(trade);
      return res.brands;
    },
    [trade],
  );

  const fetchStylesKey = `styles:${trade}:${brand}`;
  const fetchStyles = useMemo(
    () => async (): Promise<Suggestion[]> => {
      if (!brand) return [];
      const res = await api.suggestStyles(trade, brand);
      return res.styles;
    },
    [trade, brand],
  );

  const fetchColorsKey = `colors:${trade}:${brand}:${style}`;
  const fetchColors = useMemo(
    () => async (): Promise<Suggestion[]> => {
      if (!brand) return [];
      const res = await api.suggestColors(trade, brand, style || undefined);
      return res.colors;
    },
    [trade, brand, style],
  );

  const fetchSkusKey = `skus:${trade}:${brand}:${color}`;
  const fetchSkus = useMemo(
    () => async (): Promise<Suggestion[]> => {
      if (!brand) return [];
      const res = await api.suggestSkus(trade, brand, color || undefined);
      return res.skus;
    },
    [trade, brand, color],
  );

  const renderCompletionHint = (key: string) => {
    const c = completions[key];
    const current = values[key]?.trim() ?? "";
    if (!c || current) return null;
    const pct = Math.round(c.confidence * 100);
    return (
      <div className="suggest-hint">
        Suggest: <strong>{c.value}</strong>{" "}
        <button
          type="button"
          className="link"
          onClick={() => setValues((vv) => ({ ...vv, [key]: c.value }))}
        >
          Apply
        </button>
        <span className="suggest-hint__conf"> ({pct}% match)</span>
      </div>
    );
  };

  const renderField = (f: FieldDef) => {
    const set = (v: string) => setValues((vv) => ({ ...vv, [f.key]: v }));
    const v = values[f.key] ?? "";
    if (f.kind === "select") {
      return (
        <div className="ac-wrapper" key={f.key}>
          <label className="ac-label">
            {f.label}
            {f.required && <span className="ac-required">*</span>}
          </label>
          <select className="ac-input" value={v} onChange={(e) => set(e.target.value)}>
            {(f.options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt || "(none)"}
              </option>
            ))}
          </select>
        </div>
      );
    }
    if (f.kind === "ac-vendor") {
      return (
        <div key={f.key}>
          <AutoComplete
            label={f.label}
            required={f.required}
            value={v}
            onChange={set}
            fetchSuggestions={fetchVendors}
            fetchKey={fetchVendorsKey}
          />
          {renderCompletionHint(f.key)}
        </div>
      );
    }
    if (f.kind === "ac-brand") {
      return (
        <div key={f.key}>
          <AutoComplete
            label={f.label}
            required={f.required}
            value={v}
            onChange={set}
            fetchSuggestions={fetchBrands}
            fetchKey={fetchBrandsKey}
          />
          {renderCompletionHint(f.key)}
        </div>
      );
    }
    if (f.kind === "ac-style") {
      return (
        <div key={f.key}>
          <AutoComplete
            label={f.label}
            required={f.required}
            value={v}
            onChange={set}
            fetchSuggestions={fetchStyles}
            fetchKey={fetchStylesKey}
          />
          {renderCompletionHint(f.key)}
        </div>
      );
    }
    if (f.kind === "ac-color") {
      return (
        <div key={f.key}>
          <AutoComplete
            label={f.label}
            required={f.required}
            value={v}
            onChange={set}
            fetchSuggestions={fetchColors}
            fetchKey={fetchColorsKey}
            showImage
          />
          {renderCompletionHint(f.key)}
        </div>
      );
    }
    if (f.kind === "ac-sku") {
      return (
        <div key={f.key}>
          <AutoComplete
            label={f.label}
            required={f.required}
            value={v}
            onChange={set}
            fetchSuggestions={fetchSkus}
            fetchKey={fetchSkusKey}
          />
          {skuMismatch && (
            <div className="sku-mismatch">
              Historical SKU for {brand} / {color} is{" "}
              <code>{skuMismatch.historical}</code>.{" "}
              <button
                type="button"
                className="link"
                onClick={() => {
                  set(skuMismatch.historical);
                  setSkuMismatch(null);
                }}
              >
                Did you mean {skuMismatch.historical}?
              </button>
            </div>
          )}
          {renderCompletionHint(f.key)}
        </div>
      );
    }
    return (
      <div className="ac-wrapper" key={f.key}>
        <label className="ac-label">
          {f.label}
          {f.required && <span className="ac-required">*</span>}
        </label>
        <input className="ac-input" value={v} onChange={(e) => set(e.target.value)} />
        {renderCompletionHint(f.key)}
      </div>
    );
  };

  const showPreview =
    trade === "tile" &&
    values.brand?.trim() &&
    values.sku?.trim() &&
    (values.grout_color?.trim() || values.pattern?.trim());

  return (
    <form className="trade-form" onSubmit={handleSubmit}>
      <div className="trade-form-grid">{fields.map(renderField)}</div>
      {showPreview && (
        <div className="preview-block">
          <div className="ac-label">Live preview</div>
          <PatternPreview
            imageUrl={previewImage}
            groutColor={values.grout_color}
            pattern={values.pattern}
            style={values.style}
            color={values.color}
            notes={values.notes}
          />
          {!previewImage && (
            <small className="hint">
              No cached image for {values.brand} {values.sku} yet — preview shows pattern
              + grout only. Save the entry to trigger a scrape, or upload the product
              image from the entry card.
            </small>
          )}
        </div>
      )}
      {error && <div className="errors">{error}</div>}
      <div className="button-row">
        <button type="submit" className="icon-button" disabled={saving}>
          <Icon name="check" />
          <span>{saving ? "Saving…" : "Save entry"}</span>
        </button>
        <button
          type="button"
          className="secondary icon-button"
          onClick={onCancel}
        >
          <Icon name="x" />
          <span>Cancel</span>
        </button>
      </div>
    </form>
  );
}
