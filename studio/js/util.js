// DOM + number helpers. All text goes in through textContent, never innerHTML
// (comment bodies come from strangers on the internet).

export function h(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

export function svg(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export const DASH = "—";
const nf = new Intl.NumberFormat("en-US");

export function n(v, digits = 0) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return DASH;
  return Number(v).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
export const int = (v) => (v === null || v === undefined ? DASH : nf.format(Math.round(Number(v))));
export const pct = (v) => (v === null || v === undefined ? DASH : `${n(v, 1)}%`);
export const secs = (v) => (v === null || v === undefined ? DASH : `${n(v, 1)} s`);
export function signed(v) {
  if (v === null || v === undefined) return DASH;
  const x = Number(v);
  return x > 0 ? `+${nf.format(x)}` : nf.format(x);
}
export function compact(v) {
  if (v === null || v === undefined) return DASH;
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Number(v));
}

export function when(iso) {
  if (!iso) return DASH;
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export function ago(iso) {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 48 ? `${hrs} h ago` : `${Math.round(hrs / 24)} days ago`;
}

export function sum(rows, key) {
  let total = 0, seen = false;
  for (const r of rows) {
    if (r[key] !== null && r[key] !== undefined) { total += Number(r[key]); seen = true; }
  }
  return seen ? total : null;
}

export function replace(node, ...kids) {
  node.replaceChildren(...kids.flat().filter(Boolean));
}
