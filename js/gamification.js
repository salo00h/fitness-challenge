import { state } from "./state.js";
import { challengeName, challengeNumber } from "./challengeMeta.js";
import {
  getMissionItemsForChallenge,
  getTodayAbsoluteDay,
  isFutureProgramDayItems
} from "./commitment.js";
import { calcUserStats } from "./participants.js";
import {
  escapeHtml,
  formatLocalDate,
  getCompletedAt,
  isDone,
  normalizeUserName,
  userDocId,
  weekName
} from "./utils.js";
import {
  getStoredTheme,
  getThemeOptions,
  isSoundMuted,
  playSuccessSound,
  selectTheme,
  showMomentPop,
  showPop,
  strongConfetti,
  toggleSoundMuted
} from "./ui.js";

const INBOX_KEY = "fitness_inbox_v1";
const REWARD_KEY = "fitness_daily_reward_v1";
const RANK_KEY = "fitness_rank_snapshot_v1";
const MOMENT_KEY = "fitness_daily_moment_seen_v1";
const SIDE_CHALLENGE_HOUR = 20;

export const XP_LEVELS = [
  { level: 1, icon: "🌱", title: "المستوى 1", min: 0, next: 100 },
  { level: 2, icon: "🌸", title: "المستوى 2", min: 100, next: 300 },
  { level: 3, icon: "💪", title: "المستوى 3", min: 300, next: 700 },
  { level: 4, icon: "🔥", title: "المستوى 4", min: 700, next: 1500 },
  { level: 5, icon: "👑", title: "المستوى 5", min: 1500, next: null }
];

const DAILY_REWARDS = [
  { title: "مكافأة الالتزام", body: "+10 XP لأنك حضرتِ اليوم.", xp: 10, icon: "🎁" },
  { title: "رسالة اليوم", body: "كل خطوة صغيرة تقربك من هدفك.", xp: 12, icon: "🌸" },
  { title: "دفعة تركيز", body: "+15 XP للبدء بطاقة أعلى.", xp: 15, icon: "⚡" },
  { title: "مكافأة الصدارة", body: "+20 XP لمن تحافظ على الإيقاع.", xp: 20, icon: "🏆" }
];

function currentUserKey() {
  return userDocId(state.currentUser || "guest");
}

function todayKey(date = new Date()) {
  return formatLocalDate(date);
}

function storageKey(base) {
  return `${base}_${currentUserKey()}`;
}

function parseStoredList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (e) {
    return [];
  }
}

function saveStoredList(key, list) {
  localStorage.setItem(key, JSON.stringify(list.slice(0, 80)));
}

function message(id, type, title, body, priority = 5) {
  return {
    id,
    type,
    title,
    body,
    priority,
    createdAt: new Date().toISOString(),
    day: todayKey()
  };
}

function challengeList(data) {
  return [...new Set(data.map(challengeNumber))]
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

function sortRows(rows) {
  return rows.slice().sort((a, b) =>
    b.stats.commitment - a.stats.commitment ||
    b.stats.percent - a.stats.percent ||
    b.stats.streak - a.stats.streak ||
    b.stats.minutes - a.stats.minutes ||
    normalizeUserName(a.user.name).localeCompare(normalizeUserName(b.user.name), "ar")
  );
}

export function buildCompetitionRows(data, users = state.cachedParticipants || []) {
  return sortRows(
    users
      .filter(user => normalizeUserName(user.name))
      .map(user => ({
        user,
        stats: calcUserStats(data, user.done || {})
      }))
  );
}

export function getCurrentRank(rows) {
  const index = rows.findIndex(row =>
    normalizeUserName(row.user.name).toLowerCase() === normalizeUserName(state.currentUser).toLowerCase()
  );

  return index >= 0 ? index + 1 : null;
}

export function getDailyReward() {
  const seed = todayKey().replace(/\D/g, "").split("").reduce((sum, item) => sum + Number(item || 0), 0);
  const index = seed % DAILY_REWARDS.length;
  const reward = DAILY_REWARDS[index];
  const claimed = localStorage.getItem(storageKey(REWARD_KEY)) === todayKey();

  return { ...reward, claimed };
}

export function claimDailyReward(data = state.cachedData, users = state.cachedParticipants || []) {
  const reward = getDailyReward();
  if (reward.claimed) {
    showPop("تم أخذ مكافأة اليوم بالفعل", "info");
    return;
  }

  localStorage.setItem(storageKey(REWARD_KEY), todayKey());
  playSuccessSound();
  showMomentPop("مكافأة اليوم", `${reward.body} +${reward.xp} XP`);
  syncInboxMessages(data, users);
  renderGamificationHub(data, users);
}

export function getSideChallenge(data = state.cachedData, done = state.currentDone || {}) {
  const items = [];
  let locked = false;

  challengeList(data).forEach(challenge => {
    if (getTodayAbsoluteDay(challenge) < 1) return;
    const missionItems = getMissionItemsForChallenge(data, challenge, done);
    if (missionItems.length === 0) return;
    if (isFutureProgramDayItems(missionItems)) locked = true;
    else items.push(...missionItems);
  });

  const workouts = items.filter(item => item.type !== "rest");
  const completed = workouts.filter(item => isDone(done[item.id]));
  const complete = workouts.length > 0 && completed.length === workouts.length;
  const achieved = complete && workouts.every(item => {
    const completedAt = getCompletedAt(done[item.id]);
    return completedAt && completedAt.getHours() < SIDE_CHALLENGE_HOUR;
  });
  const missed = complete && !achieved;

  if (locked) {
    return {
      status: "locked",
      title: "مهمة خاصة اليوم",
      body: "تفتح عند موعد تمرين اليوم.",
      xp: 20
    };
  }

  if (workouts.length === 0) {
    return {
      status: "rest",
      title: "مهمة خاصة اليوم",
      body: "اليوم راحة. خذي الاستشفاء بجدية.",
      xp: 10
    };
  }

  return {
    status: achieved ? "achieved" : missed ? "missed" : "active",
    title: "مهمة خاصة اليوم",
    body: `أنهي تمرين اليوم قبل الساعة ${SIDE_CHALLENGE_HOUR}:00`,
    xp: 20,
    completed: completed.length,
    total: workouts.length
  };
}

export function getLevelInfo(xp) {
  const level = [...XP_LEVELS].reverse().find(item => xp >= item.min) || XP_LEVELS[0];
  const next = level.next;
  const range = next ? next - level.min : 1;
  const progress = next ? Math.min(100, Math.round(((xp - level.min) / range) * 100)) : 100;

  return {
    ...level,
    progress,
    remaining: next ? Math.max(0, next - xp) : 0
  };
}

export function buildXpProfile(data = state.cachedData, done = state.currentDone || {}) {
  const stats = calcUserStats(data, done);
  const reward = getDailyReward();
  const side = getSideChallenge(data, done);
  const baseXp =
    (stats.completed * 25) +
    stats.minutes +
    (stats.streak * 30) +
    (stats.completedWeeks * 150) +
    (stats.commitment >= 90 ? 75 : 0) +
    (stats.percent >= 100 ? 300 : 0);
  const rewardXp = reward.claimed ? reward.xp : 0;
  const sideXp = side.status === "achieved" ? side.xp : 0;
  const xp = baseXp + rewardXp + sideXp;

  return {
    xp,
    stats,
    level: getLevelInfo(xp),
    reward,
    side
  };
}

function getMissionMessage(data, done) {
  const side = getSideChallenge(data, done);

  if (side.status === "locked") {
    return message(`locked-${todayKey()}`, "info", "تمرين اليوم في موعده", "الأيام المقفلة تفتح حسب التاريخ الصحيح.", 4);
  }

  if (side.status === "achieved") {
    return message(`side-achieved-${todayKey()}`, "celebration", "مهمة اليوم الخاصة اكتملت", `حصلتِ على +${side.xp} XP إضافية.`, 9);
  }

  if (side.status === "active" && side.total - side.completed === 1) {
    return message(`one-left-${todayKey()}`, "warning", "بقي تمرين واحد فقط", "تمرينة واحدة وتكتمل مهمة اليوم.", 8);
  }

  if (side.status === "active") {
    return message(`today-waiting-${todayKey()}`, "info", "تمرين اليوم ينتظرك", side.body, 6);
  }

  return message(`rest-${todayKey()}`, "info", "يوم هادئ", side.body, 3);
}

function getOccasionMessage() {
  const now = new Date();
  if (now.getDay() === 5) {
    return message(`friday-${todayKey()}`, "info", "جمعة مباركة", "خذي نفسًا لطيفًا وكملي بخطوة صغيرة.", 4);
  }

  if (now.getDate() === 1) {
    return message(`month-${todayKey()}`, "celebration", "شهر جديد", "أهداف جديدة وفرصة جديدة للتصدر.", 5);
  }

  return null;
}

function getWeekStartMessage(data) {
  for (const challenge of challengeList(data)) {
    const absoluteDay = getTodayAbsoluteDay(challenge);
    if (absoluteDay > 1 && ((absoluteDay - 1) % 7) === 0) {
      const week = Math.floor((absoluteDay - 1) / 7) + 1;
      return message(
        `week-start-${challenge}-${week}`,
        "celebration",
        `بدأ ${weekName(week)}`,
        `${challengeName(challenge)} فتح أسبوعًا جديدًا. التزام جديد وفرصة جديدة للتصدر.`,
        9
      );
    }
  }

  return null;
}

function getRankMovementMessage(rows) {
  const rank = getCurrentRank(rows);
  if (!rank) return null;

  const key = storageKey(RANK_KEY);
  const previous = Number(localStorage.getItem(key) || 0);
  localStorage.setItem(key, String(rank));

  if (!previous || previous === rank) return null;

  if (rank === 1) {
    return message(`rank-return-${todayKey()}-${previous}`, "celebration", "استعدتِ الصدارة", "أنتِ الأولى الآن في التحدي.", 10);
  }

  if (rank < previous) {
    return message(`rank-up-${todayKey()}-${previous}-${rank}`, "celebration", "تقدم رائع", `أصبحتِ بالمركز ${rank}.`, 8);
  }

  const above = rows[rank - 2]?.user?.name || "إحدى المشاركات";
  return message(`rank-down-${todayKey()}-${previous}-${rank}`, "warning", `${above} تجاوزتك`, `الآن أنتِ بالمركز ${rank}.`, 8);
}

export function collectSmartMessages(data = state.cachedData, users = state.cachedParticipants || []) {
  const done = state.currentDone || {};
  const stats = calcUserStats(data, done);
  const rows = buildCompetitionRows(data, users);
  const rank = getCurrentRank(rows);
  const reward = getDailyReward();
  const items = [
    message(`welcome-${todayKey()}`, "info", `أهلًا بعودتك يا ${state.currentUser || "بطلة"}`, "جاهزة لتحدي اليوم؟", 5),
    getMissionMessage(data, done),
    message(`reward-${todayKey()}`, "reward", reward.title, reward.claimed ? `تم أخذ المكافأة: ${reward.body}` : reward.body, 7),
    getWeekStartMessage(data),
    getOccasionMessage()
  ].filter(Boolean);

  if (stats.streak >= 7) {
    items.push(message(`streak-${stats.streak}`, "celebration", `وصلتِ إلى ${stats.streak} أيام متتالية`, "سلسلة قوية تستحق الفخر.", 8));
  }

  if (stats.streak >= 7 && getSideChallenge(data, done).status === "active") {
    items.push(message(`streak-risk-${todayKey()}`, "warning", "انتبهي للسلسلة", `إذا لم تنجزي تمرين اليوم قد تفقدين سلسلة الـ ${stats.streak} أيام.`, 10));
  }

  if (stats.completedWeeks > 0) {
    items.push(message(`week-complete-${stats.completedWeeks}`, "celebration", "وسام جديد", `تم فتح وسام بطلة ${stats.completedWeeks} أسبوع.`, 8));
  }

  if (rank === 1) {
    items.push(message(`rank-one-${todayKey()}`, "celebration", "أنتِ الأولى", "تتصدرين الترتيب الآن حسب الالتزام.", 8));
  }

  return items.sort((a, b) => b.priority - a.priority);
}

export function getInboxMessages() {
  return parseStoredList(storageKey(INBOX_KEY));
}

export function syncInboxMessages(data = state.cachedData, users = state.cachedParticipants || []) {
  const rows = buildCompetitionRows(data, users);
  const generated = [
    getRankMovementMessage(rows),
    ...collectSmartMessages(data, users)
  ].filter(Boolean);
  const existing = getInboxMessages();
  const map = new Map(existing.map(item => [item.id, item]));

  generated.forEach(item => {
    if (!map.has(item.id)) map.set(item.id, item);
  });

  const list = [...map.values()].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt))
  );
  saveStoredList(storageKey(INBOX_KEY), list);
  return list;
}

export function maybeShowSmartMoment(data = state.cachedData, users = state.cachedParticipants || []) {
  if (!state.currentUser) return;

  const key = `${storageKey(MOMENT_KEY)}_${todayKey()}`;
  if (localStorage.getItem(key) === "yes") return;

  const messages = syncInboxMessages(data, users);
  const chosen =
    messages.find(item => item.type === "warning" && item.day === todayKey()) ||
    messages.find(item => item.type === "celebration" && item.day === todayKey()) ||
    messages.find(item => item.day === todayKey());

  if (!chosen) return;

  localStorage.setItem(key, "yes");
  showMomentPop(chosen.title, chosen.body, chosen.type === "warning" ? "error" : "success");
}

function renderMessagePreview(messages) {
  return messages.slice(0, 3).map(item => `
    <div class="mini-message is-${escapeHtml(item.type)}">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.body)}</span>
    </div>
  `).join("");
}

function renderThemeSwatches() {
  const current = getStoredTheme();
  return getThemeOptions().map(theme => `
    <button type="button" class="theme-swatch is-${theme.value} ${current === theme.value ? "is-selected" : ""}" data-theme-choice="${theme.value}" title="${escapeHtml(theme.label)}">
      <span>${theme.icon}</span>
      <small>${escapeHtml(theme.label)}</small>
    </button>
  `).join("");
}

export function renderGamificationHub(data = state.cachedData, users = state.cachedParticipants || []) {
  if (!state.currentUser) return;

  const main = document.querySelector("main.container");
  if (!main || (!document.getElementById("days") && !document.getElementById("doneCount"))) return;

  const anchor =
    document.getElementById("motivationShowcase") ||
    document.getElementById("dailyQuote") ||
    main.querySelector(".hero, .stats-hero");

  if (!anchor) return;

  const profile = buildXpProfile(data);
  const messages = syncInboxMessages(data, users);
  const rows = buildCompetitionRows(data, users);
  const rank = getCurrentRank(rows);
  const nextText = profile.level.next
    ? `${profile.level.remaining} XP للمستوى التالي`
    : "أعلى مستوى مفتوح";
  const sideClass = profile.side.status === "achieved" ? "is-done" : profile.side.status === "missed" ? "is-warning" : "";

  let box = document.getElementById("gamificationHub");
  if (!box) {
    box = document.createElement("section");
    box.id = "gamificationHub";
    box.className = "gamification-hub";
    anchor.insertAdjacentElement("afterend", box);
  }

  box.innerHTML = `
    <div class="section-title">
      <h2>منطقة الحماس</h2>
      <span>${rank ? `مركزك الحالي ${rank}` : "Gamification"}</span>
    </div>

    <div class="game-grid">
      <article class="game-card xp-card">
        <div class="game-card-head">
          <span>${profile.level.icon}</span>
          <div>
            <small>${profile.level.title}</small>
            <strong>${profile.xp} XP</strong>
          </div>
        </div>
        <div class="level-bar"><i style="width:${profile.level.progress}%"></i></div>
        <em>${nextText}</em>
      </article>

      <article class="game-card reward-card ${profile.reward.claimed ? "is-claimed" : ""}">
        <div class="game-card-head">
          <span>${profile.reward.icon}</span>
          <div>
            <small>مكافأة اليوم</small>
            <strong>${escapeHtml(profile.reward.title)}</strong>
          </div>
        </div>
        <p>${escapeHtml(profile.reward.body)}</p>
        <button type="button" id="claimDailyReward" ${profile.reward.claimed ? "disabled" : ""}>
          ${profile.reward.claimed ? "تم أخذ المكافأة" : `احصلي على +${profile.reward.xp} XP`}
        </button>
      </article>

      <article class="game-card side-card ${sideClass}">
        <div class="game-card-head">
          <span>🎯</span>
          <div>
            <small>${escapeHtml(profile.side.title)}</small>
            <strong>${profile.side.status === "achieved" ? "اكتملت" : profile.side.status === "missed" ? "انتهت بدون المكافأة" : `+${profile.side.xp} XP`}</strong>
          </div>
        </div>
        <p>${escapeHtml(profile.side.body)}</p>
        <em>${profile.side.completed || 0} / ${profile.side.total || 0}</em>
      </article>

      <article class="game-card inbox-card">
        <div class="game-card-head">
          <span>📬</span>
          <div>
            <small>مركز الرسائل</small>
            <strong>${messages.length} رسالة</strong>
          </div>
        </div>
        <div class="mini-message-list">${renderMessagePreview(messages)}</div>
        <a class="game-link" href="messages.html">فتح الرسائل</a>
      </article>

      <article class="game-card theme-card">
        <div class="game-card-head">
          <span>🌈</span>
          <div>
            <small>الثيمات</small>
            <strong>اختاري الجو</strong>
          </div>
        </div>
        <div class="theme-swatches">${renderThemeSwatches()}</div>
        <button type="button" id="hubSoundToggle" class="sound-toggle-inline">${isSoundMuted() ? "🔇 تشغيل الصوت" : "🔔 كتم الصوت"}</button>
      </article>
    </div>
  `;

  const rewardButton = document.getElementById("claimDailyReward");
  if (rewardButton) rewardButton.onclick = () => claimDailyReward(data, users);

  const soundButton = document.getElementById("hubSoundToggle");
  if (soundButton) {
    soundButton.onclick = () => {
      toggleSoundMuted();
      renderGamificationHub(data, users);
    };
  }

  box.querySelectorAll("[data-theme-choice]").forEach(button => {
    button.addEventListener("click", () => {
      selectTheme(button.dataset.themeChoice);
      renderGamificationHub(data, users);
      showPop("تم تغيير الثيم", "info");
    });
  });
}

export function celebrateWeekCompletion(title, body) {
  strongConfetti();
  playSuccessSound();
  showMomentPop(title, body || "تم فتح وسام جديد لهذا الأسبوع.");
}
