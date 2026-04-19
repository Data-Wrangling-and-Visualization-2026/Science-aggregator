/**
 * RegionMap.jsx — Карта России
 * - Mercator projection (знакомый вид России)
 * - world-atlas TopoJSON для точного контура
 * - Force-spread bubbles (без наслоений)
 */
import { useEffect, useState, useMemo } from "react";

const API = "http://localhost:8000";
const SW = 780, SH = 430;
const LON0 = 19, LON1 = 192;

// Mercator projection
function mercY(lat) {
  return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
}
const MY1 = mercY(74);  // North clip
const MY0 = mercY(41);  // South clip

function proj(lat, lon) {
  const nlon = lon < -10 ? lon + 360 : lon;
  const my   = mercY(lat);
  return {
    x: (nlon - LON0) / (LON1 - LON0) * SW,
    y: (MY1 - my)   / (MY1 - MY0)   * SH,
  };
}

const FO = {
  CFO:  { name:"ЦФО",  color:"#4f8ef7", full:"Центральный" },
  SZFO: { name:"СЗФО", color:"#6ee7b7", full:"Северо-Западный" },
  UFO:  { name:"ЮФО",  color:"#f59e42", full:"Южный" },
  SKFO: { name:"СКФО", color:"#f472b6", full:"Северо-Кавказский" },
  PFO:  { name:"ПФО",  color:"#a78bfa", full:"Приволжский" },
  URFO: { name:"УФО",  color:"#34d399", full:"Уральский" },
  SFO:  { name:"СФО",  color:"#fbbf24", full:"Сибирский" },
  DVFO: { name:"ДФО",  color:"#60a5fa", full:"Дальневосточный" },
};

// Реальные границы из world-atlas (TopoJSON, ~92KB, CDN)
function useRussiaPaths() {
  const [paths, setPaths] = useState([]);
  useEffect(() => {
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
      .then(r => r.json())
      .then(topo => {
        const { scale, translate } = topo.transform;
        const decoded = topo.arcs.map(arc => {
          let x = 0, y = 0;
          return arc.map(([dx, dy]) => {
            x += dx; y += dy;
            return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
          });
        });
        const russia = topo.objects.countries.geometries.find(g => String(g.id) === "643");
        if (!russia) return;
        const getArc = idx => idx < 0 ? [...decoded[~idx]].reverse() : decoded[idx];

        const ringToPath = (arcIdxs) => {
          const cmds = [];
          let prevX = null;
          for (const idx of arcIdxs) {
            for (const [lon, lat] of getArc(idx)) {
              if (lat < 40 || lat > 75) continue;
              const nlon = lon < -10 ? lon + 360 : lon;
              if (nlon < LON0 - 2 || nlon > LON1 + 2) continue;
              const sx = (nlon - LON0) / (LON1 - LON0) * SW;
              const my = Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
              const sy = (MY1 - my) / (MY1 - MY0) * SH;
              if (prevX !== null && Math.abs(sx - prevX) > SW * 0.25) {
                cmds.push(`M${sx.toFixed(1)},${sy.toFixed(1)}`);
              } else {
                cmds.push(cmds.length === 0 ? `M${sx.toFixed(1)},${sy.toFixed(1)}` : `L${sx.toFixed(1)},${sy.toFixed(1)}`);
              }
              prevX = sx;
            }
          }
          return cmds.length > 3 ? cmds.join("") + "Z" : "";
        };

        const result = [];
        if (russia.type === "Polygon") {
          const d = ringToPath(russia.arcs[0]); if (d) result.push(d);
        } else if (russia.type === "MultiPolygon") {
          for (const poly of russia.arcs) {
            const d = ringToPath(poly[0]); if (d) result.push(d);
          }
        }
        setPaths(result);
      })
      .catch(err => console.warn("world-atlas failed:", err));
  }, []);
  return paths;
}

const FO_LABELS = [
  { fo:"CFO",  lat:55.5, lon:38.0 },
  { fo:"SZFO", lat:63.0, lon:42.0 },
  { fo:"UFO",  lat:47.0, lon:40.5 },
  { fo:"SKFO", lat:43.5, lon:44.5 },
  { fo:"PFO",  lat:55.5, lon:52.0 },
  { fo:"URFO", lat:61.5, lon:66.0 },
  { fo:"SFO",  lat:57.0, lon:92.0 },
  { fo:"DVFO", lat:60.5, lon:135.0 },
];

const CITIES = [
  // ЦФО
  { keys:["московск","москов","мгу ","мфти","мифи","мгимо","рггу","ргму","вшэ","рудн","мгту","мэи ","рхту","тимиряз","бауман","плеханов","финансов","геодезии","архитектур","государственн управлен","академия наук рф","российская академия","ран ","фиц ран","институт ран","высшей школы","президентск"], city:"Москва", lat:55.75, lon:37.62, fo:"CFO" },
  { keys:["воронеж","вгу ","воронежск"], city:"Воронеж", lat:51.67, lon:39.18, fo:"CFO" },
  { keys:["ярославск","ярославл"], city:"Ярославль", lat:57.63, lon:39.87, fo:"CFO" },
  { keys:["тверск","тверь","тверского"], city:"Тверь", lat:56.86, lon:35.90, fo:"CFO" },
  { keys:["курск ","курский","курского"], city:"Курск", lat:51.73, lon:36.19, fo:"CFO" },
  { keys:["белгород","белгородск"], city:"Белгород", lat:50.60, lon:36.59, fo:"CFO" },
  { keys:["орёл ","орел ","орловск"], city:"Орёл", lat:52.97, lon:36.08, fo:"CFO" },
  { keys:["брянск"], city:"Брянск", lat:53.26, lon:34.37, fo:"CFO" },
  { keys:["смоленск"], city:"Смоленск", lat:54.78, lon:32.05, fo:"CFO" },
  { keys:["иваново","ивановск"], city:"Иваново", lat:57.00, lon:40.97, fo:"CFO" },
  { keys:["рязань","рязанск"], city:"Рязань", lat:54.63, lon:39.73, fo:"CFO" },
  { keys:["тула ","тульск"], city:"Тула", lat:54.19, lon:37.62, fo:"CFO" },
  { keys:["липецк"], city:"Липецк", lat:52.61, lon:39.60, fo:"CFO" },
  { keys:["тамбов","тамбовск"], city:"Тамбов", lat:52.72, lon:41.45, fo:"CFO" },
  { keys:["калуга","калужск"], city:"Калуга", lat:54.52, lon:36.28, fo:"CFO" },
  { keys:["владимир","владимирск"], city:"Владимир", lat:56.13, lon:40.41, fo:"CFO" },
  { keys:["костромск","кострома"], city:"Кострома", lat:57.77, lon:40.93, fo:"CFO" },
  // СЗФО
  { keys:["санкт-петербург","спбгу","спбгэту","итмо","спбпу","ленинград","лэти","спб государ","петербургск","санкт петербург","спб ","питер"], city:"Санкт-Петербург", lat:59.95, lon:30.32, fo:"SZFO" },
  { keys:["архангельск","сафу","архангельского"], city:"Архангельск", lat:64.54, lon:40.54, fo:"SZFO" },
  { keys:["мурманск","мурманского"], city:"Мурманск", lat:68.97, lon:33.07, fo:"SZFO" },
  { keys:["петрозаводск","карельск"], city:"Петрозаводск", lat:61.79, lon:34.36, fo:"SZFO" },
  { keys:["сыктывкар","коми "], city:"Сыктывкар", lat:61.67, lon:50.84, fo:"SZFO" },
  { keys:["вологда","вологодск"], city:"Вологда", lat:59.22, lon:39.89, fo:"SZFO" },
  { keys:["псков","псковск"], city:"Псков", lat:57.82, lon:28.33, fo:"SZFO" },
  { keys:["новгород велик","новгородского"], city:"Вел. Новгород", lat:58.52, lon:31.27, fo:"SZFO" },
  { keys:["калининград","бфу","калининградск"], city:"Калининград", lat:54.71, lon:20.51, fo:"SZFO" },
  { keys:["череповец"], city:"Череповец", lat:59.13, lon:37.92, fo:"SZFO" },
  // ЮФО
  { keys:["ростов","юфу ","дгту","ростовск","ростова-на-дону","ростове-на-дону"], city:"Ростов-на-Дону", lat:47.22, lon:39.72, fo:"UFO" },
  { keys:["краснодар","кубан","краснодарск"], city:"Краснодар", lat:45.04, lon:38.98, fo:"UFO" },
  { keys:["волгоград","волгоградск"], city:"Волгоград", lat:48.72, lon:44.50, fo:"UFO" },
  { keys:["астраханск","астрахань"], city:"Астрахань", lat:46.35, lon:48.04, fo:"UFO" },
  { keys:["сочи","сочинск"], city:"Сочи", lat:43.60, lon:39.73, fo:"UFO" },
  { keys:["симферопол","крымск","республик крым"], city:"Симферополь", lat:44.95, lon:34.10, fo:"UFO" },
  // СКФО
  { keys:["ставропол","скфу","ставропольск"], city:"Ставрополь", lat:45.04, lon:41.97, fo:"SKFO" },
  { keys:["грозн","чечен"], city:"Грозный", lat:43.32, lon:45.70, fo:"SKFO" },
  { keys:["махачкал","дагест"], city:"Махачкала", lat:42.97, lon:47.50, fo:"SKFO" },
  { keys:["нальчик","кабардино"], city:"Нальчик", lat:43.49, lon:43.61, fo:"SKFO" },
  { keys:["владикавказ","северо-осетинск"], city:"Владикавказ", lat:43.02, lon:44.68, fo:"SKFO" },
  // ПФО
  { keys:["казанск","казань","кфу ","книту","казанского","казани "], city:"Казань", lat:55.79, lon:49.11, fo:"PFO" },
  { keys:["нижегородск","нижний новгород","ннгу","нижегородского"], city:"Нижний Новгород", lat:56.33, lon:44.00, fo:"PFO" },
  { keys:["самар","самарск"], city:"Самара", lat:53.20, lon:50.15, fo:"PFO" },
  { keys:["уфим","угнту","башкир","башкирского"], city:"Уфа", lat:54.74, lon:55.97, fo:"PFO" },
  { keys:["пермск","пгниу","пнипу","перми ","пермь"], city:"Пермь", lat:58.01, lon:56.23, fo:"PFO" },
  { keys:["саратов","саратовск"], city:"Саратов", lat:51.53, lon:46.03, fo:"PFO" },
  { keys:["ижевск","удмурт"], city:"Ижевск", lat:56.85, lon:53.21, fo:"PFO" },
  { keys:["пенза","пензенск"], city:"Пенза", lat:53.19, lon:45.02, fo:"PFO" },
  { keys:["ульяновск","ульяновского"], city:"Ульяновск", lat:54.32, lon:48.40, fo:"PFO" },
  { keys:["чебоксар","чуваш"], city:"Чебоксары", lat:56.14, lon:47.25, fo:"PFO" },
  { keys:["оренбург","оренбургск"], city:"Оренбург", lat:51.77, lon:55.10, fo:"PFO" },
  { keys:["тольятти","тольяттинск"], city:"Тольятти", lat:53.51, lon:49.42, fo:"PFO" },
  { keys:["йошкар-ола","марийск","йошкар"], city:"Йошкар-Ола", lat:56.63, lon:47.89, fo:"PFO" },
  { keys:["саранск","мордовск"], city:"Саранск", lat:54.19, lon:45.18, fo:"PFO" },
  { keys:["кирова ","кировск","вятск","вгу киров"], city:"Киров", lat:58.60, lon:49.66, fo:"PFO" },
  // УФО
  { keys:["екатеринбург","уральск","урфу","угту","угму","свердловск","уральского"], city:"Екатеринбург", lat:56.84, lon:60.60, fo:"URFO" },
  { keys:["челябинск","юургу","челябинского"], city:"Челябинск", lat:55.16, lon:61.40, fo:"URFO" },
  { keys:["тюмен","тюмгу","тюменского","тюмени "], city:"Тюмень", lat:57.15, lon:68.00, fo:"URFO" },
  { keys:["сургут","сургутск"], city:"Сургут", lat:61.25, lon:73.43, fo:"URFO" },
  { keys:["магнитогорск"], city:"Магнитогорск", lat:53.41, lon:59.04, fo:"URFO" },
  // СФО
  { keys:["омск","омгту ","омского","омской","омску"], city:"Омск", lat:54.99, lon:73.37, fo:"SFO" },
  { keys:["новосибирск","нгу ","нгту ","новосибирского","сонран","сиб отд"], city:"Новосибирск", lat:55.04, lon:82.93, fo:"SFO" },
  { keys:["красноярск","сфу ","красноярского"], city:"Красноярск", lat:56.02, lon:92.87, fo:"SFO" },
  { keys:["томск","тгу ","тпу ","нитпу","томского","томской"], city:"Томск", lat:56.50, lon:84.97, fo:"SFO" },
  { keys:["барнаул","алтайск","алтай"], city:"Барнаул", lat:53.35, lon:83.80, fo:"SFO" },
  { keys:["кемеров","кузбасс","кемеровск"], city:"Кемерово", lat:55.35, lon:86.09, fo:"SFO" },
  { keys:["иркутск","игу ","ирниту","иркутского"], city:"Иркутск", lat:52.29, lon:104.30, fo:"SFO" },
  { keys:["улан-удэ","бурятск"], city:"Улан-Удэ", lat:51.83, lon:107.61, fo:"SFO" },
  { keys:["чита ","забгу","читинск","забайкальск"], city:"Чита", lat:52.04, lon:113.50, fo:"SFO" },
  { keys:["абакан","хакасск"], city:"Абакан", lat:53.72, lon:91.43, fo:"SFO" },
  { keys:["новокузнецк"], city:"Новокузнецк", lat:53.76, lon:87.09, fo:"SFO" },
  // ДФО
  { keys:["владивосток","двфу","тихоокеанск","владивостокск"], city:"Владивосток", lat:43.12, lon:131.90, fo:"DVFO" },
  { keys:["хабаровск","тогу ","хгу ","хабаровского"], city:"Хабаровск", lat:48.48, lon:135.08, fo:"DVFO" },
  { keys:["якутск","свфу","якутия","якутского"], city:"Якутск", lat:62.03, lon:129.73, fo:"DVFO" },
  { keys:["благовещенск","амурск","амгу "], city:"Благовещенск", lat:50.28, lon:127.53, fo:"DVFO" },
  { keys:["южно-сахалинск","сахалинск","сахалин"], city:"Южно-Сахалинск", lat:46.96, lon:142.74, fo:"DVFO" },
  { keys:["петропавловск-камчатск","камчатск"], city:"Петропавловск-К.", lat:53.05, lon:158.65, fo:"DVFO" },
  { keys:["магадан","магаданск"], city:"Магадан", lat:59.57, lon:150.79, fo:"DVFO" },
  { keys:["биробиджан","еврейск"], city:"Биробиджан", lat:48.79, lon:132.92, fo:"DVFO" },
];

// Fallback: поиск первого слова названия города в тексте
const CITY_NAME_SEARCH = CITIES.reduce((acc, c) => {
  const base = c.city.toLowerCase().replace(/[.-]/g,"").split(" ")[0];
  if (base.length > 4 && !acc.find(x => x.pat === base)) acc.push({ pat: base, city: c });
  return acc;
}, []);

function fmt(val) {
  if (!val) return "—";
  const b = val / 1_000_000;
  if (b >= 1) return `${b.toFixed(1)} млрд ₽`;
  const m = val / 1_000;
  if (m >= 1) return `${m.toFixed(0)} млн ₽`;
  return `${Math.round(val).toLocaleString("ru")} тыс ₽`;
}

// Force-spread bubbles so they don't overlap, spring toward geographic position
function computeSpread(cities, getValue, maxVal) {
  if (!cities.length) return {};
  const bs = cities.map(c => {
    const { x: gx, y: gy } = proj(c.lat, c.lon);
    const val = getValue(c);
    const r = Math.max(4, Math.sqrt(val / maxVal) * 36);
    return { key: c.city, x: gx, y: gy, gx, gy, r, vx: 0, vy: 0 };
  });
  for (let iter = 0; iter < 100; iter++) {
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      for (let j = i + 1; j < bs.length; j++) {
        const b = bs[j];
        const dx = (b.x - a.x) || 0.01, dy = (b.y - a.y) || 0.01;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minD = a.r + b.r + 3;
        if (dist < minD) {
          const push = (minD - dist) / dist * 0.5;
          a.vx -= dx * push; a.vy -= dy * push;
          b.vx += dx * push; b.vy += dy * push;
        }
      }
      a.vx += (a.gx - a.x) * 0.07;
      a.vy += (a.gy - a.y) * 0.07;
    }
    for (const b of bs) {
      b.vx *= 0.65; b.vy *= 0.65;
      b.x += b.vx; b.y += b.vy;
      b.x = Math.max(b.r, Math.min(SW - b.r, b.x));
      b.y = Math.max(b.r, Math.min(SH - b.r, b.y));
    }
  }
  return Object.fromEntries(bs.map(b => [b.key, { x: b.x, y: b.y, r: b.r }]));
}

export default function RegionMap() {
  const russiaPaths = useRussiaPaths();
  const [cityData, setCityData] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [hovered,  setHovered]  = useState(null);
  const [pinned,   setPinned]   = useState(null);
  const [colorBy,  setColorBy]  = useState("projects");

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/map-data`)
      .then(r => r.json())
      .then(rows => {
        const agg = {};
        let matched = 0;
        for (const row of rows) {
          const name = (row.institution || "").toLowerCase();
          let city = CITIES.find(c => c.keys.some(k => name.includes(k)));
          if (!city) city = CITY_NAME_SEARCH.find(({ pat }) => name.includes(pat))?.city;
          if (!city) continue;
          matched += Number(row.projects) || 0;
          if (!agg[city.city]) agg[city.city] = { ...city, projects: 0, budget: 0, orgs: [] };
          agg[city.city].projects += Number(row.projects) || 0;
          agg[city.city].budget   += Number(row.total_budget) || 0;
          if (row.institution) {
            agg[city.city].orgs.push({ name: row.institution, projects: Number(row.projects)||0, budget: Number(row.total_budget)||0 });
          }
        }
        const result = Object.values(agg)
          .filter(c => c.projects > 0)
          .map(c => ({ ...c, orgs: c.orgs.sort((a,b) => b.projects - a.projects).slice(0, 5) }));
        setCityData(result);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const active = pinned || hovered;
  const maxProj = Math.max(...cityData.map(c => c.projects), 1);
  const maxBudg = Math.max(...cityData.map(c => c.budget),   1);
  const totalOnMap = cityData.reduce((s, c) => s + c.projects, 0);

  // Compute spread positions whenever data or colorBy changes
  const spread = useMemo(() => {
    const maxVal = colorBy === "projects" ? maxProj : maxBudg;
    const getVal = c => colorBy === "projects" ? c.projects : c.budget;
    return computeSpread(cityData, getVal, maxVal);
  }, [cityData, colorBy, maxProj, maxBudg]);

  const box = {
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 16,
    padding: "22px 26px",
  };

  return (
    <div style={box}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12, marginBottom:14 }}>
        <div>
          <div style={{ color:"#475569", fontSize:11, textTransform:"uppercase", letterSpacing:1.1, marginBottom:4 }}>
            ✦ КАРТА НАУКИ
          </div>
          <div style={{ color:"#e2e8f0", fontSize:17, fontWeight:700 }}>
            Географическое распределение по федеральным округам
          </div>
          <div style={{ color:"#334155", fontSize:11, marginTop:4 }}>
            Hover — детали · Click — закрепить · Повторный клик — снять
          </div>
          {cityData.length > 0 && (
            <div style={{ color:"#475569", fontSize:11, marginTop:2 }}>
              На карте: <span style={{ color:"#4f8ef7" }}>{totalOnMap.toLocaleString("ru")}</span> проектов из ~104 466 ({Math.round(totalOnMap/104466*100)}%) · остальные — организации без явного города в названии
            </div>
          )}
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <span style={{ color:"#475569", fontSize:11 }}>Размер:</span>
          {["projects","budget"].map(v => (
            <button key={v} onClick={() => setColorBy(v)}
              style={{
                padding:"5px 14px", borderRadius:20, border:"none", cursor:"pointer", fontSize:12, fontWeight:600,
                background: colorBy===v ? "linear-gradient(135deg,#4f8ef7,#6ee7b7)" : "rgba(255,255,255,0.07)",
                color: colorBy===v ? "#fff" : "#94a3b8",
              }}>
              {v === "projects" ? "Проекты" : "Бюджет"}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 14px", marginBottom:12 }}>
        {Object.entries(FO).map(([k, fo]) => (
          <div key={k} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:fo.color }} />
            <span style={{ color:"#94a3b8" }}>{fo.name} — {fo.full}</span>
          </div>
        ))}
      </div>

      {loading && (
        <div style={{ height:430, display:"flex", alignItems:"center", justifyContent:"center", color:"#475569" }}>
          Загрузка карты…
        </div>
      )}
      {error && (
        <div style={{ height:430, display:"flex", alignItems:"center", justifyContent:"center", color:"#fda4af" }}>
          ⚠️ {error}
        </div>
      )}

      {!loading && !error && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 230px" }}>
          <svg viewBox={`0 0 ${SW} ${SH}`}
            style={{ width:"100%", height:430, background:"#060f1e", display:"block", borderRadius:"10px 0 0 10px" }}>

            {/* Russia outline */}
            {russiaPaths.map((d, i) => (
              <path key={i} d={d} fill="rgba(79,142,247,0.07)" stroke="rgba(79,142,247,0.3)" strokeWidth={1} />
            ))}

            {/* FO labels */}
            {FO_LABELS.map(l => {
              const { x, y } = proj(l.lat, l.lon);
              return (
                <text key={l.fo} x={x} y={y} textAnchor="middle"
                  fill={FO[l.fo]?.color || "#475569"} fontSize={9} fontWeight="600"
                  opacity={0.35} style={{ pointerEvents:"none", userSelect:"none" }}>
                  {FO[l.fo]?.name}
                </text>
              );
            })}

            {/* Bubbles — sorted largest first, using force-spread positions */}
            {[...cityData]
              .sort((a, b) => (colorBy==="projects" ? b.projects-a.projects : b.budget-a.budget))
              .map((c) => {
                const sp = spread[c.city];
                if (!sp) return null;
                const { x, y, r } = sp;
                const col = FO[c.fo]?.color || "#4f8ef7";
                const isActive = active?.city === c.city;
                return (
                  <g key={c.city}
                    onMouseEnter={() => !pinned && setHovered(c)}
                    onMouseLeave={() => !pinned && setHovered(null)}
                    onClick={() => setPinned(prev => prev?.city === c.city ? null : c)}
                    style={{ cursor:"pointer" }}>
                    {isActive && (
                      <circle cx={x} cy={y} r={r + 5} fill="none"
                        stroke={col} strokeWidth={1.5} opacity={0.5} />
                    )}
                    <circle cx={x} cy={y}
                      r={isActive ? r * 1.1 : r}
                      fill={col}
                      opacity={isActive ? 0.95 : 0.80}
                      style={{ transition:"r 0.15s" }}
                    />
                    {r > 13 && (
                      <text x={x} y={y} textAnchor="middle" dominantBaseline="middle"
                        fill="#fff" stroke="#060f1e" strokeWidth="2.5" paintOrder="stroke"
                        fontSize={Math.min(r * 0.38, 9)} fontWeight="600"
                        style={{ pointerEvents:"none", userSelect:"none" }}>
                        {c.city.split("-")[0].split(" ")[0].slice(0, 7)}
                      </text>
                    )}
                  </g>
                );
              })}

            {/* Tooltip */}
            {active && (() => {
              const sp = spread[active.city];
              if (!sp) return null;
              const { x, y, r } = sp;
              const foInfo = FO[active.fo];
              const lines = [active.city, `${active.projects.toLocaleString("ru")} проектов`, fmt(active.budget)];
              const tw = Math.max(...lines.map(l => l.length)) * 6.5 + 16;
              const tx = Math.min(x + r + 6, SW - tw - 4);
              const ty = Math.max(y - 32, 4);
              return (
                <g style={{ pointerEvents:"none" }}>
                  <rect x={tx} y={ty} width={tw} height={foInfo ? 68 : 56} rx={6}
                    fill="#0d1526" stroke="rgba(79,142,247,0.55)" strokeWidth={1} />
                  <text x={tx+8} y={ty+15} fill="#e2e8f0" fontSize={12} fontWeight="700">{lines[0]}</text>
                  <text x={tx+8} y={ty+31} fill="#4f8ef7" fontSize={10}>{lines[1]}</text>
                  <text x={tx+8} y={ty+46} fill="#f59e42" fontSize={10}>{lines[2]}</text>
                  {foInfo && (
                    <text x={tx+8} y={ty+61} fill={foInfo.color} fontSize={9}>{foInfo.name} — {foInfo.full} ФО</text>
                  )}
                </g>
              );
            })()}
          </svg>

          {/* Sidebar */}
          <div style={{ background:"rgba(0,0,0,0.2)", borderLeft:"1px solid rgba(255,255,255,0.06)", padding:"18px 14px", overflowY:"auto", maxHeight:430, borderRadius:"0 10px 10px 0" }}>
            {active ? (
              <>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                  <div>
                    <div style={{ color:"#e2e8f0", fontSize:15, fontWeight:700 }}>{active.city}</div>
                    {active.fo && (
                      <div style={{ color:FO[active.fo]?.color, fontSize:10, marginTop:2 }}>
                        {FO[active.fo]?.name} — {FO[active.fo]?.full}
                      </div>
                    )}
                  </div>
                  {pinned && (
                    <button onClick={() => setPinned(null)}
                      style={{ background:"rgba(245,158,66,0.15)", border:"1px solid rgba(245,158,66,0.3)", color:"#f59e42", borderRadius:6, padding:"3px 8px", fontSize:10, cursor:"pointer" }}>
                      ✕ Снять
                    </button>
                  )}
                </div>
                <div style={{ color:"#475569", fontSize:10, marginBottom:14 }}>
                  {active.lat.toFixed(1)}°N · {active.lon.toFixed(1)}°E
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
                  <div>
                    <div style={{ color:"#475569", fontSize:9, textTransform:"uppercase" }}>Проектов</div>
                    <div style={{ color:"#4f8ef7", fontSize:20, fontWeight:700 }}>{active.projects.toLocaleString("ru")}</div>
                  </div>
                  <div>
                    <div style={{ color:"#475569", fontSize:9, textTransform:"uppercase" }}>Бюджет</div>
                    <div style={{ color:"#f59e42", fontSize:15, fontWeight:700 }}>{fmt(active.budget)}</div>
                  </div>
                </div>
                <div style={{ color:"#475569", fontSize:9, textTransform:"uppercase", marginBottom:10 }}>Топ организации</div>
                {active.orgs.map((o, i) => (
                  <div key={i} style={{ marginBottom:10, paddingBottom:10, borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ color:"#cbd5e1", fontSize:10, lineHeight:1.4, marginBottom:3 }}>
                      {o.name.slice(0, 60)}{o.name.length > 60 ? "…" : ""}
                    </div>
                    <div style={{ color:"#475569", fontSize:9 }}>
                      {o.projects.toLocaleString("ru")} проектов · {fmt(o.budget)}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <>
                <div style={{ color:"#475569", fontSize:10, textTransform:"uppercase", letterSpacing:0.8, marginBottom:12 }}>
                  По федеральным округам
                </div>
                {Object.entries(FO).map(([key, fo]) => {
                  const cities = cityData.filter(c => c.fo === key);
                  const total = cities.reduce((s, c) => s + c.projects, 0);
                  if (!total) return null;
                  return (
                    <div key={key} style={{ marginBottom:9 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                        <span style={{ color:fo.color, fontSize:11, fontWeight:600 }}>{fo.name}</span>
                        <span style={{ color:"#94a3b8", fontSize:10, fontFamily:"monospace" }}>{total.toLocaleString("ru")}</span>
                      </div>
                      <div style={{ height:3, background:"rgba(255,255,255,0.06)", borderRadius:2 }}>
                        <div style={{ height:3, borderRadius:2, background:fo.color, width:`${total/maxProj*100}%` }} />
                      </div>
                      <div style={{ color:"#334155", fontSize:9, marginTop:1 }}>{cities.length} городов</div>
                    </div>
                  );
                })}
                <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)", marginTop:14, paddingTop:14 }}>
                  <div style={{ color:"#475569", fontSize:10, textTransform:"uppercase", letterSpacing:0.8, marginBottom:12 }}>
                    Топ городов
                  </div>
                  {[...cityData]
                    .sort((a,b) => colorBy==="projects" ? b.projects-a.projects : b.budget-a.budget)
                    .slice(0, 10)
                    .map((c, i) => (
                      <div key={i} style={{ marginBottom:7, cursor:"pointer" }}
                        onMouseEnter={() => setHovered(c)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => setPinned(c)}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
                          <span style={{ color:"#cbd5e1", fontSize:10 }}>{i+1}. {c.city}</span>
                          <span style={{ color:FO[c.fo]?.color||"#4f8ef7", fontSize:10, fontFamily:"monospace" }}>
                            {colorBy==="projects" ? c.projects.toLocaleString("ru") : fmt(c.budget)}
                          </span>
                        </div>
                        <div style={{ height:2, background:"rgba(255,255,255,0.06)", borderRadius:2 }}>
                          <div style={{ height:2, borderRadius:2, background:FO[c.fo]?.color||"#4f8ef7",
                            width:`${(colorBy==="projects"?c.projects:c.budget)/(colorBy==="projects"?maxProj:maxBudg)*100}%` }} />
                        </div>
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
