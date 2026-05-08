import { useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";

export type Suggestion = {
  value: string;
  count?: number;
  image_url?: string | null;
};

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  fetchSuggestions: () => Promise<Suggestion[]>;
  /** Refetch trigger key — when this changes, suggestions reload. */
  fetchKey: string;
  placeholder?: string;
  showImage?: boolean;
  required?: boolean;
};

export function AutoComplete({
  label,
  value,
  onChange,
  fetchSuggestions,
  fetchKey,
  placeholder,
  showImage,
  required,
}: Props) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSuggestions().then((next) => {
      if (!cancelled) setItems(next);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchKey]);

  const fuse = useMemo(
    () =>
      new Fuse(items, {
        keys: ["value"],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [items],
  );

  const filtered = useMemo(() => {
    if (!value.trim()) return items.slice(0, 12);
    return fuse.search(value).slice(0, 12).map((r) => r.item);
  }, [value, items, fuse]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && filtered[highlight]) {
      e.preventDefault();
      onChange(filtered[highlight]!.value);
      setOpen(false);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="ac-wrapper" ref={wrapperRef}>
      <label className="ac-label">
        {label}
        {required && <span className="ac-required">*</span>}
      </label>
      <input
        className="ac-input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="ac-list">
          {filtered.map((item, i) => (
            <li
              key={item.value}
              className={`ac-item${i === highlight ? " ac-item--hl" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(item.value);
                setOpen(false);
              }}
            >
              {showImage && item.image_url && (
                <img src={item.image_url} alt="" className="ac-thumb" />
              )}
              <span>{item.value}</span>
              {item.count !== undefined && (
                <span className="ac-count">×{item.count}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
