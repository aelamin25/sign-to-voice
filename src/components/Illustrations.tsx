// SVG illustrations from the mockup: the signing silhouette (mock camera + mock sign video)
// and the Maya portrait (shown until/unless the live Anam stream is connected).

const dots = (a: [number, number][], cls = "lm", r = 3) =>
  a.map(([x, y], i) => <circle key={`${cls}${i}`} className={cls} cx={x} cy={y} r={r} />);

function Arm({ d, hx, hy }: { d: string; hx: number; hy: number }) {
  return (
    <>
      <path d={d} stroke="#3A525E" strokeWidth="22" strokeLinecap="round" fill="none" />
      <ellipse cx={hx} cy={hy} rx="15" ry="18" fill="#C98B68" />
    </>
  );
}

export function Silhouette({ signing }: { signing: boolean }) {
  const face: [number, number][] = [[186, 92], [214, 92], [200, 104], [191, 117], [209, 117], [200, 125], [180, 104], [220, 104]];
  return (
    <svg className="sil" viewBox="0 0 400 290" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path d="M84 300 C 92 230 140 196 200 196 C 260 196 308 230 316 300Z" fill="#33505E" />
      <rect x="187" y="136" width="26" height="44" rx="12" fill="#B57A5A" />
      <ellipse cx="200" cy="100" rx="38" ry="46" fill="#C98B68" />
      <path d="M162 96 C 160 54 240 54 238 96 C 226 74 196 70 178 80 C 170 84 164 90 162 96Z" fill="#2A1C17" />
      <g className="armL">
        {signing ? <><Arm d="M138 196 L120 176 L106 140" hx={104} hy={136} />{dots([[112, 148], [98, 132], [106, 124]])}</>
          : <><Arm d="M138 196 L120 252 L104 222" hx={104} hy={220} />{dots([[106, 214], [98, 224]])}</>}
      </g>
      <g className="armR">
        {signing ? <><Arm d="M262 196 L292 168 L304 112" hx={306} hy={106} />{dots([[300, 120], [312, 104], [318, 94], [306, 94]])}</>
          : <><Arm d="M262 196 L280 252 L296 222" hx={296} hy={220} />{dots([[294, 214], [302, 224]])}</>}
      </g>
      <path className="bone" d="M138 196 L262 196 M200 150 L200 196" />
      <circle className="lm" cx="138" cy="196" r="4.5" />
      <circle className="lm" cx="262" cy="196" r="4.5" />
      <circle className="lm" cx="200" cy="196" r="3.5" />
      {dots(face, "lm f", 2.2)}
    </svg>
  );
}

/** How the illustrated Maya's face looks. With a live Anam avatar the same moods are sent as
 *  Director Notes cues instead; this is the stand-in, so the idea is visible without keys. */
export type Mood = "neutral" | "question" | "strained" | "reassuring" | "concerned";

const BROWS: Record<Mood, string> = {
  neutral: "M77 88 Q85 84 93 88M107 88 Q115 84 123 88",
  question: "M76 84 Q85 77 94 83M106 83 Q115 77 124 84",      // both brows raised
  strained: "M77 90 Q86 87 93 84M107 84 Q114 87 123 90",       // inner ends up, outer ends down
  reassuring: "M77 88 Q85 84.5 93 88M107 88 Q115 84.5 123 88",
  concerned: "M77 89 Q86 86 93 85M107 85 Q114 86 123 89",      // a milder version of strained
};
const SMILE: Record<Mood, string> = {
  neutral: "M90 125 Q100 131 110 125",
  question: "M91 126 Q100 129 109 126",
  strained: "M90 129 Q100 124 110 129",                         // turned down
  reassuring: "M88 124 Q100 134 112 124",                       // a warmer smile
  concerned: "M91 127 Q100 126 109 127",                        // flat
};

export function Portrait({ mood = "neutral" }: { mood?: Mood }) {
  return (
    <svg viewBox="0 0 200 230" aria-hidden="true" data-mood={mood}>
      <defs>
        <radialGradient id="sk" cx="45%" cy="38%" r="70%"><stop offset="0" stopColor="#E2AC8A" /><stop offset=".7" stopColor="#C98A66" /><stop offset="1" stopColor="#B07352" /></radialGradient>
        <linearGradient id="hr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3A2A22" /><stop offset="1" stopColor="#18100C" /></linearGradient>
        <linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F4F2EE" /><stop offset="1" stopColor="#DAD6CF" /></linearGradient>
        <linearGradient id="nk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9E6449" /><stop offset=".5" stopColor="#BE8060" /></linearGradient>
      </defs>
      <path d="M18 230 C 22 182 62 160 100 160 C 138 160 178 182 182 230Z" fill="url(#top)" />
      <path d="M74 166 Q100 196 126 166" fill="none" stroke="#C9C3BA" strokeWidth="3" />
      <path d="M86 128 h28 v34 q-14 12 -28 0z" fill="url(#nk)" />
      <path d="M44 96 C 40 40 74 22 104 24 C 140 26 164 50 158 104 C 156 132 150 150 140 162 L 60 162 C 50 148 45 124 44 96Z" fill="url(#hr)" />
      <ellipse cx="62" cy="100" rx="7" ry="10" fill="#B87553" /><ellipse cx="138" cy="100" rx="7" ry="10" fill="#B87553" />
      <ellipse cx="100" cy="96" rx="38" ry="47" fill="url(#sk)" />
      <path d="M60 92 C 58 52 96 40 120 50 C 138 58 144 74 142 92 C 132 70 112 62 92 66 C 76 70 66 80 60 92Z" fill="url(#hr)" />
      <path d="M96 52 C 110 50 128 56 134 66" stroke="#5A4236" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".6" />
      <path className="brows" d={BROWS[mood]} stroke="#2A1A12" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <g className="eyes">
        <ellipse cx="85" cy="99" rx="5" ry="3.6" fill="#fff" /><ellipse cx="115" cy="99" rx="5" ry="3.6" fill="#fff" />
        <circle cx="85.5" cy="99" r="3" fill="#2B1B13" /><circle cx="115.5" cy="99" r="3" fill="#2B1B13" />
        <circle cx="86.5" cy="98" r=".9" fill="#fff" /><circle cx="116.5" cy="98" r=".9" fill="#fff" />
      </g>
      <circle cx="76" cy="114" r="8" fill="#E8826F" opacity=".18" /><circle cx="124" cy="114" r="8" fill="#E8826F" opacity=".18" />
      <path d="M100 102 Q96 114 102 116" stroke="#9A5E42" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".8" />
      <path className="smile" d={SMILE[mood]} stroke="#8E4A3F" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity=".55" />
      <ellipse className="mouth" cx="100" cy="127" rx="8" ry="2.2" fill="#80403A" />
      <circle cx="61" cy="112" r="2.4" fill="#E9D7B5" /><circle cx="139" cy="112" r="2.4" fill="#E9D7B5" />
    </svg>
  );
}
