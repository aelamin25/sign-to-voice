import { Brand, Icon } from "./Icon";
import { useStore } from "../state/store";

export function Header() {
  const phase = useStore((s) => s.phase);
  const setMenu = useStore((s) => s.setMenu);
  const menu = useStore((s) => s.menu);
  const tabletop = useStore((s) => s.tabletop);
  const toggleTabletop = useStore((s) => s.toggleTabletop);
  return (
    <header className="top">
      <div className="brand"><Brand />SignBridge</div>
      <div className="status" aria-label="Device status">
        <span><i className={phase === "signing" ? "on" : ""} />Camera {phase === "signing" ? "on" : "off"}</span>
        <span><i className={`md${phase === "listening" ? " on" : ""}`} />Mic {phase === "listening" ? "on" : "off"}</span>
        <span className="ns"><Icon name="shield" />Nothing stored</span>
      </div>
      <button
        className="tbtn"
        role="switch"
        aria-checked={tabletop}
        onClick={() => toggleTabletop()}
        title="Tabletop view: the doctor's half faces them across the desk"
      >
        <span className="sw" aria-hidden="true" />
        <span className="tl-l">Tabletop</span>
        <span className="sr">Tabletop view</span>
      </button>
      <button className="menubtn" onClick={() => setMenu("main")} aria-haspopup="dialog" aria-expanded={!!menu}>
        <Icon name="menu" />Menu
      </button>
    </header>
  );
}
