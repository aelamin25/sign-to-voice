import { useEffect, useRef } from "react";

/** Focus the first control on open, trap Tab inside, close on Escape, restore focus on close. */
export function useDialog<T extends HTMLElement>(open: boolean, onClose: () => void, key?: unknown) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () =>
      Array.from(el?.querySelectorAll<HTMLElement>("button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])") ?? []);
    requestAnimationFrame(() => (focusables()[0] ?? el)?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); closeRef.current(); return; }
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      try { prev?.focus(); } catch { /* noop */ }
    };
  }, [open, key]);

  return ref;
}
