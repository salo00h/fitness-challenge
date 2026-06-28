import { collection, db, getDocs } from "./firebase.js";
import { USERS_COLLECTION } from "./constants.js";
import { getData } from "./challengeMeta.js";
import { calcUserStats } from "./participants.js";
import { escapeHtml, normalizeUserName } from "./utils.js";
import { getUserAvatar, showPop } from "./ui.js";

export async function fetchParticipantUsers() {
  const snap = await getDocs(collection(db, USERS_COLLECTION));
  return snap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(user => normalizeUserName(user.name));
}

export function sortLeaderboardRows(rows) {
  return rows.slice().sort((a, b) =>
    b.stats.commitment - a.stats.commitment ||
    b.stats.percent - a.stats.percent ||
    b.stats.streak - a.stats.streak ||
    b.stats.minutes - a.stats.minutes ||
    normalizeUserName(a.user.name).localeCompare(normalizeUserName(b.user.name), "ar")
  );
}

export function buildLeaderboardRows(data, users) {
  return sortLeaderboardRows(users.map(user => ({
    user,
    stats: calcUserStats(data, user.done || {})
  })));
}

function rankLabel(index) {
  if (index === 0) return "المركز الأول";
  if (index === 1) return "المركز الثاني";
  if (index === 2) return "المركز الثالث";
  return `المركز ${index + 1}`;
}

function rankTone(index) {
  if (index === 0) return "is-gold";
  if (index === 1) return "is-silver";
  if (index === 2) return "is-bronze";
  return "";
}

function renderSummary(rows) {
  const participants = rows.length;
  const avgCommitment = participants
    ? Math.round(rows.reduce((sum, row) => sum + row.stats.commitment, 0) / participants)
    : 0;
  const avgCompletion = participants
    ? Math.round(rows.reduce((sum, row) => sum + row.stats.percent, 0) / participants)
    : 0;
  const minutes = rows.reduce((sum, row) => sum + row.stats.minutes, 0);

  return `
    <section class="leaderboard-summary">
      <div><span>المشاركات</span><strong>${participants}</strong></div>
      <div><span>متوسط الالتزام</span><strong>${avgCommitment}%</strong></div>
      <div><span>متوسط الإنجاز</span><strong>${avgCompletion}%</strong></div>
      <div><span>إجمالي الدقائق</span><strong>${minutes}</strong></div>
    </section>
  `;
}

function renderLeaderboardShowcase(rows) {
  if (rows.length === 0) return "";

  const topCommitment = rows[0];
  const topStreak = rows.slice().sort((a, b) => b.stats.streak - a.stats.streak)[0];
  const topMinutes = rows.slice().sort((a, b) => b.stats.minutes - a.stats.minutes)[0];

  return `
    <section class="leaderboard-showcase showcase-rail">
      <article class="showcase-card is-primary">
        <span>نجمة الالتزام</span>
        <strong>${escapeHtml(normalizeUserName(topCommitment.user.name))}</strong>
        <small>${topCommitment.stats.commitment}% التزام</small>
      </article>
      <article class="showcase-card">
        <span>أطول سلسلة</span>
        <strong>${escapeHtml(normalizeUserName(topStreak.user.name))}</strong>
        <small>${topStreak.stats.streak} أيام متتالية</small>
      </article>
      <article class="showcase-card">
        <span>أكثر دقائق</span>
        <strong>${escapeHtml(normalizeUserName(topMinutes.user.name))}</strong>
        <small>${topMinutes.stats.minutes} دقيقة</small>
      </article>
    </section>
  `;
}

function renderPodium(rows) {
  if (rows.length === 0) return "";

  return `
    <div class="leaderboard-podium">
      ${rows.map((row, index) => {
    const name = normalizeUserName(row.user.name);
    const avatar = getUserAvatar(row.user);
    const stats = row.stats;

    return `
        <article class="podium-card ${rankTone(index)}">
          <div class="podium-rank">${rankLabel(index)}</div>
          <span class="podium-avatar">${escapeHtml(avatar)}</span>
          <strong>${escapeHtml(name)}</strong>
          <small>${escapeHtml(stats.title)}</small>
          <div class="podium-score">${stats.commitment}% التزام</div>
          <div class="podium-meta">
            <span>إنجاز ${stats.percent}%</span>
            <span>Streak ${stats.streak}</span>
            <span>${stats.minutes} دقيقة</span>
            <span>${stats.completedWeeks} أسابيع</span>
          </div>
        </article>
      `;
  }).join("")}
    </div>
  `;
}

function renderRows(rows, startIndex = 0) {
  if (rows.length === 0) return "";

  return `
    <div class="leaderboard-list">
      ${rows.map((row, offset) => {
    const index = startIndex + offset;
    const name = normalizeUserName(row.user.name);
    const avatar = getUserAvatar(row.user);
    const stats = row.stats;

    return `
        <article class="leaderboard-row ${rankTone(index)}">
          <div class="leaderboard-rank">${rankLabel(index)}</div>
          <div class="leaderboard-person">
            <span class="leaderboard-avatar">${escapeHtml(avatar)}</span>
            <div>
              <strong>${escapeHtml(name)}</strong>
              <small>${escapeHtml(stats.title)}</small>
            </div>
          </div>
          <div class="leaderboard-meter" style="--value:${stats.percent}%">
            <span>الإنجاز</span>
            <strong>${stats.percent}%</strong>
            <i></i>
          </div>
          <div class="leaderboard-stat"><span>الالتزام</span><strong>${stats.commitment}%</strong></div>
          <div class="leaderboard-stat"><span>Streak</span><strong>${stats.streak}</strong></div>
          <div class="leaderboard-stat"><span>الدقائق</span><strong>${stats.minutes}</strong></div>
          <div class="leaderboard-stat"><span>الأسابيع</span><strong>${stats.completedWeeks}</strong></div>
        </article>
      `;
  }).join("")}
    </div>
  `;
}

function renderLeaderboard(rows) {
  if (rows.length === 0) {
    return `<div class="empty card">لا توجد مشاركات حتى الآن.</div>`;
  }

  return `
    ${renderPodium(rows.slice(0, 3))}
    ${renderRows(rows.slice(3), 3)}
  `;
}

export async function initLeaderboardPage() {
  const box = document.getElementById("leaderboardBoard");
  if (!box) return;

  box.innerHTML = `<div class="empty card">جاري تحميل لوحة الترتيب...</div>`;

  try {
    const data = await getData();
    const users = await fetchParticipantUsers();
    const rows = buildLeaderboardRows(data, users);

    box.innerHTML = `
      ${renderLeaderboardShowcase(rows)}
      ${renderSummary(rows)}
      ${renderLeaderboard(rows)}
    `;
  } catch (e) {
    box.innerHTML = `<div class="empty card">تعذر تحميل لوحة الترتيب الآن.</div>`;
    showPop("تعذر تحميل لوحة الترتيب", "error");
  }
}
