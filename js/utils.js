import { DAY_MS } from "./constants.js";

export function normalizeUserName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 40);
}

export function userDocId(name) {
  return encodeURIComponent(normalizeUserName(name).toLowerCase());
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function formatDateTime(value) {
  if (!value) return "لم تسجل بعد";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "غير معروف";
  return `${date.toLocaleDateString("ar")} ${date.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}`;
}

export function escapeHtml(text) {
  return String(text || "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

export function isDone(record) {
  return record === true || !!(record && record.completed === true);
}

export function getCompletedAt(record) {
  if (!record || record === true) return null;
  const date = new Date(record.completedAt || "");
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeDateInput(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
  if (match) {
    const [, year, month, day] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (
      date.getFullYear() === Number(year) &&
      date.getMonth() === Number(month) - 1 &&
      date.getDate() === Number(day)
    ) {
      return `${year}-${month}-${day}`;
    }
    return "";
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(value) {
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function startOfLocalDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfDay(date) {
  return startOfLocalDay(date);
}

export function formatLocalDate(date) {
  const local = startOfLocalDay(date);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toArabicOrdinal(n) {
  const names = {
    1: "الأول", 2: "الثاني", 3: "الثالث", 4: "الرابع",
    5: "الخامس", 6: "السادس", 7: "السابع", 8: "الثامن",
    9: "التاسع", 10: "العاشر"
  };
  return names[Number(n)] || n;
}

export function weekName(n) {
  return `الأسبوع ${toArabicOrdinal(n)}`;
}

export function dayName(n) {
  return `اليوم ${toArabicOrdinal(n)}`;
}

export function itemWeek(item) {
  return Number(item.week);
}

export function itemProgramDay(item) {
  return Number(item.programDay);
}

export function getProgramAbsoluteDay(item) {
  const week = itemWeek(item);
  const programDay = itemProgramDay(item);
  if (!Number.isFinite(week) || !Number.isFinite(programDay)) return 0;
  return ((week - 1) * 7) + programDay;
}

export function getYoutubeId(url) {
  if (!url) return "";
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?&]+)/,
    /youtube\.com\/shorts\/([^?&]+)/,
    /youtube\.com\/embed\/([^?&]+)/
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m && m[1]) return m[1];
  }
  return "";
}

export function placeholder() {
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' width='600' height='400'>
      <rect width='100%' height='100%' fill='#ffe2ec'/>
      <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
        font-family='Arial' font-size='32' fill='#ff0b5f'>رابط يوتيوب</text>
    </svg>
  `);
}

export function getYoutubeThumb(url) {
  const id = getYoutubeId(url);
  if (!id) return placeholder();
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

export function getProgressTitle(percent) {
  const value = Number(percent) || 0;
  if (value >= 100) return "بطلة التحدي 🏆";
  if (value >= 75) return "مقاتلة 🔥";
  if (value >= 50) return "قوية 💪";
  if (value >= 25) return "مجتهدة 🌸";
  return "مبتدئة 🌱";
}

export function daysBetween(a, b) {
  return Math.floor((startOfDay(a) - startOfDay(b)) / DAY_MS);
}
