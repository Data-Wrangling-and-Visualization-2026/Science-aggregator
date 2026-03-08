import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie
} from "recharts";

const API = "http://localhost:8000";
const COLORS = ["#4f8ef7","#6ee7b7","#f59e42","#f472b6","#a78bfa","#34d399","#fb923c","#60a5fa"];
const YEARS  = ["","2020","2021","2022","2023","2024","2025"];
const TYPES  = [
  { value: "", label: "Все типы" },
  { value: "Фундаментальное", label: "Фундаментальное" },
  { value: "Поисковое",       label: "Поисковое" },
  { value: "Прикладное",      label: "Прикладное" },
  { value: "Опытно-конструкторские", label: "ОКР" },
];

// ── helpers ────────────────────────────────────────────
function fmtBudget(thousands) {
  if (!thousands) return "—";
  if (thousands >= 1_000_000) return `${(thousands / 1_000_000).toFixed(1)} млрд ₽`;
  if (thousands >= 1_000)     return `${(thousands / 1_000).toFixed(1)} млн ₽`;
  return `${Math.round(thousands).toLocaleString("ru")} тыс ₽`;
}

function shortName(name = "", len = 52) {
  const clean = name
    .replace(/ФЕДЕРАЛЬНОЕ ГОСУДАРСТВЕННОЕ (БЮДЖЕТНОЕ|АВТОНОМНОЕ) ОБРАЗОВАТЕЛЬНОЕ УЧРЕЖДЕНИЕ ВЫСШЕГО ОБРАЗОВАНИЯ/gi, "")
    .replace(/["'«»]/g, "").trim();
  return clean.length > len ? clean.slice(0, len) + "…" : clean;
}

function gisLink(regNum) {
  // Direct link to the project page on rosrid.ru (the official NIOKTR registry)
  return `https://www.rosrid.ru/nioktr/search?number=${encodeURIComponent(regNum)}`;
}

// ── Tags ───────────────────────────────────────────────
function Tags({ keywords, max = 5 }) {
  if (!keywords) return null;
  const tags = keywords.split(/[;,]/).map(t => t.trim()).filter(Boolean).slice(0, max);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
      {tags.map((t, i) => (
        <span key={i} style={{
          background: "rgba(79,142,247,0.1)", border: "1px solid rgba(79,142,247,0.2)",
          borderRadius: 4, padding: "2px 7px", fontSize: 10, color: "#93c5fd",
        }}>{t}</span>
      ))}
    </div>
  );
}

// ── Project Modal ──────────────────────────────────────
function ProjectModal({ project, onClose }) {
  if (!project) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#0d1526", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 18, padding: "32px 36px", maxWidth: 720, width: "100%",
          maxHeight: "85vh", overflowY: "auto", position: "relative",
        }}>
        {/* Close */}
        <button onClick={onClose} style={{
          position: "absolute", top: 16, right: 20,
          background: "none", border: "none", color: "#475569",
          fontSize: 22, cursor: "pointer", lineHeight: 1,
        }}>×</button>

        {/* Reg number + link */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ color: "#334155", fontSize: 11, fontFamily: "monospace" }}>
            {project.registration_number}
          </span>
          <a
            href={gisLink(project.registration_number)}
            target="_blank" rel="noreferrer"
            style={{
              color: "#4f8ef7", fontSize: 11, textDecoration: "none",
              border: "1px solid rgba(79,142,247,0.3)", borderRadius: 5,
              padding: "2px 8px",
            }}>
            🔗 Открыть на rosrid.ru →
          </a>
        </div>

        {/* Title */}
        <div style={{ color: "#f1f5f9", fontSize: 17, fontWeight: 600, lineHeight: 1.45, marginBottom: 16 }}>
          {project.name || "Название не указано"}
        </div>

        {/* Meta grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px", marginBottom: 18 }}>
          <MetaRow label="Организация"  value={project.institution ? shortName(project.institution, 60) : "—"} />
          <MetaRow label="Руководитель" value={project.supervisor_full_name || "не указан"} />
          <MetaRow label="Год начала"   value={project.year || "—"} />
          <MetaRow label="Бюджет"       value={fmtBudget(project.budget_total_thousands)} accent="#f59e42" />
          <MetaRow label="Тип НИР"      value={project.nioktr_types || "—"} />
          <MetaRow label="Министерство" value={project.ministry ? shortName(project.ministry, 44) : "—"} />
          {project.start_date && <MetaRow label="Начало" value={project.start_date?.slice(0,10)} />}
          {project.end_date   && <MetaRow label="Конец"  value={project.end_date?.slice(0,10)} />}
          {project.stages_count  && <MetaRow label="Этапов"  value={project.stages_count} />}
          {project.reports_number && <MetaRow label="Отчётов" value={project.reports_number} />}
        </div>

        {/* Annotation */}
        {project.annotation && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: "#475569", fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>
              Аннотация
            </div>
            <div style={{
              color: "#94a3b8", fontSize: 13, lineHeight: 1.65,
              background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: "12px 16px",
              borderLeft: "3px solid rgba(79,142,247,0.3)",
            }}>
              {project.annotation}
            </div>
          </div>
        )}

        {/* Keywords */}
        {project.keyword_list && (
          <div>
            <div style={{ color: "#475569", fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>
              Ключевые слова
            </div>
            <Tags keywords={project.keyword_list} max={20} />
          </div>
        )}
      </div>
    </div>
  );
}

function MetaRow({ label, value, accent }) {
  return (
    <div>
      <div style={{ color: "#334155", fontSize: 10, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
      <div style={{ color: accent || "#cbd5e1", fontSize: 13 }}>{value}</div>
    </div>
  );
}

// ── Filter bar ─────────────────────────────────────────
function FilterBar({ draft, onChange, onApply, loading, applied }) {
  const hasFilters = applied.year || applied.type || applied.search;
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14, padding: "18px 24px", marginBottom: 24,
    }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Field label="Год">
          <select value={draft.year} onChange={e => onChange({ ...draft, year: e.target.value })} style={sel}>
            {YEARS.map(y => <option key={y} value={y}>{y || "Все годы"}</option>)}
          </select>
        </Field>

        <Field label="Тип НИР">
          <select value={draft.type} onChange={e => onChange({ ...draft, type: e.target.value })} style={sel}>
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>

        <Field label="Поиск по названию, аннотации, ключевым словам" flex>
          <input
            value={draft.search}
            onChange={e => onChange({ ...draft, search: e.target.value })}
            onKeyDown={e => e.key === "Enter" && onApply()}
            placeholder="Например: нейросети, климат, квантовые вычисления..."
            style={{ ...sel, width: "100%" }}
          />
        </Field>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onApply} disabled={loading} style={{
            padding: "9px 28px", borderRadius: 9, border: "none",
            background: loading ? "#1e3a5f" : "linear-gradient(135deg,#4f8ef7,#6ee7b7)",
            color: loading ? "#475569" : "#060b18",
            fontWeight: 700, fontSize: 14, cursor: loading ? "wait" : "pointer",
          }}>{loading ? "…" : "Применить →"}</button>

          {hasFilters && (
            <button onClick={() => { onChange({ year: "", type: "", search: "" }); onApply(true); }} style={{
              padding: "9px 16px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)",
              background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 13,
            }}>Сбросить</button>
          )}
        </div>
      </div>

      {hasFilters && (
        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: "#334155", fontSize: 11 }}>Фильтры:</span>
          {applied.year   && <Badge label={`Год: ${applied.year}`} />}
          {applied.type   && <Badge label={`Тип: ${applied.type.slice(0,20)}`} />}
          {applied.search && <Badge label={`«${applied.search.slice(0,30)}»`} />}
        </div>
      )}
    </div>
  );
}

function Field({ label, children, flex }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, ...(flex ? { flex: 1, minWidth: 240 } : {}) }}>
      <label style={{ color: "#475569", fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase" }}>{label}</label>
      {children}
    </div>
  );
}

function Badge({ label }) {
  return (
    <span style={{
      background: "rgba(79,142,247,0.15)", border: "1px solid rgba(79,142,247,0.3)",
      borderRadius: 20, padding: "3px 10px", fontSize: 11, color: "#93c5fd",
    }}>{label}</span>
  );
}

function StatCard({ icon, label, value, accent }) {
  return (
    <div style={{
      flex: 1, minWidth: 160,
      background: "rgba(255,255,255,0.03)", border: `1px solid ${accent}33`,
      borderRadius: 14, padding: "20px 22px",
    }}>
      <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
      <div style={{ color: "#64748b", fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: accent, fontSize: 28, fontWeight: 700, fontFamily: "monospace", marginTop: 4 }}>{value}</div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 16 }}>
      {children}
    </div>
  );
}

function PageBtn({ label, disabled, onClick }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "7px 16px", borderRadius: 7, border: "none",
      background: disabled ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.07)",
      color: disabled ? "#1e293b" : "#64748b",
      cursor: disabled ? "default" : "pointer", fontSize: 12,
    }}>{label}</button>
  );
}

const sel = {
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 9, padding: "8px 14px", color: "#e2e8f0", fontSize: 13, outline: "none",
};
const box = {
  background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 16, padding: "22px 26px",
};
const tip = {
  background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10, color: "#e2e8f0", fontSize: 12,
};

// ── App ────────────────────────────────────────────────
export default function App() {
  const [stats,    setStats]    = useState(null);
  const [projects, setProjects] = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [selected, setSelected] = useState(null);  // for modal

  const [draft,   setDraft]   = useState({ year: "", type: "", search: "" });
  const [applied, setApplied] = useState({ year: "", type: "", search: "" });

  const fetchStats = useCallback((f) => {
    const p = new URLSearchParams();
    if (f.year)   p.append("year",        f.year);
    if (f.type)   p.append("nioktr_type",  f.type);
    if (f.search) p.append("search",       f.search);
    setLoading(true);
    fetch(`${API}/api/stats?${p}`)
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); });
  }, []);

  const fetchProjects = useCallback((f, pg = 1) => {
    const p = new URLSearchParams({ page: pg, limit: 20 });
    if (f.year)   p.append("year",        f.year);
    if (f.type)   p.append("nioktr_type",  f.type);
    if (f.search) p.append("search",       f.search);
    fetch(`${API}/api/projects?${p}`)
      .then(r => r.json())
      .then(d => { setProjects(d.results || []); setTotal(d.total || 0); });
  }, []);

  useEffect(() => {
    fetchStats({ year: "", type: "", search: "" });
    fetchProjects({ year: "", type: "", search: "" });
  }, []);

  const handleApply = (reset = false) => {
    const f = reset ? { year: "", type: "", search: "" } : { ...draft };
    if (reset) setDraft({ year: "", type: "", search: "" });
    setApplied(f);
    setPage(1);
    fetchStats(f);
    fetchProjects(f, 1);
  };

  const goPage = (pg) => { setPage(pg); fetchProjects(applied, pg); };
  const pages = Math.ceil(total / 20);

  return (
    <div style={{ minHeight: "100vh", background: "#060b18", color: "#e2e8f0", fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet" />

      {/* Modal */}
      <ProjectModal project={selected} onClose={() => setSelected(null)} />

      {/* Header */}
      <div style={{
        padding: "16px 48px", borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", gap: 14,
        background: "rgba(6,11,24,0.95)", backdropFilter: "blur(16px)",
        position: "sticky", top: 0, zIndex: 20,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: "linear-gradient(135deg,#4f8ef7,#6ee7b7)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
        }}>⚗</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Science Aggregator</div>
          <div style={{ color: "#334155", fontSize: 11 }}>Российские НИОКР · gisnauka.ru · 2020–2025</div>
        </div>
        <div style={{ marginLeft: "auto", color: "#1e3a5f", fontSize: 12, fontFamily: "monospace" }}>
          {stats ? `${stats.total_projects?.toLocaleString("ru")} проектов` : "…"}
        </div>
      </div>

      <div style={{ padding: "32px 48px" }}>

        <FilterBar draft={draft} onChange={setDraft} onApply={handleApply} loading={loading} applied={applied} />

        {/* Stat cards */}
        {stats && (
          <div style={{ display: "flex", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
            <StatCard icon="📋" label="Проектов"     value={stats.total_projects?.toLocaleString("ru")}          accent="#4f8ef7" />
            <StatCard icon="🏛"  label="Организаций" value={stats.total_institutions?.toLocaleString("ru")}      accent="#6ee7b7" />
            <StatCard icon="💰" label="Бюджет"        value={`${stats.total_budget_billions?.toLocaleString("ru")} млрд ₽`} accent="#f59e42" />
            <StatCard icon="📅" label="Период"        value="2020 – 2025"                                        accent="#a78bfa" />
          </div>
        )}

        {/* Charts */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18, marginBottom: 18 }}>
            <div style={box}>
              <SectionTitle>Проекты по годам{applied.search ? ` · «${applied.search}»` : ""}</SectionTitle>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.by_year} barSize={34} margin={{ left: -10 }}>
                  <XAxis dataKey="year" tick={{ fill: "#475569", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip contentStyle={tip} cursor={{ fill: "rgba(255,255,255,0.03)" }}
                    formatter={v => [v.toLocaleString("ru"), "Проектов"]} />
                  <Bar dataKey="count" radius={[5,5,0,0]}>
                    {stats.by_year.map((row, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]}
                        opacity={applied.year && String(row.year) !== applied.year ? 0.25 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={box}>
              <SectionTitle>Типы исследований</SectionTitle>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={stats.by_type} dataKey="count" nameKey="type"
                    cx="50%" cy="50%" outerRadius={80} innerRadius={46} paddingAngle={3}>
                    {stats.by_type?.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Tooltip contentStyle={tip} formatter={(v, n) => [v.toLocaleString("ru"), n?.slice(0,28)]} />
                </PieChart>
              </ResponsiveContainer>
              {/* Custom legend below chart */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 8 }}>
                {stats.by_type?.map((t, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: COLORS[i], flexShrink: 0 }} />
                    <span style={{ color: "#475569", fontSize: 10 }}>{t.type?.slice(0, 22)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Top institutions */}
        {stats && (
          <div style={{ ...box, marginBottom: 18 }}>
            <SectionTitle>Топ 10 организаций по числу проектов</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {stats.top_institutions?.map((inst, i) => {
                const max = stats.top_institutions[0]?.projects || 1;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ color: "#1e3a5f", fontSize: 11, fontFamily: "monospace", width: 18, textAlign: "right" }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ color: "#94a3b8", fontSize: 12 }}>{shortName(inst.name, 64)}</span>
                        <span style={{ color: COLORS[i % COLORS.length], fontSize: 12, fontFamily: "monospace", marginLeft: 10 }}>
                          {inst.projects.toLocaleString("ru")}
                        </span>
                      </div>
                      <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2 }}>
                        <div style={{ height: 4, borderRadius: 2, background: COLORS[i % COLORS.length], width: `${(inst.projects / max) * 100}%`, transition: "width 0.8s ease" }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Map placeholder */}
        <div style={{
          ...box, marginBottom: 18, height: 150,
          display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8,
          background: "repeating-linear-gradient(45deg,rgba(79,142,247,0.02) 0px,rgba(79,142,247,0.02) 1px,transparent 1px,transparent 10px)",
          border: "1px dashed rgba(79,142,247,0.15)",
        }}>
          <span style={{ fontSize: 30 }}>🗺</span>
          <div style={{ color: "#334155", fontSize: 13, fontWeight: 600 }}>Интерактивная карта России — Deck.gl (в разработке)</div>
          <div style={{ color: "#1e3a5f", fontSize: 11 }}>{stats?.total_institutions?.toLocaleString("ru")} организаций · пузыри по бюджету</div>
        </div>

        {/* Projects table */}
        <div style={box}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16 }}>
            <SectionTitle>Проекты</SectionTitle>
            <span style={{ color: "#334155", fontSize: 13, marginTop: -14 }}>
              {total.toLocaleString("ru")} результатов
            </span>
            <span style={{ color: "#1e3a5f", fontSize: 11, marginTop: -14 }}>· нажмите на строку для подробностей</span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Рег №","Название / Ключевые слова","Организация","Год","Тип НИР","Бюджет","Руководитель"].map(h => (
                    <th key={h} style={{
                      padding: "9px 12px", textAlign: "left",
                      color: "#334155", fontSize: 10, fontWeight: 600,
                      letterSpacing: 0.7, textTransform: "uppercase",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map((p, i) => (
                  <tr key={i}
                    onClick={() => setSelected(p)}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", verticalAlign: "top", cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(79,142,247,0.06)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "11px 12px", color: "#334155", fontSize: 10, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                      {p.registration_number}
                    </td>
                    <td style={{ padding: "11px 12px", maxWidth: 300 }}>
                      <div style={{ color: "#cbd5e1", fontSize: 12, lineHeight: 1.4 }}>{p.name || "—"}</div>
                      <Tags keywords={p.keyword_list} max={4} />
                    </td>
                    <td style={{ padding: "11px 12px", color: "#64748b", fontSize: 11, maxWidth: 180 }}>
                      {p.institution ? shortName(p.institution, 40) : "—"}
                    </td>
                    <td style={{ padding: "11px 12px", color: "#4f8ef7", fontSize: 13, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                      {p.year || "—"}
                    </td>
                    <td style={{ padding: "11px 12px", maxWidth: 120 }}>
                      {p.nioktr_types ? (
                        <span style={{
                          background: "rgba(110,231,183,0.1)", border: "1px solid rgba(110,231,183,0.2)",
                          borderRadius: 5, padding: "2px 7px", fontSize: 10, color: "#6ee7b7",
                        }}>{p.nioktr_types.slice(0,18)}</span>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "11px 12px", color: "#f59e42", fontSize: 12, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                      {fmtBudget(p.budget_total_thousands)}
                    </td>
                    <td style={{ padding: "11px 12px", color: "#64748b", fontSize: 11 }}>
                      {p.supervisor_full_name || <span style={{ color: "#1e3a5f" }}>н/д</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18, justifyContent: "center" }}>
            <PageBtn label="← Пред" disabled={page === 1} onClick={() => goPage(page - 1)} />
            {[...Array(Math.min(7, pages))].map((_, i) => {
              const pg = Math.max(1, Math.min(page - 3, pages - 6)) + i;
              if (pg < 1 || pg > pages) return null;
              return (
                <button key={pg} onClick={() => goPage(pg)} style={{
                  width: 34, height: 34, borderRadius: 7, border: "none",
                  background: page === pg ? "#4f8ef7" : "rgba(255,255,255,0.05)",
                  color: page === pg ? "#fff" : "#475569",
                  cursor: "pointer", fontSize: 12, fontWeight: page === pg ? 700 : 400,
                }}>{pg}</button>
              );
            })}
            <PageBtn label="След →" disabled={page >= pages} onClick={() => goPage(page + 1)} />
          </div>
        </div>

      </div>
    </div>
  );
}
