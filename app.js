/* חניונים בתל אביב — Google Maps edition */
"use strict";
const CFG = window.APP_CONFIG || {};
const $ = id => document.getElementById(id);

/* ---------- theme ---------- */
const THEMES = ["system", "light", "dark"];
const ICONS = {
  system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
};
const TNAME = { system: "לפי המכשיר", light: "בהיר", dark: "כהה" };
let theme = "system";
try { theme = localStorage.getItem("tlvtheme") || "system"; } catch (e) {}
const themeBtn = $("themeBtn");
const isDark = () => theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
function applyTheme() {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
  themeBtn.innerHTML = ICONS[theme];
  themeBtn.title = "מצב תצוגה: " + TNAME[theme];
  themeBtn.setAttribute("aria-label", "מצב תצוגה: " + TNAME[theme] + ". הקשה מחליפה");
}
themeBtn.onclick = () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % 3];
  try { localStorage.setItem("tlvtheme", theme); } catch (e) {}
  applyTheme(); rebuildMap();
};
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if (theme === "system") rebuildMap(); });
applyTheme();

/* ---------- state ---------- */
let LOTS = [], LANDMARKS = [], DATA_UPDATED = "";
const OPC = { A: "var(--ahuzot)", C: "var(--cp)", P: "var(--priv)" };
const OPN = { A: "אחוזות החוף", C: "סנטרל פארק", P: "פרטי" };
const state = { dest: null, destName: "", ops: { A: true, C: true, P: true }, resident: false, app: true, sel: null, view: "map", sort: "dist",
  maxHour: 40, maxDist: 5000, text: "", eveOnly: false, evOnly: false, openOnly: false };
try { const s = JSON.parse(localStorage.getItem("tlvpark3") || "null"); if (s) for (const k of ["ops", "resident", "app", "sort", "maxHour", "eveOnly", "evOnly"]) if (k in s) state[k] = s[k]; } catch (e) {}
const save = () => { try { localStorage.setItem("tlvpark3", JSON.stringify({ ops: state.ops, resident: state.resident, app: state.app, sort: state.sort, maxHour: state.maxHour, eveOnly: state.eveOnly, evOnly: state.evOnly })); } catch (e) {} };

/* ---------- helpers ---------- */
function dist(a, b) { const R = 6371000, t = Math.PI / 180, dl = (b[0] - a[0]) * t, dg = (b[1] - a[1]) * t; const h = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dg / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
const fmtD = m => m < 1000 ? Math.round(m / 10) * 10 + " מ׳" : (m / 1000).toFixed(1) + " ק״מ";
const walk = m => Math.max(1, Math.round(m * 1.25 / 80));
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = (v, alt = 1e9) => v == null ? alt : v;
const navTarget = l => l.addr ? encodeURIComponent(l.name + ", " + l.addr) : `${l.lat},${l.lng}`;
const wazeUrl = l => !l.approx ? `https://waze.com/ul?ll=${l.lat},${l.lng}&navigate=yes` : "https://waze.com/ul?q=" + navTarget(l) + "&navigate=yes";
const gmapUrl = l => "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" + (!l.approx ? `${l.lat},${l.lng}` : navTarget(l));
const useApp = l => l.op === "C" && state.app;
const pick2 = (l, full, app) => useApp(l) && app != null ? app : full;
const hourOf = l => state.resident && l.res != null ? l.res : pick2(l, l.hour, l.hourApp);
const eveOf = l => {
  if (state.resident && l.resEve != null) return l.resEve;
  if (l.op === "C") return l.eve != null ? pick2(l, l.eve, l.eveApp) : (l.eveHour != null ? pick2(l, l.eveHour, l.eveHourApp) : null);
  return l.eve ?? l.day ?? null;
};
function isOpen(l) {
  if (l.hours === "24/7") return true;
  if (!l.sched) return null;
  const now = new Date(), d = now.getDay(), m = now.getHours() * 60 + now.getMinutes();
  const s = l.sched[d]; if (s === undefined) return null; if (s === null) return false;
  const [a, b] = s.split("-").map(t => { const [h, mm] = t.split(":").map(Number); return h * 60 + mm; });
  return b > a ? (m >= a && m < b) : (m >= a || m < b);
}

/* ---------- filtering & sorting ---------- */
function compute() {
  const tq = state.text.trim();
  const rows = LOTS.map(l => {
    const d = state.dest ? dist(state.dest, [l.lat, l.lng]) : null;
    const pass = state.ops[l.op]
      && (state.maxHour >= 40 || (hourOf(l) != null && hourOf(l) <= state.maxHour))
      && (!state.dest || state.maxDist >= 5000 || d <= state.maxDist)
      && (!tq || (l.name + " " + (l.addr || "")).includes(tq))
      && (!state.eveOnly || eveOf(l) != null)
      && (!state.evOnly || (l.ev || 0) > 0)
      && (!state.openOnly || isOpen(l) === true);
    return { l, d, pass };
  });
  const sorter = {
    dist: (a, b) => state.dest ? a.d - b.d : num(hourOf(a.l)) - num(hourOf(b.l)),
    hour: (a, b) => num(hourOf(a.l)) - num(hourOf(b.l)) || num(a.d, 0) - num(b.d, 0),
    eve: (a, b) => num(eveOf(a.l)) - num(eveOf(b.l)) || num(a.d, 0) - num(b.d, 0),
    cap: (a, b) => num(b.l.cap, -1) - num(a.l.cap, -1),
    name: (a, b) => a.l.name.localeCompare(b.l.name, "he")
  }[state.sort];
  return { rows, shown: rows.filter(r => r.pass).sort(sorter) };
}

/* ---------- cards ---------- */
function freeLine(l) {
  if (l.liveFree != null) return `<span class="live">● ${l.liveFree} פנויים עכשיו</span>`;
  if (l.free != null) return `${l.free} פנויים (נכון ל־${DATA_UPDATED})`;
  return "";
}
function card(r, i, flagCheap) {
  const l = r.l, h = hourOf(l), e = eveOf(l), open = isOpen(l), meta = [];
  if (r.d != null) meta.push(`${fmtD(r.d)} · כ־${walk(r.d)} דק׳ הליכה`);
  if (l.op === "C") {
    const P = (f, a) => useApp(l) ? a : f, line = (f, a, lbl) => f == null ? "" : `${lbl} ₪${P(f, a)}`;
    const extra = [line(l.addHour, l.addHourApp, "שעה נוספת"), line(l.day, l.dayApp, "יומי")].filter(Boolean).join(" · ");
    if (extra) meta.push(extra);
    const other = [l.hour != null ? `שעה ₪${useApp(l) ? l.hour : l.hourApp}` : "",
      (l.eve ?? l.eveHour) != null ? `ערב ₪${useApp(l) ? (l.eve ?? l.eveHour) : (l.eveApp ?? l.eveHourApp)}` : "",
      l.day != null ? `יומי ₪${useApp(l) ? l.day : l.dayApp}` : ""].filter(Boolean).join(" · ");
    meta.push(`<b style="color:var(--fg)">${useApp(l) ? "מחיר מלא (בלי האפליקציה)" : "באפליקציה"}:</b> ${other}`);
    const f = freeLine(l); if (f) meta.push(f);
  } else {
    if (l.addHour != null) meta.push(`שעה נוספת ₪${l.addHour}`);
    if (l.day != null && l.eve != null) meta.push(`יומי ₪${l.day}`);
  }
  if (l.cap) meta.push(`${l.cap} מקומות`);
  if (l.ev) meta.push(`⚡ ${l.ev} עמדות טעינה`);
  if (l.hours) meta.push(esc(l.hours));
  if (open !== null) meta.push(`<span class="pill ${open ? "open" : "closed"}">${open ? "פתוח עכשיו" : "סגור עכשיו"}</span>`);
  if (l.note) meta.push(esc(l.note));
  const sub = (lbl) => `${lbl}${state.resident && l.res != null ? " (תושב)" : ""}${useApp(l) && l.hourApp != null ? " · באפליקציה" : ""}`;
  return `<article class="lot ${state.sel === l.key ? "sel" : ""}" id="c-${l.key}">
    <div class="badge" style="background:${OPC[l.op]}">${i + 1}</div>
    <div class="body"><div class="op" style="color:${OPC[l.op]}">${OPN[l.op]}</div>
      <div class="nm" data-k="${l.key}" role="button" tabindex="0">${esc(l.name)}${flagCheap ? `<span class="tag">הזול בסביבה</span>` : ""}</div>
      <div class="ad">${esc(l.addr || "")}</div>
      <div class="meta">${meta.map(x => `<span>${x}</span>`).join("")}</div></div>
    <div class="prices">
      <div class="${h == null ? "na" : ""}"><b>${h != null ? "₪" + h : "—"}</b><span>${sub("לשעה")}</span></div>
      <div class="${e == null ? "na" : ""}"><b>${e != null ? "₪" + e : "—"}</b><span>${e != null ? esc(l.eveLbl || "ערב") + (l.eveFrom ? " מ־" + l.eveFrom : "") : "ערב"}</span></div>
    </div>
    <div class="actions">
      <a class="waze" href="${wazeUrl(l)}" target="_blank" rel="noopener">Waze</a>
      <a class="gmap" href="${gmapUrl(l)}" target="_blank" rel="noopener">Google Maps</a>
      ${l.url ? `<a href="${l.url}" target="_blank" rel="noopener">${l.urlLbl} ↗</a>` : ""}
    </div></article>`;
}
const foot = () => `<p class="note">אחוזות החוף: ₪24 לשעה למבקרים מאוגוסט 2026 (חיוב לפי דקות), כניסה חד־פעמית בערב ₪36. מחיר תושב ₪6 לשעה, ו־₪12 בתל־נורדאו, בזל, שרתון, בוגרשוב ובני דן. "תפוסה עכשיו" פותח את דף החניון באתר אחוזות החוף.<br>
סנטרל פארק: מחירי ימי חול מאתר החברה (עודכנו ${DATA_UPDATED}). כברירת מחדל מוצג המחיר למשלמים באפליקציית סנטרל פארק, והמחיר המלא מופיע בכרטיס. בסופי שבוע התעריף שונה. המחיר בשילוט בכניסה הוא המחייב.</p>`;

/* ---------- render ---------- */
const nearEl = $("near"), listEl = $("viewList");
function bind(el) { el.querySelectorAll("[data-k]").forEach(x => { x.onclick = () => select(x.dataset.k, true); x.onkeydown = e => { if (e.key === "Enter") select(x.dataset.k, true); }; }); }
function render() {
  const { rows, shown } = compute();
  const near = state.dest ? [...shown].sort((a, b) => a.d - b.d).slice(0, 12) : shown.slice(0, 12);
  const nearSet = new Set(near.map(r => r.l.key));
  renderMarkers(rows, nearSet);
  const cheap = (state.dest ? near.slice(0, 8) : []).filter(r => hourOf(r.l) != null).reduce((m, r) => !m || hourOf(r.l) < hourOf(m.l) ? r : m, null);
  for (const op of ["A", "C", "P"]) document.querySelector(`[data-op="${op}"] .n`).textContent = rows.filter(r => r.l.op === op).length;
  const empty = `<p class="note">אין חניונים שתואמים לסינון. שנו את הסינון למעלה.</p>`;
  if (state.view === "map") {
    nearEl.innerHTML = `<h2>${state.dest ? "הקרובים ל" + esc(state.destName) : "חניונים"}</h2><div class="count">${shown.length} חניונים תואמים · מוצגים ${near.length} הקרובים</div>` +
      (near.length ? near.map((r, i) => card(r, i, r === cheap)).join("") : empty) + foot();
    bind(nearEl);
  } else {
    listEl.innerHTML = `<h2>${state.dest ? "כל החניונים ביחס ל" + esc(state.destName) : "כל החניונים"}</h2><div class="count">${shown.length} מתוך ${rows.length} חניונים</div>` +
      (shown.length ? shown.map((r, i) => card(r, i, r === cheap)).join("") : empty) + foot();
    bind(listEl);
  }
}
function select(k, fly) {
  state.sel = k; const l = LOTS.find(x => x.key === k);
  if (fly && state.view === "list") setView("map");
  render();
  if (fly && gmap) { gmap.panTo({ lat: l.lat, lng: l.lng }); if (gmap.getZoom() < 16) gmap.setZoom(16); openInfo(l); window.scrollTo({ top: 0, behavior: "smooth" }); }
  else $("c-" + k)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/* ---------- Google Maps ---------- */
let gmap = null, G = null, info = null, destMarker = null, destCircle = null;
const markers = {};
function loadGoogle() {
  const key = CFG.GOOGLE_MAPS_API_KEY;
  if (!key || key.startsWith("PASTE")) return Promise.reject(new Error("no-key"));
  // Google's dynamic library loader
  ((g) => { var h, a, k, p = "The Google Maps JavaScript API", c = "google", l = "importLibrary", q = "__ib__", m = document, b = window; b = b[c] || (b[c] = {}); var d = b.maps || (b.maps = {}), r = new Set, e = new URLSearchParams, u = () => h || (h = new Promise(async (f, n) => { await (a = m.createElement("script")); e.set("libraries", [...r] + ""); for (k in g) e.set(k.replace(/[A-Z]/g, t => "_" + t[0].toLowerCase()), g[k]); e.set("callback", c + ".maps." + q); a.src = `https://maps.${c}apis.com/maps/api/js?` + e; d[q] = f; a.onerror = () => h = n(Error(p + " could not load.")); a.nonce = m.querySelector("script[nonce]")?.nonce || ""; m.head.append(a); })); d[l] ? console.warn(p + " only loads once. Ignoring:", g) : d[l] = (f, ...n) => r.add(f) && u().then(() => d[l](f, ...n)); })({ key, v: "weekly", language: "he", region: "IL" });
  return Promise.all(["maps", "marker", "geocoding", "core"].map(n => google.maps.importLibrary(n)))
    .then(([maps, marker, geocoding, core]) => { G = { ...maps, ...marker, ...geocoding, ...core }; });
}
function createMap() {
  const el = $("map"); el.innerHTML = "";
  const center = gmap ? gmap.getCenter() : (state.dest ? { lat: state.dest[0], lng: state.dest[1] } : { lat: 32.077, lng: 34.783 });
  const zoom = gmap ? gmap.getZoom() : 15.5;
  for (const k in markers) { markers[k].map = null; delete markers[k]; }
  gmap = new G.Map(el, {
    center, zoom, mapId: CFG.GOOGLE_MAP_ID || "DEMO_MAP_ID",
    colorScheme: isDark() ? G.ColorScheme.DARK : G.ColorScheme.LIGHT,
    disableDefaultUI: true, zoomControl: true, fullscreenControl: false, clickableIcons: false, gestureHandling: "greedy",
    restriction: { latLngBounds: { north: 32.16, south: 32.0, west: 34.70, east: 34.88 }, strictBounds: false }
  });
  info = new G.InfoWindow({ headerDisabled: false });
  gmap.addListener("click", e => setDest(e.latLng.lat(), e.latLng.lng(), "הנקודה שנבחרה", false));
  let lastSmall = gmap.getZoom() < 15;
  gmap.addListener("zoom_changed", () => { const s = gmap.getZoom() < 15; if (s !== lastSmall) { lastSmall = s; render(); } });
  drawDest();
  render();
}
function rebuildMap() { if (G) createMap(); }
function pinEl(l, far) {
  const c = OPC[l.op], h = hourOf(l), e = eveOf(l), hl = state.sel === l.key ? "hl" : "";
  const div = document.createElement("div");
  if (gmap.getZoom() < 15) {
    const v = h != null ? h : e;
    div.innerHTML = `<div class="mini ${far ? "far" : ""} ${hl}" style="--c:${c}"><i>P</i>${v != null ? "₪" + v : "–"}</div>`;
  } else {
    const top = h != null ? `<b><small>₪</small>${h}</b><span>לשעה${state.resident && l.res != null ? " · תושב" : useApp(l) ? " · אפ׳" : ""}</span>`
      : (e != null ? `<b><small>₪</small>${e}</b><span>${esc(l.eveLbl || "יומי")}</span>` : `<b>P</b><span>ראו תעריף</span>`);
    const bottom = (h != null && e != null) ? `<em>ערב ₪${e}${l.eveLbl === "ערב לשעה" ? "/ש׳" : ""}</em>` : "";
    div.innerHTML = `<div class="cpin ${far ? "far" : ""} ${hl}" style="--c:${c}"><div class="ring">${top}${bottom}</div><div class="p">P</div></div>`;
  }
  return div.firstElementChild;
}
function popupHtml(l) {
  const h = hourOf(l), e = eveOf(l);
  return `<div class="gm-pop"><b>${esc(l.name)}</b><br>${esc(l.addr || "")}<br>
  ${h != null ? `₪${h} לשעה` : ""}${h != null && e != null ? " · " : ""}${e != null ? `${esc(l.eveLbl || "ערב")} ₪${e}${l.eveFrom ? " מ־" + l.eveFrom : ""}` : ""}
  ${l.liveFree != null ? `<br><b style="color:#1f8a3b">${l.liveFree} פנויים עכשיו</b>` : ""}
  <div style="margin-top:6px"><a href="${wazeUrl(l)}" target="_blank" rel="noopener">Waze</a> · <a href="${gmapUrl(l)}" target="_blank" rel="noopener">Google Maps</a>${l.url ? ` · <a href="${l.url}" target="_blank" rel="noopener">${l.urlLbl}</a>` : ""}</div></div>`;
}
function openInfo(l) { if (!info) return; info.setContent(popupHtml(l)); info.open({ map: gmap, anchor: markers[l.key] }); }
function renderMarkers(rows, nearSet) {
  if (!gmap) return;
  for (const r of rows) {
    const l = r.l; let m = markers[l.key];
    if (!r.pass) { if (m) m.map = null; continue; }
    const far = !!state.dest && !nearSet.has(l.key);
    const content = pinEl(l, far);
    if (!m) {
      m = markers[l.key] = new G.AdvancedMarkerElement({ position: { lat: l.lat, lng: l.lng }, content, title: l.name, gmpClickable: true });
      m.addListener("click", () => { select(l.key, false); openInfo(l); });
    } else m.content = content;
    m.position = { lat: l.lat, lng: l.lng };
    m.zIndex = state.sel === l.key ? 3000 : far ? 1 : 800;
    m.collisionBehavior = far ? G.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY : G.CollisionBehavior.REQUIRED;
    if (m.map !== gmap) m.map = gmap;
  }
}
function drawDest() {
  if (!gmap || !state.dest) return;
  const pos = { lat: state.dest[0], lng: state.dest[1] };
  const dot = document.createElement("div"); dot.className = "dest";
  if (destMarker) destMarker.map = null;
  destMarker = new G.AdvancedMarkerElement({ map: gmap, position: pos, content: dot, title: state.destName, zIndex: 4000 });
  if (destCircle) destCircle.setMap(null);
  destCircle = new G.Circle({ map: gmap, center: pos, radius: 500, strokeColor: "#1c57b8", strokeWeight: 1.5, strokeOpacity: .8, fillColor: "#1c57b8", fillOpacity: .06, clickable: false });
}

/* ---------- Ahuzot lot positions: geocode the official address once and cache it ---------- */
async function refineApproxPositions() {
  if (!G) return;
  const geocoder = new G.Geocoder();
  const todo = LOTS.filter(l => l.approx && l.addr);
  let changed = 0;
  for (const l of todo) {
    const ck = "geo1:" + l.key;
    let hit = null; try { hit = JSON.parse(localStorage.getItem(ck) || "null"); } catch (e) {}
    if (!hit) {
      try {
        const res = await geocoder.geocode({ address: l.addr, region: "il", bounds: { north: 32.14, south: 32.02, west: 34.72, east: 34.86 } });
        const g = res.results[0];
        if (g && !g.partial_match) { const p = g.geometry.location; hit = { lat: p.lat(), lng: p.lng() }; }
        else hit = { skip: 1 };
        try { localStorage.setItem(ck, JSON.stringify(hit)); } catch (e) {}
      } catch (e) { if (String(e).includes("OVER_QUERY_LIMIT")) await new Promise(r => setTimeout(r, 1500)); continue; }
      await new Promise(r => setTimeout(r, 120));
    }
    if (hit && !hit.skip && dist([l.lat, l.lng], [hit.lat, hit.lng]) < 1500) { l.lat = hit.lat; l.lng = hit.lng; l.approx = false; changed++; }
    if (changed && changed % 15 === 0) render();
  }
  if (changed) render();
}

/* ---------- live availability (optional worker) ---------- */
async function pollLive() {
  if (!CFG.LIVE_URL) return;
  try {
    const r = await fetch(CFG.LIVE_URL, { cache: "no-store" }); if (!r.ok) throw 0;
    const d = await r.json();
    for (const l of LOTS) if (l.cpId != null && d.lots && d.lots[l.cpId]) l.liveFree = d.lots[l.cpId].free;
    render();
  } catch (e) { /* keep the snapshot */ }
  setTimeout(pollLive, 120000);
}

/* ---------- view switch ---------- */
const mainEl = $("main");
function setView(v) {
  state.view = v;
  $("vMap").setAttribute("aria-pressed", v === "map"); $("vList").setAttribute("aria-pressed", v === "list");
  $("mapwrap").hidden = v !== "map"; nearEl.hidden = v !== "map"; listEl.hidden = v !== "list";
  mainEl.classList.toggle("mapmode", v === "map"); document.body.classList.toggle("mapmode", v === "map");
  sizeHeader(); render();
}
$("vMap").onclick = () => setView("map");
$("vList").onclick = () => setView("list");

/* ---------- destination ---------- */
const st = $("st");
function setDest(lat, lng, name, approx) {
  state.dest = [lat, lng]; state.destName = name; state.sel = null;
  if (gmap) { drawDest(); gmap.panTo({ lat, lng }); if (gmap.getZoom() < 15) gmap.setZoom(15.5); info?.close(); }
  st.textContent = approx ? "המיקום משוער. אפשר לדייק בהקשה על המפה." : "";
  render();
}
let GAZ = [];
const norm = s => s.replace(/["'׳״\-–,.]/g, "").replace(/\s+/g, " ").trim();
const q = $("q"), sugg = $("sugg");
let hits = [], hi = -1;
function showSugg() {
  const v = norm(q.value); if (v.length < 2) { sugg.hidden = true; return; }
  hits = GAZ.filter(g => norm(g.n).includes(v) || norm(g.sub).includes(v)).slice(0, 7); hi = -1;
  sugg.innerHTML = hits.map((g, i) => `<li role="option" data-i="${i}">${esc(g.n)} <small>${esc(g.sub)}</small></li>`).join(""); sugg.hidden = !hits.length;
}
q.addEventListener("input", showSugg);
q.addEventListener("keydown", e => {
  if (sugg.hidden) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); hi = (hi + (e.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length; [...sugg.children].forEach((li, i) => li.setAttribute("aria-selected", i === hi)); }
  if (e.key === "Escape") sugg.hidden = true;
});
sugg.addEventListener("mousedown", e => { const li = e.target.closest("li"); if (!li) return; e.preventDefault(); pick(hits[+li.dataset.i]); });
function pick(g) { q.value = g.n; sugg.hidden = true; setDest(g.lat, g.lng, g.n, false); }
document.addEventListener("click", e => { if (!e.target.closest(".inbox")) sugg.hidden = true; });
$("f").addEventListener("submit", async e => {
  e.preventDefault();
  if (!sugg.hidden && hi >= 0) { pick(hits[hi]); return; }
  const v = q.value.trim(); if (!v) return; sugg.hidden = true;
  const exact = GAZ.find(g => norm(g.n) === norm(v)) || (hits.length === 1 ? hits[0] : null);
  if (exact) { pick(exact); return; }
  if (!G) { st.textContent = "לא מצאתי את הכתובת ברשימה. בלי מפתח Google אפשר לבחור רק מהרשימה."; return; }
  st.textContent = "מאתר את הכתובת…";
  try {
    const res = await new G.Geocoder().geocode({ address: /תל.?אביב|יפו/.test(v) ? v : v + ", תל אביב-יפו", region: "il", bounds: { north: 32.14, south: 32.02, west: 34.72, east: 34.86 } });
    const g = res.results[0];
    if (!g) throw 0;
    const p = g.geometry.location;
    setDest(p.lat(), p.lng(), g.formatted_address.replace(/, ישראל$/, ""), !!g.partial_match);
  } catch (err) { st.textContent = "לא מצאתי את הכתובת. נסו ניסוח אחר או הקישו על המפה."; }
});

/* ---------- controls ---------- */
document.querySelectorAll("[data-op]").forEach(b => { const op = b.dataset.op; b.setAttribute("aria-pressed", state.ops[op]);
  b.onclick = () => { state.ops[op] = !state.ops[op]; b.setAttribute("aria-pressed", state.ops[op]); save(); render(); }; });
const sortEl = $("sort"); sortEl.value = state.sort; sortEl.onchange = () => { state.sort = sortEl.value; save(); render(); };
const mh = $("maxHour"), mhO = $("maxHourO"), md = $("maxDist"), mdO = $("maxDistO");
mh.value = state.maxHour; const mhT = () => mhO.textContent = state.maxHour >= 40 ? "ללא הגבלה" : "₪" + state.maxHour; mhT();
mh.oninput = () => { state.maxHour = +mh.value; mhT(); save(); render(); };
const mdT = () => mdO.textContent = state.maxDist >= 5000 ? "ללא הגבלה" : fmtD(state.maxDist); mdT();
md.oninput = () => { state.maxDist = +md.value; mdT(); render(); };
$("nameF").oninput = e => { state.text = e.target.value; render(); };
for (const [id, k] of [["appF", "app"], ["resF", "resident"], ["eveF", "eveOnly"], ["evF", "evOnly"], ["openF", "openOnly"]]) {
  const el = $(id); el.checked = !!state[k]; el.onchange = () => { state[k] = el.checked; save(); render(); };
}
function sizeHeader() { document.documentElement.style.setProperty("--hh", document.querySelector("header").offsetHeight + "px"); }
addEventListener("resize", sizeHeader); $("more").addEventListener("toggle", sizeHeader);

/* ---------- boot ---------- */
(async function boot() {
  sizeHeader();
  const data = await (await fetch("data/lots.json")).json();
  LOTS = data.lots; LANDMARKS = data.landmarks;
  DATA_UPDATED = new Date(data.updated).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  GAZ = [...LANDMARKS.map(([n, a, b]) => ({ n, sub: "מקום", lat: a, lng: b })), ...LOTS.filter(l => l.addr).map(l => ({ n: l.addr.replace(/, תל אביב.*$|\s*תל אביב.*$/, ""), sub: l.name, lat: l.lat, lng: l.lng }))];
  q.value = "אבן גבירול 30"; state.dest = [32.0752, 34.7815]; state.destName = "אבן גבירול 30";
  render();
  try {
    await loadGoogle();
    createMap();
    refineApproxPositions();
  } catch (e) {
    $("mapwrap").insertAdjacentHTML("beforeend", `<div class="mapnote">${e.message === "no-key" ? "כדי להציג את מפת Google צריך להוסיף מפתח API בקובץ config.js (הוראות ב-README).<br>הרשימה למטה עובדת גם בלי מפה." : "מפת Google לא נטענה. בדקו את מפתח ה-API ואת ההגבלות שלו."}</div>`);
  }
  pollLive();
})();
