import { DAY_MS } from "./constants.js";
import { getData } from "./challengeMeta.js";
import { getExpectedDate } from "./commitment.js";
import { fetchParticipantUsers } from "./leaderboard.js";
import { calcUserStats, compareParticipantRank } from "./participants.js";
import { getUserAvatar, showPop } from "./ui.js";
import {
  escapeHtml,
  getCompletedAt,
  isDone,
  normalizeUserName,
  weekName
} from "./utils.js";

function groupBy(items, keyFn) {
  return items.reduce((groups, item) => {
    const key = keyFn(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
}

function countCompletedChallenges(data, done) {
  const groups = groupBy(data, item => Number(item.challenge || 1));
  return Object.values(groups).filter(items =>
    items.length > 0 && items.every(item => isDone(done[item.id]))
  ).length;
}

function getFastestWeek(data, done) {
  const groups = groupBy(data, item => `${Number(item.challenge || 1)}-${Number(item.week || 1)}`);
  const completed = Object.values(groups)
    .map(items => {
      if (!items.length || !items.every(item => isDone(done[item.id]))) return null;

      const dates = items.map(item => getCompletedAt(done[item.id])).filter(Boolean);
      if (dates.length !== items.length) return null;

      const expectedDates = items.map(getExpectedDate).filter(Boolean);
      const start = expectedDates.length ? new Date(Math.min(...expectedDates.map(date => date.getTime()))) : dates[0];
      const end = new Date(Math.max(...dates.map(date => date.getTime())));
      const elapsedDays = Math.max(1, Math.ceil((end - start) / DAY_MS) + 1);
      const sample = items[0];

      return {
        elapsedDays,
        label: `${weekName(sample.week)} - التحدي ${Number(sample.challenge || 1)}`
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.elapsedDays - b.elapsedDays);

  return completed[0] || null;
}

function buildRows(data, users) {
  return users
    .filter(user => normalizeUserName(user.name))
    .map(user => {
      const done = user.done || {};
      return {
        user,
        stats: calcUserStats(data, done),
        completedChallenges: countCompletedChallenges(data, done),
        fastestWeek: getFastestWeek(data, done)
      };
    });
}

function pickMax(rows, metric) {
  return rows.slice().sort((a, b) =>
    Number(b[metric] ?? b.stats[metric] ?? 0) - Number(a[metric] ?? a.stats[metric] ?? 0) ||
    compareParticipantRank(a, b)
  )[0];
}

function pickFastest(rows) {
  return rows
    .filter(row => row.fastestWeek)
    .sort((a, b) =>
      a.fastestWeek.elapsedDays - b.fastestWeek.elapsedDays ||
      compareParticipantRank(a, b)
    )[0];
}

function renderWinnerCard(item) {
  const winner = item.winner;
  const name = winner ? normalizeUserName(winner.user.name) : "لا يوجد";
  const avatar = winner ? getUserAvatar(winner.user) : "⭐";

  return `
    <article class="fame-card">
      <span class="fame-icon">${item.icon}</span>
      <div class="fame-person">
        <span>${escapeHtml(avatar)}</span>
        <div>
          <small>${escapeHtml(item.label)}</small>
          <strong>${escapeHtml(name)}</strong>
          <em>${escapeHtml(item.value(winner))}</em>
        </div>
      </div>
    </article>
  `;
}

function renderTopRows(rows) {
  const ranked = rows.slice().sort(compareParticipantRank);

  return `
    <section class="fame-ranking">
      <div class="section-title">
        <h2>ترتيب الشرف</h2>
        <span>حسب الالتزام والإنجاز</span>
      </div>
      <div class="fame-list">
        ${ranked.map((row, index) => `
          <article>
            <strong>${index + 1}</strong>
            <span>${escapeHtml(getUserAvatar(row.user))}</span>
            <div>
              <b>${escapeHtml(normalizeUserName(row.user.name))}</b>
              <small>${row.stats.commitment}% التزام · ${row.stats.percent}% إنجاز · Streak ${row.stats.streak}</small>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

export async function initHallOfFamePage() {
  const box = document.getElementById("hallPageBoard");
  if (!box) return;

  box.innerHTML = `<div class="empty-state card">جاري تحميل Hall of Fame...</div>`;

  try {
    const data = await getData();
    const users = await fetchParticipantUsers();
    const rows = buildRows(data, users);

    if (rows.length === 0) {
      box.innerHTML = `<div class="empty-state card">لا توجد مشاركات بعد.</div>`;
      return;
    }

    const fastest = pickFastest(rows);
    const winners = [
      {
        label: "ملكة الالتزام",
        icon: "👑",
        winner: pickMax(rows, "commitment"),
        value: row => row ? `${row.stats.commitment}% التزام` : "0%"
      },
      {
        label: "أطول سلسلة",
        icon: "🔥",
        winner: pickMax(rows, "streak"),
        value: row => row ? `${row.stats.streak} أيام` : "0"
      },
      {
        label: "أكثر دقائق",
        icon: "⏱",
        winner: pickMax(rows, "minutes"),
        value: row => row ? `${row.stats.minutes} دقيقة` : "0"
      },
      {
        label: "أكثر تحديات مكتملة",
        icon: "🏆",
        winner: pickMax(rows, "completedChallenges"),
        value: row => row ? `${row.completedChallenges} تحدي` : "0"
      },
      {
        label: "أسرع إنجاز أسبوع",
        icon: "⚡",
        winner: fastest,
        value: row => row ? `${row.fastestWeek.elapsedDays} أيام · ${row.fastestWeek.label}` : "لا يوجد"
      },
      {
        label: "أعلى إنجاز",
        icon: "⭐",
        winner: pickMax(rows, "percent"),
        value: row => row ? `${row.stats.percent}% إنجاز` : "0%"
      }
    ];

    box.innerHTML = `
      <section class="fame-grid">
        ${winners.map(renderWinnerCard).join("")}
      </section>
      ${renderTopRows(rows)}
    `;
  } catch (e) {
    box.innerHTML = `<div class="empty-state card">تعذر تحميل Hall of Fame الآن.</div>`;
    showPop("تعذر تحميل Hall of Fame", "error");
  }
}
