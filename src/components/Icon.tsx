// Line icons from the mockup (24×24, 1.7 stroke). No emoji anywhere.
const P: Record<string, string> = {
  hand: "M7 11V6a1.5 1.5 0 013 0v5M10 10V4.5a1.5 1.5 0 013 0V10M13 10V5.5a1.5 1.5 0 013 0V12M16 11.5V8a1.5 1.5 0 013 0v6a7 7 0 01-7 7h-1a6 6 0 01-5-2.7L3.5 14a1.5 1.5 0 012.4-1.8L7 13.5",
  steth: "M6 3H5v5a5 5 0 0010 0V3h-1M10 13v2a5 5 0 0010 0v-1.5M20 13.5a2 2 0 100-4 2 2 0 000 4z",
  hurt: "M12 2.5l1.8 4.6 4.6-1.8-1.8 4.6 4.9 1.6-4.9 1.6 1.8 4.6-4.6-1.8L12 21.5l-1.8-4.6-4.6 1.8 1.8-4.6-4.9-1.6 4.9-1.6-1.8-4.6 4.6 1.8z",
  head: "M12 3a6.5 6.5 0 016.5 6.5c0 3-2 4.6-2 7.5h-9c0-2.9-2-4.5-2-7.5A6.5 6.5 0 0112 3zM9 20.5h6",
  stomach: "M8 3v4c-2 1.2-3 3.3-3 6a7 7 0 0014 0c0-2.7-1-4.8-3-6V3M10 13a2 2 0 104 0",
  chest: "M12 3.5v8M12 8c-2 0-3 1-4 2-2 2-3 6-3 8 0 1 1 2 2 2s3-1 3-3v-6.5M12 8c2 0 3 1 4 2 2 2 3 6 3 8 0 1-1 2-2 2s-3-1-3-3v-6.5",
  throat: "M8.5 3c.5 4-1 6-1 9.5V21M15.5 3c-.5 4 1 6 1 9.5V21M10 11.5h4",
  fever: "M14 14.8V5a2 2 0 00-4 0v9.8a4 4 0 104 0zM12 9v7",
  sick: "M12 21a9 9 0 100-18 9 9 0 000 18zM8 16c1.3-1 2.7-1 4 0s2.7 1 4 0M9 10h.01M15 10h.01",
  dizzy: "M12 12a1 1 0 112 0 3 3 0 01-6 0 5 5 0 0110 0 7 7 0 01-14 0 9 9 0 0118 0",
  med: "M10.5 20.5a5 5 0 01-7-7l6-6a5 5 0 017 7zM8.5 8.5l7 7",
  allergy: "M12 9a3 3 0 110-6 3 3 0 010 6zM12 9v12M12 15c-3 0-5-2-5-5M12 18c3 0 5-2 5-5",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  sun: "M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  yes: "M5 12.5l4.5 4.5L19 7",
  no: "M6 6l12 12M18 6L6 18",
  please: "M16 8.5A5 5 0 1017 13M17 6v3h-3",
  heart: "M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0112 8a4.3 4.3 0 017.5 2.3c0 5.6-7.5 10.2-7.5 10.2z",
  again: "M4 12a8 8 0 0114-5.3L20 9M20 4v5h-5M20 12a8 8 0 01-14 5.3L4 15M4 20v-5h5",
  help: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8zM5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6",
  mic: "M12 15a3.5 3.5 0 003.5-3.5v-5a3.5 3.5 0 00-7 0v5A3.5 3.5 0 0012 15zM5.5 11.5a6.5 6.5 0 0013 0M12 18v3",
  cam: "M3 8a2 2 0 012-2h2l1.5-2h7L17 6h2a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2zM12 16a3.5 3.5 0 100-7 3.5 3.5 0 000 7z",
  camoff: "M3 3l18 18M9 4h6l1.5 2H19a2 2 0 012 2v8.5M17.5 19H5a2 2 0 01-2-2V8a2 2 0 012-2h1M10 10.5a3 3 0 004 4",
  stop: "M7 7h10v10H7z",
  play: "M8 5v14l11-7z",
  x: "M6 6l12 12M18 6L6 18",
  door: "M5 21V4a1 1 0 011-1h10a1 1 0 011 1v17M3 21h18M13 12h.01",
  speaker: "M4 10v4h4l5 4V6L8 10zM16.5 8.5a5 5 0 010 7",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  cal: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  food: "M4 11h16a8 8 0 01-16 0zM12 3v4M8 5v2M16 5v2",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6",
  save: "M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6",
  check: "M5 12.5l4.5 4.5L19 7",
  arrow: "M5 12h14M13 6l6 6-6 6",
  back: "M19 12H5M11 18l-6-6 6-6",
  chev: "M9 6l6 6-6 6",
  menu: "M4 7h16M4 12h16M4 17h10",
  log: "M5 5h14v10H9l-4 4zM9 9h6M9 12h4",
  table: "M3 10h18M5 10v9M19 10v9M7 5h10l4 5H3z",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  info: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5h.01",
  text: "M4 7V5h12v2M10 5v14M8 19h4M14 13v-1.5h6V13M17 11.5V19M15.5 19h3",
  motion: "M3 12h4l3-8 4 16 3-8h4",
  question: "M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9a2.5 2.5 0 114 2c-.9.6-1.5 1.2-1.5 2.3M12 17h.01",
};

export function Icon({ name, className = "", label }: { name: string; className?: string; label?: string }) {
  return (
    <svg className={`ic ${className}`} viewBox="0 0 24 24" aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label}>
      <path d={P[name] ?? P.info} />
    </svg>
  );
}

export function Wave({ n = 12 }: { n?: number }) {
  return (
    <span className="wave" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => <i key={i} style={{ animationDelay: `${((i * 83) % 600) / 1000}s` }} />)}
    </span>
  );
}

export function Brand() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <rect width="34" height="34" rx="11" fill="#121417" />
      <path d="M7 23C10 13 24 13 27 23" stroke="#6EDCCC" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M6 24h22" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="17" cy="11" r="2.4" fill="#FFB4A6" />
    </svg>
  );
}
