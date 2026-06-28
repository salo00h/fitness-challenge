import { getData } from "./challengeMeta.js";
import { fetchParticipantUsers } from "./leaderboard.js";
import { state } from "./state.js";
import {
  buildCompetitionRows,
  buildXpProfile,
  getCurrentRank,
  getSideChallenge,
  pushUserNotification,
  renderInboxBadge
} from "./gamification.js";
import { escapeHtml } from "./utils.js";
import { showPop } from "./ui.js";

function achievement(id, icon, title, description, unlocked, progress, target) {
  return {
    id,
    icon,
    title,
    description,
    unlocked: !!unlocked,
    progress: Math.min(Number(progress) || 0, Number(target) || 1),
    target: Number(target) || 1
  };
}

export function buildAchievements(data, users = state.cachedParticipants || []) {
  const profile = buildXpProfile(data);
  const stats = profile.stats;
  const rows = buildCompetitionRows(data, users);
  const rank = getCurrentRank(rows);
  const side = getSideChallenge(data, state.currentDone || {});

  return [
    achievement("first-workout", "🏅", "أول تمرين", "أول خطوة في التحدي.", stats.completed >= 1, stats.completed, 1),
    achievement("streak-7", "🔥", "7 أيام متتالية", "حافظي على سلسلة أسبوع كامل.", stats.streak >= 7, stats.streak, 7),
    achievement("first-week", "🏆", "أول أسبوع مكتمل", "إكمال أسبوع كامل من البرنامج.", stats.completedWeeks >= 1, stats.completedWeeks, 1),
    achievement("before-8", "⚡", "انضباط قبل 8", "إنهاء مهمة اليوم قبل الساعة 8 مساءً.", side.status === "achieved", side.status === "achieved" ? 1 : 0, 1),
    achievement("xp-1000", "💎", "1000 XP", "جمع 1000 نقطة خبرة.", profile.xp >= 1000, profile.xp, 1000),
    achievement("rank-one", "👑", "المركز الأول", "الوصول إلى المركز الأول في الترتيب.", rank === 1, rank === 1 ? 1 : 0, 1),
    achievement("minutes-100", "⏱", "100 دقيقة", "تجميع 100 دقيقة تمرين.", stats.minutes >= 100, stats.minutes, 100),
    achievement("half-way", "🌸", "نصف الطريق", "الوصول إلى 50% إنجاز.", stats.percent >= 50, stats.percent, 50),
    achievement("commitment-90", "🎯", "التزام 90%", "الحفاظ على التزام 90% أو أكثر.", stats.commitment >= 90 && stats.completed > 0, stats.commitment, 90),
    achievement("two-weeks", "⭐", "أسبوعان مكتملان", "إكمال أسبوعين كاملين.", stats.completedWeeks >= 2, stats.completedWeeks, 2)
  ];
}

async function notifyUnlockedAchievements(achievements) {
  const unlocked = achievements.filter(item => item.unlocked);

  for (const item of unlocked) {
    await pushUserNotification({
      id: `achievement-${item.id}`,
      type: "celebration",
      title: "وسام جديد",
      body: `${item.icon} ${item.title}`,
      priority: 9,
      createdAt: new Date().toISOString()
    });
  }

  await renderInboxBadge();
}

function renderAchievements(items) {
  const unlockedCount = items.filter(item => item.unlocked).length;
  const percent = items.length ? Math.round((unlockedCount / items.length) * 100) : 0;

  return `
    <section class="achievement-summary">
      <article>
        <span>الأوسمة المفتوحة</span>
        <strong>${unlockedCount} / ${items.length}</strong>
      </article>
      <article>
        <span>نسبة الأوسمة</span>
        <strong>${percent}%</strong>
      </article>
    </section>

    <section class="achievement-grid-full">
      ${items.map(item => {
    const itemPercent = item.target ? Math.min(100, Math.round((item.progress / item.target) * 100)) : 0;
    return `
        <article class="achievement-tile ${item.unlocked ? "is-unlocked" : ""}">
          <span>${item.icon}</span>
          <div>
            <small>${item.unlocked ? "مفتوح" : "قيد التقدم"}</small>
            <h2>${escapeHtml(item.title)}</h2>
            <p>${escapeHtml(item.description)}</p>
          </div>
          <div class="achievement-progress">
            <i style="width:${itemPercent}%"></i>
          </div>
          <em>${item.progress} / ${item.target}</em>
        </article>
      `;
  }).join("")}
    </section>
  `;
}

export async function initAchievementsPage() {
  const box = document.getElementById("achievementsBoard");
  if (!box) return;

  box.innerHTML = `<div class="empty-state card">جاري تحميل الأوسمة...</div>`;

  try {
    const data = await getData();
    const users = await fetchParticipantUsers();
    state.cachedParticipants = users;
    const items = buildAchievements(data, users);

    await notifyUnlockedAchievements(items);
    box.innerHTML = renderAchievements(items);
  } catch (e) {
    box.innerHTML = `<div class="empty-state card">تعذر تحميل الأوسمة الآن.</div>`;
    showPop("تعذر تحميل الأوسمة", "error");
  }
}
