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

function renderRows(rows) {
  if (rows.length === 0) {
    return `<div class="empty card">لا توجد مشاركات حتى الآن.</div>`;
  }

  return `
    <div class="leaderboard-list">
      ${rows.map((row, index) => {
    const name = normalizeUserName(row.user.name);
    const avatar = getUserAvatar(row.user);
    const stats = row.stats;

    return `
        <article class="leaderboard-row">
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

export async function initLeaderboardPage() {
  const box = document.getElementById("leaderboardBoard");
  if (!box) return;

  box.innerHTML = `<div class="empty card">جاري تحميل لوحة الترتيب...</div>`;

  try {
    const data = await getData();
    const users = await fetchParticipantUsers();
    const rows = buildLeaderboardRows(data, users);

    box.innerHTML = `
      ${renderSummary(rows)}
      ${renderRows(rows)}
    `;
  } catch (e) {
    box.innerHTML = `<div class="empty card">تعذر تحميل لوحة الترتيب الآن.</div>`;
    showPop("تعذر تحميل لوحة الترتيب", "error");
  }
}
