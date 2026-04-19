/**
 * TrendsPanel.jsx — Эволюция научных тем 2020–2025
 * - Числа на каждой точке (при hover темы)
 * - Анимация "перемотки" по годам — кружок года двигается слева направо
 * - Режим "Живой год" — bar race внутри одного года
 * - Объяснение малых чисел
 */
import { useEffect, useState, useMemo, useRef, useCallback } from "react";

const API = "http://localhost:8000";
const YEARS = [2020, 2021, 2022, 2023, 2024, 2025];

const PALETTE = [
  "#4f8ef7","#6ee7b7","#f59e42","#f472b6","#a78bfa",
  "#34d399","#fb923c","#60a5fa","#e879f9","#22d3ee",
  "#fbbf24","#4ade80",
];

function catmullRomPath(pts) {
  if (pts.length < 2) return "";
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6, cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6, cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function fmtVal(val, metric) {
  if (metric === "budget") {
    if (val >= 1) return `${val.toFixed(1)} млрд`;
    if (val > 0) return `${(val * 1000).toFixed(0)} млн`;
    return "—";
  }
  if (!val) return "—";
  return val >= 1000 ? `${(val/1000).toFixed(1)}k` : String(val);
}
function fmtValFull(val, metric) {
  if (metric === "budget") {
    if (val >= 1) return `${val.toFixed(2)} млрд ₽`;
    if (val > 0) return `${(val * 1000).toFixed(0)} млн ₽`;
    return "—";
  }
  return val ? `${val.toLocaleString("ru")} проектов` : "—";
}

// ── Bump Chart with year-cursor animation ─────────────────────────────────────
function BumpChart({ topics, metric, compact, activeYearIdx }) {
  const W = compact ? 410 : 700;
  const H = compact ? 360 : 440;
  const PAD_L = compact ? 126 : 162, PAD_R = compact ? 110 : 140, PAD_T = 24, PAD_B = 32;
  const chartW = W - PAD_L - PAD_R, chartH = H - PAD_T - PAD_B;
  const [hovered, setHovered] = useState(null);

  const rankData = useMemo(() => YEARS.map(yr => {
    const vals = topics.map(t => ({ keyword: t.keyword, val: t.by_year.find(b => b.year === yr)?.[metric === "budget" ? "budget" : "projects"] || 0 }));
    vals.sort((a, b) => b.val - a.val);
    const ranks = {};
    vals.forEach((v, i) => { ranks[v.keyword] = i + 1; });
    return ranks;
  }), [topics, metric]);

  const N = topics.length;
  const xScale = (i) => PAD_L + (i / (YEARS.length - 1)) * chartW;
  const yScale = (rank) => PAD_T + ((rank - 1) / (N - 1)) * chartH;

  return (
    <div>
      <div style={{ color: "#64748b", fontSize: 10, textAlign: "center", marginBottom: 2 }}>
        {metric === "budget" ? "💰 По бюджету (млрд ₽)" : "📋 По числу проектов"}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
        {/* Grid lines */}
        {topics.map((_, i) => (
          <line key={i} x1={PAD_L} y1={yScale(i+1)} x2={W - PAD_R} y2={yScale(i+1)}
            stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
        ))}

        {/* Year labels */}
        {YEARS.map((yr, i) => (
          <text key={yr} x={xScale(i)} y={H - 8} textAnchor="middle"
            fill={activeYearIdx === i ? "#e2e8f0" : "#475569"} fontSize={10} fontWeight={activeYearIdx === i ? "700" : "400"}>
            {yr}
          </text>
        ))}

        {/* Active year cursor */}
        {activeYearIdx != null && (
          <line x1={xScale(activeYearIdx)} y1={PAD_T} x2={xScale(activeYearIdx)} y2={H - PAD_B}
            stroke="rgba(79,142,247,0.25)" strokeWidth={1.5} strokeDasharray="3,3" />
        )}

        {/* Lines + dots */}
        {topics.map((t, ti) => {
          const color = PALETTE[ti % PALETTE.length];
          const pts = YEARS.map((yr, i) => ({ x: xScale(i), y: yScale(rankData[i][t.keyword] || N) }));
          const isHov = hovered === t.keyword;
          const path = catmullRomPath(pts);
          return (
            <g key={t.keyword}
              onMouseEnter={() => setHovered(t.keyword)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "pointer" }}>
              <path d={path} fill="none" stroke="transparent" strokeWidth={14} />
              <path d={path} fill="none" stroke={color}
                strokeWidth={isHov ? 3 : 1.8}
                opacity={hovered && !isHov ? 0.08 : (isHov ? 1 : 0.65)}
                style={{ transition: "opacity 0.2s" }} />
              {pts.map((pt, i) => {
                const rank = rankData[i][t.keyword];
                const val = t.by_year.find(b => b.year === YEARS[i])?.[metric === "budget" ? "budget" : "projects"] || 0;
                const isActiveYear = activeYearIdx === i;
                const r = isHov ? 7 : (isActiveYear ? 6 : 4);
                return (
                  <g key={i}>
                    <circle cx={pt.x} cy={pt.y} r={r}
                      fill={color} opacity={hovered && !isHov ? 0.08 : 0.9}
                      style={{ transition: "r 0.2s" }} />
                    {/* Value shown on active year for all or on hovered line */}
                    {(isActiveYear || isHov) && val > 0 && (
                      <text x={pt.x} y={pt.y - 10} textAnchor="middle"
                        fill={color} fontSize={9} fontWeight="700"
                        stroke="#060f1e" strokeWidth="2" paintOrder="stroke"
                        style={{ pointerEvents: "none" }}>
                        {fmtVal(val, metric)}
                      </text>
                    )}
                    {/* Rank badge on hovered line (all years) */}
                    {isHov && !isActiveYear && (
                      <text x={pt.x} y={pt.y + 16} textAnchor="middle"
                        fill={color} fontSize={8} opacity={0.7}
                        style={{ pointerEvents: "none" }}>
                        #{rank}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Left labels (rank in year 0) */}
        {topics.map((t, ti) => {
          const color = PALETTE[ti % PALETTE.length];
          const rank0 = rankData[0][t.keyword] || N;
          return (
            <text key={t.keyword} x={PAD_L - 8} y={yScale(rank0) + 4} textAnchor="end"
              fill={hovered === t.keyword ? color : (hovered ? "rgba(71,85,105,0.25)" : "#94a3b8")}
              fontSize={compact ? 9 : 10} fontWeight={hovered === t.keyword ? "700" : "400"}
              style={{ transition: "fill 0.2s" }}>
              {t.keyword.slice(0, compact ? 18 : 22)}
            </text>
          );
        })}

        {/* Right labels (rank in last year) */}
        {topics.map((t, ti) => {
          const color = PALETTE[ti % PALETTE.length];
          const lastIdx = YEARS.length - 1;
          const rankLast = rankData[lastIdx][t.keyword] || N;
          const valLast = t.by_year.find(b => b.year === YEARS[lastIdx])?.[metric === "budget" ? "budget" : "projects"] || 0;
          return (
            <text key={t.keyword} x={W - PAD_R + 8} y={yScale(rankLast) + 4}
              fill={hovered === t.keyword ? color : (hovered ? "rgba(71,85,105,0.25)" : "#94a3b8")}
              fontSize={compact ? 9 : 10} fontWeight={hovered === t.keyword ? "700" : "400"}
              style={{ transition: "fill 0.2s" }}>
              {t.keyword.slice(0, compact ? 13 : 16)}
              <tspan fill={hovered === t.keyword ? color : "#475569"} fontSize={8} dx={3}>
                {fmtVal(valLast, metric)}
              </tspan>
            </text>
          );
        })}

        <text x={PAD_L - 8} y={PAD_T - 6} textAnchor="end" fill="#334155" fontSize={9}>ранг 1</text>
      </svg>
    </div>
  );
}

// ── Bar Race — animated ranking for a single year ─────────────────────────────
function BarRace({ topics, metric, activeYearIdx }) {
  const yr = YEARS[activeYearIdx ?? YEARS.length - 1];
  const key = metric === "budget" ? "budget" : "projects";

  const ranked = useMemo(() => {
    return [...topics]
      .map(t => ({ kw: t.keyword, val: t.by_year.find(b => b.year === yr)?.[key] || 0 }))
      .sort((a, b) => b.val - a.val);
  }, [topics, metric, yr]);

  const maxVal = ranked[0]?.val || 1;
  const W = 340;

  return (
    <div style={{ padding: "0 8px" }}>
      <div style={{ color: "#64748b", fontSize: 10, textAlign: "center", marginBottom: 10 }}>
        📊 Рейтинг {yr} · {metric === "budget" ? "Бюджет" : "Проекты"}
      </div>
      {ranked.map((item, i) => {
        const color = PALETTE[topics.findIndex(t => t.keyword === item.kw) % PALETTE.length];
        const pct = item.val / maxVal * 100;
        return (
          <div key={item.kw} style={{ marginBottom: 7 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <span style={{ color: "#94a3b8", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ color: "#475569", fontSize: 9, marginRight: 4 }}>#{i+1}</span>
                {item.kw}
              </span>
              <span style={{ color, fontSize: 10, fontFamily: "monospace", flexShrink: 0, marginLeft: 6 }}>
                {fmtValFull(item.val, metric).split(" ")[0]}
              </span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
              <div style={{
                height: 4, borderRadius: 2, background: color,
                width: `${pct}%`, transition: "width 0.5s ease",
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Stream Graph ───────────────────────────────────────────────────────────────
function StreamGraph({ topics, metric, compact, activeYearIdx }) {
  const W = compact ? 410 : 700;
  const H = compact ? 220 : 300;
  const PAD_L = 40, PAD_R = 20, PAD_T = 12, PAD_B = 32;
  const chartW = W - PAD_L - PAD_R, chartH = H - PAD_T - PAD_B;
  const [hovered, setHovered] = useState(null);

  const stacked = useMemo(() => YEARS.map(yr => {
    let acc = 0;
    return topics.map(t => {
      const val = t.by_year.find(b => b.year === yr)?.[metric === "budget" ? "budget" : "projects"] || 0;
      const bottom = acc; acc += val;
      return { bottom, top: acc, val };
    });
  }), [topics, metric]);

  const maxVal = useMemo(() => Math.max(...YEARS.map((_, yi) => { const l = stacked[yi][stacked[yi].length-1]; return l ? l.top : 0; }), 1), [stacked]);
  const xScale = (i) => PAD_L + (i / (YEARS.length-1)) * chartW;
  const yScale = (v) => PAD_T + chartH - (v / maxVal) * chartH;

  const buildPath = (ti) => {
    const topPts = YEARS.map((_, yi) => ({ x: xScale(yi), y: yScale(stacked[yi][ti].top) }));
    const botPts = YEARS.map((_, yi) => ({ x: xScale(YEARS.length-1-yi), y: yScale(stacked[YEARS.length-1-yi][ti].bottom) }));
    const top = catmullRomPath(topPts);
    const botStart = `L${botPts[0].x.toFixed(1)},${botPts[0].y.toFixed(1)}`;
    const botCurve = catmullRomPath(botPts).replace(/^M[^ ]+/, "");
    return top + botStart + botCurve + " Z";
  };

  return (
    <div>
      <div style={{ color: "#64748b", fontSize: 10, textAlign: "center", marginBottom: 2 }}>
        {metric === "budget" ? "💰 По бюджету (млрд ₽)" : "📋 По числу проектов"}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
        {topics.map((t, ti) => {
          const color = PALETTE[ti % PALETTE.length];
          const isHov = hovered === t.keyword;
          return (
            <path key={t.keyword} d={buildPath(ti)} fill={color}
              opacity={hovered ? (isHov ? 0.9 : 0.1) : 0.65}
              stroke={isHov ? color : "none"} strokeWidth={isHov ? 1.5 : 0}
              style={{ cursor: "pointer", transition: "opacity 0.2s" }}
              onMouseEnter={() => setHovered(t.keyword)}
              onMouseLeave={() => setHovered(null)} />
          );
        })}

        {/* Active year cursor on stream */}
        {activeYearIdx != null && (
          <line x1={xScale(activeYearIdx)} y1={PAD_T} x2={xScale(activeYearIdx)} y2={H - PAD_B}
            stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} strokeDasharray="3,3" />
        )}

        {YEARS.map((yr, i) => (
          <text key={yr} x={xScale(i)} y={H - 8} textAnchor="middle"
            fill={activeYearIdx === i ? "#e2e8f0" : "#475569"}
            fontSize={10} fontWeight={activeYearIdx === i ? "700" : "400"}>{yr}</text>
        ))}

        {hovered && (() => {
          const t = topics.find(t => t.keyword === hovered);
          if (!t) return null;
          const key = metric === "budget" ? "budget" : "projects";
          const maxYear = t.by_year.reduce((a, b) => b[key] > a[key] ? b : a);
          return (
            <text x={PAD_L + chartW/2} y={PAD_T + 16}
              textAnchor="middle" fill="#e2e8f0" fontSize={11} fontWeight="700">
              {hovered} · пик {maxYear.year}: {fmtValFull(maxYear[key], metric)}
            </text>
          );
        })()}
      </svg>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function TrendsPanel() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [view,    setView]    = useState("both");
  const [top,     setTop]     = useState(12);
  // Animation state
  const [activeYearIdx, setActiveYearIdx] = useState(null); // null = no cursor
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    setLoading(true); setError("");
    fetch(`${API}/api/trends?top=${top}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [top]);

  // Autoplay: cycle through years
  const startPlay = useCallback(() => {
    setActiveYearIdx(0);
    setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) { clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => {
      setActiveYearIdx(prev => {
        if (prev == null || prev >= YEARS.length - 1) {
          setPlaying(false);
          return YEARS.length - 1;
        }
        return prev + 1;
      });
    }, 900);
    return () => clearInterval(intervalRef.current);
  }, [playing]);

  const topics = useMemo(() => {
    if (!data) return [];
    return data.topics.filter(t => t.by_year.some(b => b.projects > 0 || b.budget > 0));
  }, [data]);

  // Compute totals for active year for context
  const yearStats = useMemo(() => {
    if (!topics.length) return null;
    const yi = activeYearIdx ?? YEARS.length - 1;
    const yr = YEARS[yi];
    const totalP = topics.reduce((s, t) => s + (t.by_year.find(b => b.year === yr)?.projects || 0), 0);
    const totalB = topics.reduce((s, t) => s + (t.by_year.find(b => b.year === yr)?.budget || 0), 0);
    return { yr, totalP, totalB };
  }, [topics, activeYearIdx]);

  const box = { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, overflow: "hidden", marginBottom: 18 };
  const btn = (active) => ({
    padding: "6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer",
    border: active ? "1px solid #4f8ef7" : "1px solid rgba(255,255,255,0.1)",
    background: active ? "#4f8ef7" : "rgba(255,255,255,0.04)",
    color: active ? "#fff" : "#94a3b8", fontWeight: active ? 700 : 400,
  });

  return (
    <div style={box}>
      {/* Header */}
      <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ color: "#475569", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>📈 Тренды</div>
            <div style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 700 }}>Эволюция научных тем 2020–2025</div>
            <div style={{ color: "#334155", fontSize: 11, marginTop: 3 }}>
              Ранговые изменения тем 2020–2025 · Hover — детали · ▶ анимация
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 4 }}>
              <button style={btn(view === "both")}   onClick={() => setView("both")}>⊞ Вместе</button>
              <button style={btn(view === "bump")}   onClick={() => setView("bump")}>〰 Ранги</button>
              <button style={btn(view === "stream")} onClick={() => setView("stream")}>▲ Поток</button>
            </div>
            {/* Animation controls */}
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <button
                onClick={() => playing ? setPlaying(false) : startPlay()}
                style={{ ...btn(playing), background: playing ? "rgba(245,158,66,0.2)" : "rgba(79,142,247,0.15)", border: playing ? "1px solid rgba(245,158,66,0.4)" : "1px solid rgba(79,142,247,0.3)", color: playing ? "#f59e42" : "#7dd3fc", padding: "6px 10px" }}>
                {playing ? "⏸" : "▶"} {playing ? "Стоп" : "Играть"}
              </button>
              <button onClick={() => { setActiveYearIdx(null); setPlaying(false); }}
                style={{ ...btn(false), padding: "6px 8px", fontSize: 10, color: "#475569" }}>
                ✕
              </button>
              {/* Year scrubber */}
              {activeYearIdx != null && (
                <input type="range" min={0} max={YEARS.length - 1} value={activeYearIdx}
                  onChange={e => { setActiveYearIdx(+e.target.value); setPlaying(false); }}
                  style={{ width: 80, accentColor: "#4f8ef7" }} />
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ color: "#475569", fontSize: 11 }}>тем:</span>
              <select value={top} onChange={e => setTop(Number(e.target.value))}
                style={{ background: "#0d1526", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#e2e8f0", padding: "5px 8px", fontSize: 11 }}>
                {[8,10,12,15].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "14px 24px" }}>
        {loading && <div style={{ height: 320, display: "flex", alignItems: "center", justifyContent: "center", color: "#475569" }}>Загрузка трендов…</div>}
        {error   && <div style={{ color: "#fda4af", fontSize: 12, padding: "12px 14px", background: "rgba(244,114,182,0.08)", borderRadius: 10 }}>⚠️ {error}</div>}

        {!loading && !error && topics.length > 0 && (
          <>
            {/* Active year pill */}
            {yearStats && (
              <div style={{ display: "flex", gap: 16, marginBottom: 12, alignItems: "center" }}>
                <div style={{ background: "rgba(79,142,247,0.12)", border: "1px solid rgba(79,142,247,0.3)", borderRadius: 8, padding: "5px 14px" }}>
                  <span style={{ color: "#7dd3fc", fontSize: 12, fontWeight: 700 }}>{yearStats.yr}</span>
                </div>
                <div style={{ color: "#64748b", fontSize: 11 }}>
                  топ-{topics.length} тем: <span style={{ color: "#4f8ef7" }}>{yearStats.totalP.toLocaleString("ru")} проектов</span>
                  {" · "}
                  <span style={{ color: "#f59e42" }}>{yearStats.totalB.toFixed(1)} млрд ₽ бюджет</span>
                  
                </div>
              </div>
            )}

            {/* Charts */}
            {(view === "both" || view === "bump") && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 200px", gap: 12, marginBottom: view === "both" ? 12 : 0 }}>
                <BumpChart topics={topics} metric="projects" compact={true} activeYearIdx={activeYearIdx} />
                <BumpChart topics={topics} metric="budget"   compact={true} activeYearIdx={activeYearIdx} />
                <BarRace topics={topics} metric={view === "stream" ? "projects" : "projects"} activeYearIdx={activeYearIdx ?? YEARS.length - 1} />
              </div>
            )}
            {(view === "both" || view === "stream") && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <StreamGraph topics={topics} metric="projects" compact={view === "both"} activeYearIdx={activeYearIdx} />
                <StreamGraph topics={topics} metric="budget"   compact={view === "both"} activeYearIdx={activeYearIdx} />
              </div>
            )}

            {/* Legend */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 12 }}>
              {topics.map((t, i) => (
                <div key={t.keyword} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: PALETTE[i % PALETTE.length] }} />
                  <span style={{ color: "#64748b", fontSize: 10 }}>{t.keyword}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
