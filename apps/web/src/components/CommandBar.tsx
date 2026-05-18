import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Fuse from "fuse.js";
import { api, type ProjectSummary } from "../lib/api.js";
import { Icon, type IconName } from "./Icon.js";

type BrandSuggestion = { value: string; count: number };

type Item =
  | {
      kind: "project";
      id: string;
      label: string;
      sublabel: string | null;
      icon: IconName;
      typeLabel: string;
    }
  | {
      kind: "brand";
      label: string;
      sublabel: string | null;
      icon: IconName;
      typeLabel: string;
    };

const RECENT_KEY = "custom-homes:cmdk:recent";
const MAX_RECENT = 5;
const MAX_RESULTS = 20;

function loadRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(key: string): void {
  const current = loadRecent().filter((k) => k !== key);
  current.unshift(key);
  const trimmed = current.slice(0, MAX_RECENT);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore quota errors */
  }
}

export function CommandBar() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [brands, setBrands] = useState<BrandSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const dataLoadedRef = useRef(false);

  // Global hotkey: Cmd+K (Mac) / Ctrl+K (others)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Load data once on first open and cache for session
  useEffect(() => {
    if (!open || dataLoadedRef.current) return;
    dataLoadedRef.current = true;
    setLoading(true);
    Promise.all([
      api.listProjects().then((r) => r.projects).catch(() => [] as ProjectSummary[]),
      api.suggestBrands("tile").then((r) => r.brands).catch(() => [] as BrandSuggestion[]),
    ])
      .then(([p, b]) => {
        setProjects(p);
        setBrands(b);
      })
      .finally(() => setLoading(false));
  }, [open]);

  // Focus input + reset state when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      setRecent(loadRecent());
      // Defer focus so the input is mounted
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const allItems = useMemo<Item[]>(() => {
    const out: Item[] = [];
    if (projects) {
      for (const p of projects) {
        out.push({
          kind: "project",
          id: p.id,
          label: p.name,
          sublabel: p.address ?? null,
          icon: "grid",
          typeLabel: "Project",
        });
      }
    }
    if (brands) {
      for (const b of brands) {
        out.push({
          kind: "brand",
          label: b.value,
          sublabel: b.count > 0 ? `${b.count} ${b.count === 1 ? "entry" : "entries"}` : null,
          icon: "image",
          typeLabel: "Brand",
        });
      }
    }
    return out;
  }, [projects, brands]);

  const fuse = useMemo(
    () =>
      new Fuse(allItems, {
        keys: ["label", "sublabel"],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [allItems],
  );

  const results = useMemo<Item[]>(() => {
    const q = query.trim();
    if (!q) {
      // Default view: recent projects first, then remaining items
      const recentKeys = new Set(recent);
      const recentItems: Item[] = [];
      const otherItems: Item[] = [];
      for (const item of allItems) {
        const key = itemKey(item);
        if (recentKeys.has(key)) recentItems.push(item);
        else otherItems.push(item);
      }
      // Preserve recent order
      recentItems.sort((a, b) => recent.indexOf(itemKey(a)) - recent.indexOf(itemKey(b)));
      return [...recentItems, ...otherItems].slice(0, MAX_RESULTS);
    }
    return fuse.search(q).slice(0, MAX_RESULTS).map((r) => r.item);
  }, [query, allItems, fuse, recent]);

  // Reset highlight when results change
  useEffect(() => {
    setHighlight(0);
  }, [query]);

  // Keep highlighted item in view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLLIElement>(`[data-cmdk-idx="${highlight}"]`);
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [highlight]);

  const close = useCallback(() => setOpen(false), []);

  const activate = useCallback(
    (item: Item) => {
      pushRecent(itemKey(item));
      if (item.kind === "project") {
        navigate(`/selections/${item.id}`);
      }
      // Brands are informational for now — closing the palette is enough.
      close();
    },
    [navigate, close],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (results.length === 0 ? 0 : Math.min(h + 1, results.length - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      const item = results[highlight];
      if (item) {
        e.preventDefault();
        activate(item);
      }
    }
  };

  if (!open) return null;

  const showEmpty = !loading && results.length === 0;

  return (
    <div
      className="cmdk-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="cmdk-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="cmdk-input-row">
          <span className="cmdk-input-icon" aria-hidden="true">
            <Icon name="search" size={16} />
          </span>
          <input
            ref={inputRef}
            className="cmdk-input"
            type="text"
            placeholder="Search projects and brands…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="cmdk-esc" aria-hidden="true">Esc</kbd>
        </div>

        <div className="cmdk-results">
          {loading && projects === null && (
            <div className="cmdk-status">Loading…</div>
          )}
          {showEmpty && (
            <div className="cmdk-status">
              {query.trim() ? "No matches" : "Nothing here yet"}
            </div>
          )}
          {results.length > 0 && (
            <ul className="cmdk-list" ref={listRef} role="listbox">
              {results.map((item, i) => (
                <li
                  key={itemKey(item)}
                  data-cmdk-idx={i}
                  role="option"
                  aria-selected={i === highlight}
                  className={`cmdk-item${i === highlight ? " cmdk-item--hl" : ""}`}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    activate(item);
                  }}
                >
                  <span className="cmdk-item-icon" aria-hidden="true">
                    <Icon name={item.icon} size={14} />
                  </span>
                  <span className="cmdk-item-text">
                    <span className="cmdk-item-label">{item.label}</span>
                    {item.sublabel && (
                      <span className="cmdk-item-sublabel">{item.sublabel}</span>
                    )}
                  </span>
                  <span className="cmdk-item-type">{item.typeLabel}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="cmdk-footer" aria-hidden="true">
          <span className="cmdk-hint"><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span className="cmdk-hint"><kbd>Enter</kbd> open</span>
          <span className="cmdk-hint"><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

function itemKey(item: Item): string {
  return item.kind === "project" ? `project:${item.id}` : `brand:${item.label}`;
}
