/**
 * GraphPanel.jsx — Force-directed relationship graph
 * - Click node → highlight + dim others
 * - Hover → tooltip
 * - Drag node → physics pin & release (water-droplet feel)
 * - Drag background → pan, Scroll → zoom
 */
import { useEffect, useRef, useState, useCallback } from "react";

const API    = "http://localhost:8000";
const W      = 900;
const H      = 660;
const COLORS = ["#4f8ef7","#6ee7b7","#f59e42","#f472b6","#a78bfa","#34d399","#fb923c","#60a5fa","#e879f9","#22d3ee","#fbbf24","#4ade80"];

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function tick(nodes, edges, alpha) {
  const CX = W / 2, CY = H / 2;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const dx = (b.x - a.x) || 0.01, dy = (b.y - a.y) || 0.01;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const minD = a.r + b.r + 10;
      const nx = dx / dist, ny = dy / dist;
      const rep = alpha * 7000 / (dist * dist);
      if (a.fx === undefined) { a.vx -= nx * rep; a.vy -= ny * rep; }
      if (b.fx === undefined) { b.vx += nx * rep; b.vy += ny * rep; }
      if (dist < minD) {
        const push = (minD - dist) * 0.65;
        if (a.fx === undefined) { a.vx -= nx * push; a.vy -= ny * push; }
        if (b.fx === undefined) { b.vx += nx * push; b.vy += ny * push; }
      }
    }
  }
  const byId = {};
  nodes.forEach(n => { byId[n.id] = n; });
  for (const e of edges) {
    const a = byId[e.source], b = byId[e.target];
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const ideal = 150;
    const f = (dist - ideal) * alpha * 0.12;
    const nx = dx / dist, ny = dy / dist;
    if (a.fx === undefined) { a.vx += nx * f; a.vy += ny * f; }
    if (b.fx === undefined) { b.vx -= nx * f; b.vy -= ny * f; }
  }
  for (const n of nodes) {
    if (n.fx !== undefined) { n.x = n.fx; n.y = n.fy; continue; }
    n.vx += (CX - n.x) * alpha * 0.025;
    n.vy += (CY - n.y) * alpha * 0.025;
    const m = n.r + 20;
    if (n.x < m)       n.vx += (m - n.x)       * 0.25;
    if (n.x > W - m)   n.vx -= (n.x - (W - m)) * 0.25;
    if (n.y < m)       n.vy += (m - n.y)        * 0.25;
    if (n.y > H - m)   n.vy -= (n.y - (H - m)) * 0.25;
    n.vx *= 0.78; n.vy *= 0.78;
    n.x += n.vx;
    n.y += n.vy;
  }
}

// Strip boilerplate from org label for display on graph node
function nodeLabel(label, mode, maxChars) {
  if (mode !== "institutions") return (label || "").slice(0, maxChars);
  const clean = (label || "")
    .replace(/федеральное\s+государственное\s+(бюджетное|автономное|казённое|казенное)?\s*(образовательное\s+)?учреждение\s+(высшего\s+.{0,30}образования\s+)?/gi, "")
    .replace(/государственное\s+(бюджетное|автономное)\s*(образовательное\s+)?учреждение\s*/gi, "")
    .replace(/(?:фгбоу|фгаоу|фгку|фгуп|фгбун|фгбну)\s+(?:во|дпо)?\s*/gi, "")
    .replace(/["'«»]/g, "").replace(/\s+/g, " ").trim();
  return (clean || label || "").slice(0, maxChars);
}

const MODES = [
  { v: "topics",       l: "🔑 Ключевые слова" },
  { v: "institutions", l: "🏛 Организации" },
];

export default function GraphPanel() {
  const [mode,     setMode]     = useState("topics");
  const [thresh,   setThresh]   = useState(100);
  const [rawData,  setRawData]  = useState(null);
  const [nodes,    setNodes]    = useState([]);
  const [edges,    setEdges]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [hovered,  setHovered]  = useState(null);
  const [selected, setSelected] = useState(null);
  const [pan,      setPan]      = useState({ x: 0, y: 0 });
  const [zoom,     setZoom]     = useState(1);

  const svgRef    = useRef(null);
  const dragging  = useRef(false);
  const dragNodeId = useRef(null);
  const lastXY    = useRef({ x: 0, y: 0 });
  const rafRef    = useRef(null);
  const nodesRef  = useRef([]);
  const panRef    = useRef({ x: 0, y: 0 });
  const zoomRef   = useRef(1);

  // Keep refs in sync with state
  useEffect(() => { panRef.current  = pan;  }, [pan]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const load = useCallback(async (m, t) => {
    setLoading(true); setError(""); setRawData(null); setNodes([]); setEdges([]); setSelected(null);
    try {
      const qs = m === "topics"
        ? `mode=topics&min_projects=1&limit=${t}`
        : `mode=institutions&min_projects=${t}&limit=80`;
      const r = await fetch(`${API}/api/graph?${qs}`);
      if (!r.ok) throw new Error((await r.json().catch(()=>({}))).detail || `HTTP ${r.status}`);
      setRawData(await r.json());
    } catch (e) {
      setError(e.message?.includes("fetch") ? "Нет связи с бэкендом." : (e.message || "Ошибка"));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(mode, thresh); }, [mode, thresh]);

  const switchMode = (m) => {
    setMode(m); setSelected(null);
    setThresh(m === "topics" ? 100 : 5);
  };

  useEffect(() => {
    if (!rawData?.nodes?.length) return;
    const vals   = rawData.nodes.map(n => mode === "institutions" ? (n.projects||1) : (n.count||1));
    const maxVal = Math.max(...vals) || 1;
    const count  = rawData.nodes.length;

    const ns = rawData.nodes.map((n, i) => {
      const val   = mode === "institutions" ? (n.projects||1) : (n.count||1);
      const r     = clamp(9 + Math.sqrt(val / maxVal) * 22, 9, 30);
      // Spread nodes in a large circle initially
      const angle = (Math.PI * 2 * i / count);
      const rad   = 150 + (i % 3) * 60 + Math.random() * 40;
      return {
        ...n, r,
        x: W/2 + Math.cos(angle) * rad,
        y: H/2 + Math.sin(angle) * rad,
        vx: 0, vy: 0,
      };
    });
    const es = (rawData.edges||[]).slice(0, 300);
    nodesRef.current = ns;
    setEdges(es);
    setPan({ x: 0, y: 0 }); setZoom(1);

    let t = 0;
    const run = () => {
      if (t >= 260) { setNodes([...nodesRef.current]); return; }
      tick(nodesRef.current, es, Math.max(0.005, 1 - t/110));
      t++;
      if (t % 4 === 0) setNodes([...nodesRef.current]);
      rafRef.current = requestAnimationFrame(run);
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(run);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [rawData, mode]);

  // Convert screen delta to graph-space delta
  const screenDeltaToGraph = (dx, dy) => {
    const svg = svgRef.current;
    if (!svg) return { gdx: dx, gdy: dy };
    const rect = svg.getBoundingClientRect();
    return {
      gdx: dx * (W / rect.width)  / zoomRef.current,
      gdy: dy * (H / rect.height) / zoomRef.current,
    };
  };

  const onDown = e => {
    lastXY.current = { x: e.clientX, y: e.clientY };
    dragging.current = true;
  };

  const onMove = e => {
    const dx = e.clientX - lastXY.current.x;
    const dy = e.clientY - lastXY.current.y;
    lastXY.current = { x: e.clientX, y: e.clientY };

    if (dragNodeId.current !== null) {
      // Move pinned node
      const { gdx, gdy } = screenDeltaToGraph(dx, dy);
      nodesRef.current = nodesRef.current.map(n => {
        if (n.id !== dragNodeId.current) return n;
        const nx = n.x + gdx, ny = n.y + gdy;
        return { ...n, x: nx, y: ny, fx: nx, fy: ny, vx: 0, vy: 0 };
      });
      setNodes([...nodesRef.current]);
      return;
    }
    if (!dragging.current) return;
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
  };

  const onUp = () => {
    if (dragNodeId.current !== null) {
      // Release node — unpin so physics continues
      nodesRef.current = nodesRef.current.map(n =>
        n.id === dragNodeId.current
          ? { ...n, fx: undefined, fy: undefined, vx: 0, vy: 0 }
          : n
      );
      dragNodeId.current = null;
      setNodes([...nodesRef.current]);
    }
    dragging.current = false;
  };

  const onWheel = e => {
    e.preventDefault();
    setZoom(z => clamp(z * (e.deltaY < 0 ? 1.12 : 0.9), 0.2, 6));
  };

  const byId   = Object.fromEntries(nodes.map(n => [n.id, n]));
  const col    = (n) => COLORS[nodes.indexOf(n) % COLORS.length];
  const topN   = [...nodes].sort((a,b) => mode==="institutions" ? b.projects-a.projects : b.count-a.count).slice(0, 8);
  const topE   = [...edges].sort((a,b) => b.weight-a.weight).slice(0, 6);
  const thOpts = mode==="topics" ? [20,30,50,80,100,150] : [1,2,3,5,10,20,30];

  const connectedToSelected = selected
    ? new Set(edges.flatMap(e => e.source===selected ? [e.target] : e.target===selected ? [e.source] : []))
    : null;

  const nodeOpacity = (n) => {
    if (!selected) return 0.88;
    if (n.id === selected) return 1;
    if (connectedToSelected?.has(n.id)) return 0.88;
    return 0.13;
  };

  const edgeOpacity = (e) => {
    if (!selected) return 0.18;
    if (e.source === selected || e.target === selected) return 0.75;
    return 0.04;
  };

  return (
    <div style={{
      background:"rgba(255,255,255,0.02)",
      border:"1px solid rgba(255,255,255,0.07)",
      borderRadius:18,
      padding:"20px 22px",
    }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12, marginBottom:16 }}>
        <div>
          <div style={{ color:"#475569", fontSize:11, textTransform:"uppercase", letterSpacing:1.1, marginBottom:4 }}>
            ❄ ГРАФ СВЯЗЕЙ
          </div>
          <div style={{ color:"#e2e8f0", fontSize:17, fontWeight:700 }}>Relationship Network</div>
          <div style={{ color:"#334155", fontSize:11, marginTop:4 }}>
            Drag — pan · Scroll — zoom · Hover — детали · Click — выделить связи · <b style={{color:"#4f8ef7"}}>Drag node</b> — перетащить
          </div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          {MODES.map(m => (
            <button key={m.v} onClick={() => switchMode(m.v)}
              style={{
                padding:"6px 14px", borderRadius:20, border:"none", cursor:"pointer", fontSize:12, fontWeight:600,
                background: mode===m.v ? "linear-gradient(135deg,#4f8ef7,#6ee7b7)" : "rgba(255,255,255,0.06)",
                color: mode===m.v ? "#fff" : "#94a3b8",
              }}>{m.l}</button>
          ))}
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ color:"#475569", fontSize:11 }}>{mode==="topics" ? "топ слов:" : "мин. проектов:"}</span>
            <select value={thresh} onChange={e => setThresh(+e.target.value)}
              style={{ background:"#0d1526", border:"1px solid rgba(255,255,255,0.1)", color:"#e2e8f0", borderRadius:6, padding:"4px 6px", fontSize:12, cursor:"pointer" }}>
              {thOpts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ height:500, display:"flex", alignItems:"center", justifyContent:"center", color:"#475569", fontSize:13 }}>
          Загрузка графа…
        </div>
      )}
      {!loading && error && (
        <div style={{ height:500, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:10, color:"#fda4af", fontSize:13, textAlign:"center", padding:24 }}>
          ⚠️ {error}
          <button onClick={() => load(mode, thresh)} style={{ padding:"6px 14px", borderRadius:7, border:"1px solid rgba(253,164,175,0.3)", background:"transparent", color:"#fda4af", cursor:"pointer", fontSize:12 }}>Попробовать снова</button>
        </div>
      )}
      {!loading && !error && nodes.length === 0 && rawData && (
        <div style={{ height:500, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:8, color:"#475569", fontSize:13 }}>
          <div>Нет данных при текущих настройках.</div>
          <div style={{ fontSize:11 }}>{mode==="institutions" ? "Снизь «мин. проектов» до 1 или 2." : "Попробуй другое значение."}</div>
        </div>
      )}

      {!loading && !error && nodes.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 260px" }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            style={{ background:"#060f1e", cursor: dragNodeId.current ? "grabbing" : "grab", display:"block", width:"100%", height:500, userSelect:"none", borderRadius:"10px 0 0 10px" }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onWheel={onWheel}
            onClick={() => { if (!dragging.current) setSelected(null); }}
          >
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {edges.map((e, i) => {
                const a = byId[e.source], b = byId[e.target];
                if (!a || !b) return null;
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={`rgba(79,142,247,${edgeOpacity(e)})`}
                  strokeWidth={clamp(Math.log(e.weight+1)*0.9, 0.5, 3.5)}
                  strokeLinecap="round" />;
              })}
              {nodes.map((n) => {
                const isHov = hovered === n.id;
                const isSel = selected === n.id;
                const isDrag = dragNodeId.current === n.id;
                const c     = col(n);
                const op    = nodeOpacity(n);
                const line2 = mode==="institutions"
                  ? `${n.projects} проектов · ${n.budget_billions} млрд ₽`
                  : `${n.count} упоминаний`;
                return (
                  <g key={n.id}
                    onMouseEnter={e => { e.stopPropagation(); setHovered(n.id); }}
                    onMouseLeave={() => setHovered(null)}
                    onMouseDown={e => { e.stopPropagation(); dragNodeId.current = n.id; lastXY.current = {x: e.clientX, y: e.clientY}; }}
                    onClick={e => { e.stopPropagation(); if (!isDrag) setSelected(prev => prev===n.id ? null : n.id); }}
                    style={{ cursor: isDrag ? "grabbing" : "grab", opacity: op, transition:"opacity 0.2s" }}>
                    {(isHov || isSel) && <circle cx={n.x} cy={n.y} r={n.r+7} fill="none" stroke={isSel?"#f59e42":c} strokeWidth={isSel?2:1.5} opacity={0.5} />}
                    {isDrag && <circle cx={n.x} cy={n.y} r={n.r+10} fill="none" stroke="#fff" strokeWidth={1} opacity={0.3} strokeDasharray="3,3" />}
                    <circle cx={n.x} cy={n.y} r={(isHov||isSel||isDrag) ? n.r*1.12 : n.r} fill={c} />
                    {n.r > 9 && (
                      <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="middle"
                        fill="#fff"
                        stroke="#060f1e" strokeWidth="3" paintOrder="stroke"
                        fontSize={clamp(n.r*0.52, 6, 10)} fontWeight="600"
                        style={{ pointerEvents:"none", userSelect:"none" }}>
                        {nodeLabel(n.label, mode, mode==="topics" ? 14 : 12)}
                      </text>
                    )}
                    {(isHov || isSel) && !isDrag && (() => {
                      const fullL = nodeLabel(n.label, mode, 40);
                      const tw = Math.max(fullL.length, line2.length)*6.2 + 16;
                      const tx = n.x + n.r + 6, ty = n.y - 20;
                      return (
                        <g style={{ pointerEvents:"none" }}>
                          <rect x={tx} y={ty} width={tw} height={38} rx={5} fill="#0d1526" stroke={isSel?"rgba(245,158,66,0.6)":"rgba(79,142,247,0.55)"} strokeWidth={1} />
                          <text x={tx+8} y={ty+13} fill="#e2e8f0" fontSize={10} fontWeight="600">{fullL}</text>
                          <text x={tx+8} y={ty+27} fill="#6ee7b7" fontSize={9}>{line2}</text>
                        </g>
                      );
                    })()}
                  </g>
                );
              })}
            </g>
          </svg>

          <div style={{ background:"rgba(0,0,0,0.2)", borderLeft:"1px solid rgba(255,255,255,0.06)", padding:"18px 14px", overflowY:"auto", maxHeight:500, borderRadius:"0 10px 10px 0" }}>
            <div style={{ display:"flex", gap:20, marginBottom:16 }}>
              <div>
                <div style={{ color:"#475569", fontSize:10, textTransform:"uppercase" }}>Узлов</div>
                <div style={{ color:"#e2e8f0", fontSize:22, fontWeight:700 }}>{rawData?.node_count ?? nodes.length}</div>
              </div>
              <div>
                <div style={{ color:"#475569", fontSize:10, textTransform:"uppercase" }}>Рёбер</div>
                <div style={{ color:"#6ee7b7", fontSize:22, fontWeight:700 }}>{rawData?.edge_count ?? edges.length}</div>
              </div>
            </div>

            {selected && (() => {
              const n = byId[selected];
              if (!n) return null;
              const connEdges = edges.filter(e => e.source===selected || e.target===selected)
                .sort((a,b) => b.weight-a.weight).slice(0, 5);
              return (
                <div style={{ marginBottom:16, padding:12, background:"rgba(245,158,66,0.08)", borderRadius:10, border:"1px solid rgba(245,158,66,0.2)" }}>
                  <div style={{ color:"#f59e42", fontSize:11, fontWeight:700, marginBottom:6 }}>
                    📌 {(n.label||"").slice(0,30)}
                  </div>
                  <div style={{ color:"#94a3b8", fontSize:10, marginBottom:8 }}>
                    {mode==="institutions" ? `${n.projects} проектов · ${n.budget_billions} млрд ₽` : `${n.count} упоминаний`}
                  </div>
                  {connEdges.length > 0 && (
                    <>
                      <div style={{ color:"#475569", fontSize:9, textTransform:"uppercase", marginBottom:6 }}>Связи:</div>
                      {connEdges.map((e, i) => {
                        const other = byId[e.source===selected ? e.target : e.source];
                        if (!other) return null;
                        return (
                          <div key={i} style={{ color:"#cbd5e1", fontSize:10, marginBottom:4 }}>
                            ↔ {(other.label||"").slice(0,22)} <span style={{ color:"#475569" }}>·{e.weight}</span>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              );
            })()}

            <div style={{ color:"#475569", fontSize:10, textTransform:"uppercase", letterSpacing:0.8, marginBottom:10 }}>
              Топ {mode==="topics" ? "слов" : "организаций"}
            </div>
            {topN.map((n, i) => {
              const val  = mode==="institutions" ? n.projects : n.count;
              const maxV = mode==="institutions" ? topN[0]?.projects : topN[0]?.count;
              return (
                <div key={i} style={{ marginBottom:9, cursor:"pointer" }}
                  onClick={() => setSelected(prev => prev===n.id ? null : n.id)}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                    <span style={{ color: selected===n.id ? "#f59e42" : "#cbd5e1", fontSize:11, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginRight:6 }}>
                      {i+1}. {n.label}
                    </span>
                    <span style={{ color:col(n), fontSize:11, fontFamily:"monospace", flexShrink:0 }}>{val}</span>
                  </div>
                  <div style={{ height:3, background:"rgba(255,255,255,0.06)", borderRadius:2 }}>
                    <div style={{ height:3, borderRadius:2, background:col(n), width:`${val/maxV*100}%` }} />
                  </div>
                </div>
              );
            })}

            {topE.length > 0 && (
              <>
                <div style={{ color:"#475569", fontSize:10, textTransform:"uppercase", letterSpacing:0.8, margin:"14px 0 10px" }}>Сильнейшие связи</div>
                {topE.map((e, i) => {
                  const a = byId[e.source], b = byId[e.target];
                  if (!a || !b) return null;
                  return (
                    <div key={i} style={{ marginBottom:9 }}>
                      <div style={{ fontSize:10, lineHeight:1.4, marginBottom:2 }}>
                        <span style={{ color:"#e2e8f0", fontWeight:600 }}>{(a.label||"").slice(0,14)}</span>
                        <span style={{ color:"#334155" }}> ↔ </span>
                        <span style={{ color:"#e2e8f0", fontWeight:600 }}>{(b.label||"").slice(0,14)}</span>
                      </div>
                      <div style={{ height:3, background:"rgba(255,255,255,0.06)", borderRadius:2 }}>
                        <div style={{ height:3, borderRadius:2, background:"linear-gradient(90deg,#4f8ef7,#6ee7b7)", width:`${e.weight/(topE[0]?.weight||1)*100}%` }} />
                      </div>
                      <div style={{ color:"#334155", fontSize:9, marginTop:1 }}>сила: {e.weight}</div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
