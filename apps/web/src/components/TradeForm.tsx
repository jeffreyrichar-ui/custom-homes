import { useEffect, useMemo, useState } from "react";
import type { TradeKind } from "@custom-homes/shared";
import { api } from "../lib/api.js";
import { AutoComplete, type Suggestion } from "./AutoComplete.js";

type FieldKind =
  | "text"
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
      options: [
        "",
        "set straight",
        "set vertical",
        "staggered horizontal",
        "staggered vertical",
        "checkerboard",
        "stacked",
      ],
    },
    {
      key: "location_in_room",
      label: "Location",
      kind: "select",
      required: true,
      options: ["", "floor", "shower_walls", "backsplash", "fireplace"],
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

  const brand = values.brand?.trim() ?? "";
  const styleKey = trade === "hardwood" ? "species" : trade === "countertop" ? "material" : "style";
  const colorKey = trade === "paint" ? "color_name" : "color";
  const style = values[styleKey] ?? "";
  const color = values[colorKey] ?? "";

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
    if (f.kind === "ac-brand") {
      return (
        <AutoComplete
          key={f.key}
          label={f.label}
          required={f.required}
          value={v}
          onChange={set}
          fetchSuggestions={fetchBrands}
          fetchKey={fetchBrandsKey}
        />
      );
    }
    if (f.kind === "ac-style") {
      return (
        <AutoComplete
          key={f.key}
          label={f.label}
          required={f.required}
          value={v}
          onChange={set}
          fetchSuggestions={fetchStyles}
          fetchKey={fetchStylesKey}
        />
      );
    }
    if (f.kind === "ac-color") {
      return (
        <AutoComplete
          key={f.key}
          label={f.label}
          required={f.required}
          value={v}
          onChange={set}
          fetchSuggestions={fetchColors}
          fetchKey={fetchColorsKey}
          showImage
        />
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
      </div>
    );
  };

  return (
    <form className="trade-form" onSubmit={handleSubmit}>
      <div className="trade-form-grid">{fields.map(renderField)}</div>
      {error && <div className="errors">{error}</div>}
      <div className="button-row">
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save entry"}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
