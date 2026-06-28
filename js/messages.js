import { getData } from "./challengeMeta.js";
import { fetchParticipantUsers } from "./leaderboard.js";
import { state } from "./state.js";
import {
  archiveNotification,
  buildCompetitionRows,
  buildXpProfile,
  deleteNotification,
  getBrowserNotificationPermission,
  getCurrentRank,
  markNotificationRead,
  requestBrowserNotifications,
  renderInboxBadge,
  syncFirebaseInboxMessages
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
        <article class="message-item is-${escapeHtml(item.type)} ${item.read ? "" : "is-new"}">
          <div>
            <span>${escapeHtml(typeLabel(item.type))}${item.read ? "" : " · جديد"}</span>
            <h2>${escapeHtml(item.title)}</h2>
            <p>${escapeHtml(item.body)}</p>
          </div>
          <div class="message-actions">
            <time>${escapeHtml(formatDateTime(item.createdAt))}</time>
            ${item.read ? "" : `<button type="button" data-action="read" data-doc="${escapeHtml(item.docId)}">تمت القراءة</button>`}
            <button type="button" data-action="archive" data-doc="${escapeHtml(item.docId)}">أرشفة</button>
            <button type="button" data-action="delete" data-doc="${escapeHtml(item.docId)}" class="danger-mini">حذف</button>
          </div>
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

    const messages = await syncFirebaseInboxMessages(data, users);
    const xp = buildXpProfile(data);
    const rows = buildCompetitionRows(data, users);
    const rank = getCurrentRank(rows);
    const unread = messages.filter(item => !item.read).length;
    const notificationPermission = getBrowserNotificationPermission();

    box.innerHTML = `
      <section class="inbox-summary">
        <article>
          <span>الرسائل</span>
          <strong>${messages.length}</strong>
        </article>
        <article>
          <span>غير المقروء</span>
          <strong>${unread}</strong>
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
      <section class="inbox-tools">
        <button type="button" id="enableBrowserNotifications" ${notificationPermission === "granted" ? "disabled" : ""}>
          ${notificationPermission === "granted" ? "إشعارات المتصفح مفعلة" : "🔔 السماح بالإشعارات"}
        </button>
      </section>
      ${renderInbox(messages)}
    `;

    document.getElementById("enableBrowserNotifications")?.addEventListener("click", async () => {
      await requestBrowserNotifications();
      await initMessagesPage();
    });

    box.querySelectorAll("[data-action]").forEach(button => {
      button.addEventListener("click", async () => {
        const action = button.dataset.action;
        const docId = button.dataset.doc;

        try {
          if (action === "read") await markNotificationRead(docId);
          if (action === "archive") await archiveNotification(docId);
          if (action === "delete") await deleteNotification(docId);
          await renderInboxBadge();
          await initMessagesPage();
        } catch (err) {
          showPop("تعذر تحديث الرسالة", "error");
        }
      });
    });
  } catch (e) {
    box.innerHTML = `<div class="empty-state card">تعذر تحميل الرسائل الآن.</div>`;
    showPop("تعذر تحميل الرسائل", "error");
  }
}
