import { getData } from "./challengeMeta.js";
import { fetchParticipantUsers } from "./leaderboard.js";
import { state } from "./state.js";
import {
  buildCompetitionRows,
  buildXpProfile,
  getCurrentRank,
  syncInboxMessages
} from "./gamification.js";
import { escapeHtml, formatDateTime } from "./utils.js";
import { showPop } from "./ui.js";

function typeLabel(type) {
  return {
    celebration: "إنجاز",
    reward: "مكافأة",
    warning: "تنبيه",
    info: "رسالة"
  }[type] || "رسالة";
}

function renderInbox(messages) {
  if (messages.length === 0) {
    return `
      <div class="empty-state card">
        <strong>لا توجد رسائل بعد</strong>
        <span>ستظهر هنا المكافآت، التنبيهات، ورسائل المنافسة تلقائيًا.</span>
      </div>
    `;
  }

  return `
    <div class="message-list">
      ${messages.map(item => `
        <article class="message-item is-${escapeHtml(item.type)}">
          <div>
            <span>${escapeHtml(typeLabel(item.type))}</span>
            <h2>${escapeHtml(item.title)}</h2>
            <p>${escapeHtml(item.body)}</p>
          </div>
          <time>${escapeHtml(formatDateTime(item.createdAt))}</time>
        </article>
      `).join("")}
    </div>
  `;
}

export async function initMessagesPage() {
  const box = document.getElementById("messagesBoard");
  if (!box) return;

  box.innerHTML = `<div class="empty-state card">جاري تحميل الرسائل...</div>`;

  try {
    const data = await getData();
    const users = await fetchParticipantUsers();
    state.cachedParticipants = users;

    const messages = syncInboxMessages(data, users);
    const xp = buildXpProfile(data);
    const rows = buildCompetitionRows(data, users);
    const rank = getCurrentRank(rows);

    box.innerHTML = `
      <section class="inbox-summary">
        <article>
          <span>الرسائل</span>
          <strong>${messages.length}</strong>
        </article>
        <article>
          <span>المستوى</span>
          <strong>${escapeHtml(xp.level.icon)} ${escapeHtml(xp.level.title)}</strong>
        </article>
        <article>
          <span>XP</span>
          <strong>${xp.xp}</strong>
        </article>
        <article>
          <span>الترتيب</span>
          <strong>${rank ? `المركز ${rank}` : "غير ظاهر"}</strong>
        </article>
      </section>
      ${renderInbox(messages)}
    `;
  } catch (e) {
    box.innerHTML = `<div class="empty-state card">تعذر تحميل الرسائل الآن.</div>`;
    showPop("تعذر تحميل الرسائل", "error");
  }
}
