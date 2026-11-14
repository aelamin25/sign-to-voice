import { useEffect } from "react";
import { Icon } from "./Icon";
import { useStore } from "../state/store";
import { liveServices, mockServices } from "../services";

const fmt = (args: Record<string, unknown>) =>
  Object.entries(args)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? `"${v.length > 34 ? v.slice(0, 34) + "…" : v}"` : String(v)}`)
    .join(", ");

/** Small, subtle "Anam tool" toast whenever the avatar agent calls a tool. */
export function Toast() {
  const toast = useStore((s) => s.toast);
  const show = useStore((s) => s.showToast);

  useEffect(() => {
    const offs = [liveServices.avatar.onToolCall(show)];
    if (mockServices.avatar !== liveServices.avatar) offs.push(mockServices.avatar.onToolCall(show));
    return () => offs.forEach((o) => o());
  }, [show]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => useStore.setState({ toast: null }), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div aria-live="polite" className="sr-live">
      {toast && (
        <div className="toast" key={toast.at} role="status">
          <i><Icon name="spark" /></i>
          <span>Anam tool</span>
          <code>{toast.name}({fmt(toast.args)})</code>
        </div>
      )}
    </div>
  );
}
