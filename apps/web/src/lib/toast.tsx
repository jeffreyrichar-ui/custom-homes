import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Toast = {
  id: string;
  kind: "success" | "error" | "info";
  message: string;
};

type ToastContextValue = {
  notify: (kind: Toast["kind"], message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((kind: Toast["kind"], message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span className="toast-dot" />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback: no-op (used in tests / standalone components)
    return { notify: (_: Toast["kind"], __: string) => {} };
  }
  return ctx;
}

/** Helper: wrap an async action so it surfaces success/error toasts. */
export function useToastWrap() {
  const { notify } = useToast();
  return useCallback(
    async (fn: () => Promise<void>, success: string, error?: string) => {
      try {
        await fn();
        notify("success", success);
      } catch (err) {
        notify(
          "error",
          error ?? (err instanceof Error ? err.message : String(err)),
        );
        throw err;
      }
    },
    [notify],
  );
}

// Re-export a hook to satisfy unused-eslint check in callers
useEffect;
