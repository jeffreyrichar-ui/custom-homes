import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Fuse from "fuse.js";
import { api, type ProjectSummary } from "../lib/api.js";
import { Icon, type IconName } from "./Icon.js";

type BrandSuggestion = { value: string; count: number };

type GroupKey = "quick" | "recent" | "pages" | "projects" | "brands";

type Item = {
  key: string;
  group: GroupKey;
  label: string;
  sublabel: string | null;
  icon: IconName;
  typeLabel: string;
  onSelect: () => void;
};

const GROUP_LABELS: Record<GroupKey, string> = {
  quick: "Quick actions",
  recent: "Recent projects",
  pages: "Pages",
  projects: "Projects",
  brands: "Brands",
};

const MAX_RECENT = 5;
const MAX_RESULTS = 20;

type Page = { label: string; path: string; icon: IconName };
const PAGES: Page[] = [
  { label: "Projects", path: "/projects", icon: "list" },
  { label: "New project", path: "/selections/new", icon: "plus" },
  { label: "Import", path: "/admin/import", icon: "upload" },
];

export function CommandBar() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [brands, setBrands] = useState<BrandSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
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

  const close = useCallback(() => setOpen(false), []);

  const goto = useCallback(
    (path: string) => {
      close();
      navigate(path);
    },
    [navigate, close],
  );

  const signOut = useCallback(async () => {
    close();
    try {
      await api.authLogout();
    } catch {
      /* ignore — still navigate to login */
    }
    navigate("/login");
  }, [navigate, close]);

  // Build searchable project items (used when query is non-empty)
  const projectItems = useMemo<Item[]>(() => {
    if (!projects) return [];
    return projects.map((p) => ({
      key: `project:${p.id}`,
      group: "projects",
      label: p.name,
      sublabel: p.address ?? null,
      icon: "grid",
      typeLabel: "Project",
      onSelect: () => goto(`/selections/${p.id}`),
    }));
  }, [projects, goto]);

  const brandItems = useMemo<Item[]>(() => {
    if (!brands) return [];
    return brands.map((b) => ({
      key: `brand:${b.value}`,
      group: "brands",
      label: b.value,
      sublabel: b.count > 0 ? `${b.count} ${b.count === 1 ? "entry" : "entries"}` : null,
      icon: "image",
      typeLabel: "Brand",
      onSelect: () => close(),
    }));
  }, [brands, close]);

  const fuse = useMemo(
    () =>
      new Fuse([...projectItems, ...brandItems], {
        keys: ["label", "sublabel"],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [projectItems, brandItems],
  );

  // Flat, ordered list of all visible items. Group headers are derived from
  // adjacent items sharing the same `group`, so the highlight index is linear.
  const items = useMemo<Item[]>(() => {
    const q = query.trim();

    if (!q) {
      const quick: Item[] = [
        {
          key: "action:new-project",
          group: "quick",
          label: "New project",
          sublabel: null,
          icon: "plus",
          typeLabel: "Action",
          onSelect: () => goto("/selections/new"),
        },
        {
          key: "action:import",
          group: "quick",
          label: "Import historical data",
          sublabel: null,
          icon: "upload",
          typeLabel: "Action",
          onSelect: () => goto("/admin/import"),
        },
        {
          key: "action:sign-out",
          group: "quick",
          label: "Sign out",
          sublabel: null,
          icon: "logout",
          typeLabel: "Action",
          onSelect: signOut,
        },
      ];
      const recent: Item[] = projectItems.slice(0, MAX_RECENT).map((p) => ({
        ...p,
        group: "recent",
      }));
      return [...quick, ...recent];
    }

    const ql = q.toLowerCase();
    const pageItems: Item[] = PAGES.filter((p) =>
      p.label.toLowerCase().includes(ql),
    ).map((p) => ({
      key: `page:${p.path}`,
      group: "pages",
      label: p.label,
      sublabel: p.path,
      icon: p.icon,
      typeLabel: "Page",
      onSelect: () => goto(p.path),
    }));

    const matched = fuse.search(q).map((r) => r.item);
    const matchedProjects = matched.filter((i) => i.group === "projects");
    const matchedBrands = matched.filter((i) => i.group === "brands");

    return [...pageItems, ...matchedProjects, ...matchedBrands].slice(
      0,
      MAX_RESULTS,
    );
  }, [query, fuse, projectItems, goto, signOut]);

  // Reset highlight when results change
  useEffect(() => {
    setHighlight(0);
  }, [query]);

  // Clamp highlight if the visible list shrinks beneath it
  useEffect(() => {
    if (highlight > 0 && highlight >= items.length) {
      setHighlight(Math.max(0, items.length - 1));
    }
  }, [items.length, highlight]);

  // Keep highlighted item in view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLLIElement>(`[data-cmdk-idx="${highlight}"]`);
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [highlight]);

  const activate = useCallback(
    (item: Item) => {
      item.onSelect();
    },
    [],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (items.length === 0 ? 0 : Math.min(h + 1, items.length - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      const item = items[highlight];
      if (item) {
        e.preventDefault();
        activate(item);
      }
    }
  };

  if (!open) return null;

  const showEmpty = !loading && items.length === 0;

  // Render the flat list with inline group-header rows when the group changes.
  const rendered: Array<
    | { kind: "header"; group: GroupKey }
    | { kind: "row"; item: Item; index: number }
  > = [];
  let lastGroup: GroupKey | null = null;
  items.forEach((item, index) => {
    if (item.group !== lastGroup) {
      rendered.push({ kind: "header", group: item.group });
      lastGroup = item.group;
    }
    rendered.push({ kind: "row", item, index });
  });

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
            placeholder="Search projects, pages, and actions…"
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
          {items.length > 0 && (
            <ul className="cmdk-list" ref={listRef} role="listbox">
              {rendered.map((row) =>
                row.kind === "header" ? (
                  <li
                    key={`hdr:${row.group}`}
                    className="command-bar-group"
                    role="presentation"
                    aria-hidden="true"
                  >
                    {GROUP_LABELS[row.group]}
                  </li>
                ) : (
                  <li
                    key={row.item.key}
                    data-cmdk-idx={row.index}
                    role="option"
                    aria-selected={row.index === highlight}
                    className={`cmdk-item${row.index === highlight ? " cmdk-item--hl" : ""}`}
                    onMouseEnter={() => setHighlight(row.index)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      activate(row.item);
                    }}
                  >
                    <span className="cmdk-item-icon" aria-hidden="true">
                      <Icon name={row.item.icon} size={14} />
                    </span>
                    <span className="cmdk-item-text">
                      <span className="cmdk-item-label">{row.item.label}</span>
                      {row.item.sublabel && (
                        <span className="cmdk-item-sublabel">{row.item.sublabel}</span>
                      )}
                    </span>
                    <span className="cmdk-item-type">{row.item.typeLabel}</span>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>

        <div className="cmdk-footer command-bar-footer" aria-hidden="true">
          <span className="cmdk-hint"><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span className="cmdk-hint"><kbd>↵</kbd> select</span>
          <span className="cmdk-hint"><kbd>esc</kbd> close</span>
          <span className="cmdk-hint"><kbd>⌘K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}
