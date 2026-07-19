import {
  doc,
  setDoc,
  db,
  auth,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
} from "./firebase.js";
import { USERS_COLLECTION, AVATARS } from "./constants.js";
import { state } from "./state.js";
import { saveDone, isStrongEnoughPassword, deriveAuthEmail, mirrorPublicProfile } from "./auth.js";
import { challengeName } from "./challengeMeta.js";
import { getExpectedDate, isProgramDayOnTime } from "./commitment.js";
import {
  getProgramDayGroups,
  isProgramDayComplete,
  setStatsRenderers
} from "./progress.js";
import { calcUserStats, getUserBadges, renderParticipantsBoard } from "./participants.js";
import {
  escapeHtml,
  formatDateTime,
  getCompletedAt,
  isDone,
  weekName,
  dayName,
  getProgressTitle,
  startOfDay
} from "./utils.js";
import { getUserAvatar, showPop } from "./ui.js";

function getLatestAchievement(data, done) {
  const byId = data.reduce((map, item) => {
    map[item.id] = item;
    return map;
  }, {});

  const latest = Object.entries(done || {})
    .map(([id, record]) => ({
      item: byId[id],
      completedAt: getCompletedAt(record)
    }))
    .filter(entry => entry.item && entry.completedAt)
    .sort((a, b) => b.completedAt - a.completedAt)[0];

  if (!latest) return "لا يوجد إنجاز حديث";
  return latest.item.type === "rest" ? "أكملت يوم راحة" : `أنجزت ${latest.item.title}`;
}

function isCalendarToday(dayGroup) {
  const expectedDate = getExpectedDate(dayGroup.items[0]);
  if (!expectedDate) return false;
  return startOfDay(expectedDate).getTime() === startOfDay(new Date()).getTime();
}

export function renderProgramCalendar(data) {
  const calendar = document.getElementById("programCalendar");
  if (!calendar) return;

  const done = state.currentDone || {};
  const dayGroups = getProgramDayGroups(data);

  if (dayGroups.length === 0) {
    calendar.innerHTML = `<div class="calendar-empty">لا توجد أيام برنامج حتى الآن.</div>`;
    return;
  }

  const byChallenge = dayGroups.reduce((map, group) => {
    const key = String(group.challenge);
    if (!map[key]) map[key] = [];
    map[key].push(group);
    return map;
  }, {});

  calendar.innerHTML = Object.keys(byChallenge)
    .map(Number)
    .sort((a, b) => a - b)
    .map(challenge => `
      <div class="calendar-challenge">
        <h3>${challengeName(challenge)}</h3>
        <div class="calendar-grid">
          ${byChallenge[String(challenge)].map(dayGroup => {
      const complete = isProgramDayComplete(dayGroup, done);
      const onTime = isProgramDayOnTime(dayGroup, done);
      const late = complete && !onTime;
      const today = isCalendarToday(dayGroup);
      const classes = [
        "calendar-day",
        complete ? "is-complete" : "is-pending",
        onTime ? "is-on-time" : "",
        late ? "is-late" : "",
        today ? "is-today" : ""
      ].filter(Boolean).join(" ");

      return `
              <div class="${classes}" title="${escapeHtml(`${challengeName(dayGroup.challenge)} - ${weekName(dayGroup.week)} - ${dayName(dayGroup.programDay)}`)}">
                <span>${dayGroup.absoluteDay}</span>
                <small>${weekName(dayGroup.week)} - ${dayName(dayGroup.programDay)}</small>
                ${onTime ? `<em>⭐</em>` : ""}
              </div>
            `;
    }).join("")}
        </div>
      </div>
    `).join("");
}

export function buildWhatsappReport(data) {
  const stats = calcUserStats(data, state.currentDone || {});

  return [
    `🏋️‍♀️ تقرير إنجاز ${state.currentUser || "المتسابقة"}`,
    `نسبة الإنجاز: ${stats.percent}%`,
    `نسبة الالتزام: ${stats.commitment}%`,
    `سلسلة الالتزام: ${stats.streak} أيام متتالية`,
    `الدقائق: ${stats.minutes} دقيقة`,
    `الأسابيع المكتملة: ${stats.completedWeeks}`,
    `اللقب: ${stats.title}`,
    "مستمرة وبقوة 🔥"
  ].join("\n");
}

export function buildAchievementShareText(data) {
  const stats = calcUserStats(data, state.currentDone || {});
  return [
    `🔥 إنجاز جديد من ${state.currentUser}`,
    `وصلت إلى ${stats.percent}% من التحدي`,
    `اللقب الحالي: ${stats.title}`,
    `نسبة الالتزام: ${stats.commitment}%`,
    `السلسلة: ${stats.streak} أيام متتالية`,
    "الخطوة الجاية أقوى 💪"
  ].join("\n");
}

export async function saveUserAvatar(avatar) {
  if (!AVATARS.includes(avatar) || !state.currentUserUid) return;

  await setDoc(doc(db, USERS_COLLECTION, state.currentUserUid), {
    name: state.currentUser,
    avatar,
    updatedAt: new Date().toISOString()
  }, { merge: true });

  state.currentUserProfile = { ...(state.currentUserProfile || {}), avatar };
  await mirrorPublicProfile();
  state.cachedParticipants = null;
  showPop("تم حفظ الصورة الرمزية");
  renderPersonalProfile(state.cachedData);
  await renderParticipantsBoard(state.cachedData, { refreshParticipants: true });
}

export function bindWhatsappReport(data) {
  const btn = document.getElementById("copyWhatsappReport");
  if (!btn) return;

  btn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(buildWhatsappReport(data));
      showPop("تم نسخ تقرير واتساب بنجاح");
    } catch (e) {
      showPop("تعذر نسخ التقرير", "error");
    }
  };
}

export function renderPersonalProfile(data) {
  const box = document.getElementById("personalProfile");
  if (!box || !state.currentUser) return;

  const done = state.currentDone || {};
  const stats = calcUserStats(data, done);
  const hasPassword = !!auth.currentUser;
  const latestAchievement = getLatestAchievement(data, done);
  const avatar = getUserAvatar(state.currentUserProfile || { name: state.currentUser });
  const badges = getUserBadges(stats, 99);

  box.innerHTML = `
    <div class="profile-head">
      <div class="profile-identity">
        <span class="profile-avatar">${escapeHtml(avatar)}</span>
        <div>
          <span>ملفي الشخصي</span>
          <h2>${escapeHtml(state.currentUser)}</h2>
        </div>
      </div>
      <div class="profile-actions">
        <button type="button" id="shareAchievementBtn" class="profile-password-btn">مشاركة الإنجاز</button>
        <button type="button" id="changePasswordBtn" class="profile-password-btn">تغيير كلمة المرور</button>
      </div>
    </div>

    <div class="account-security ${hasPassword ? "is-safe" : "is-warning"}">
      ${hasPassword ? "حسابك محمي" : "يرجى إنشاء كلمة مرور لحماية تقدمك"}
    </div>

    <div class="avatar-picker">
      <span>اختاري صورتك الرمزية</span>
      <div class="avatar-options inline">
        ${AVATARS.map(item => `
          <button type="button" class="avatar-pick ${item === avatar ? "is-selected" : ""}" data-avatar="${item}">${item}</button>
        `).join("")}
      </div>
    </div>

    ${badges.length ? `<div class="profile-badges">${badges.map(badge => `<span>${escapeHtml(badge)}</span>`).join("")}</div>` : ""}

    <div class="profile-grid">
      <div class="profile-ring-wrap">
        <span>دائرة الإنجاز</span>
        <div class="profile-ring" style="--progress:${stats.percent * 3.6}deg"><strong>${stats.percent}%</strong></div>
      </div>
      <div><span>اللقب الحالي</span><strong>${escapeHtml(stats.title)}</strong></div>
      <div><span>نسبة الإنجاز</span><strong>${stats.percent}%</strong></div>
      <div><span>نسبة الالتزام</span><strong>${stats.commitment}%</strong></div>
      <div><span>سلسلة الالتزام</span><strong>${stats.streak} أيام</strong></div>
      <div><span>مجموع الدقائق</span><strong>${stats.minutes}</strong></div>
      <div><span>أسابيع مكتملة</span><strong>${stats.completedWeeks}</strong></div>
      <div class="profile-wide"><span>آخر إنجاز</span><strong>${escapeHtml(latestAchievement)}</strong></div>
    </div>
  `;

  const btn = document.getElementById("changePasswordBtn");
  if (btn) btn.onclick = showChangePasswordDialog;

  const shareBtn = document.getElementById("shareAchievementBtn");
  if (shareBtn) {
    shareBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(buildAchievementShareText(data));
        showPop("تم نسخ رسالة المشاركة بنجاح");
      } catch (e) {
        showPop("تعذر نسخ رسالة المشاركة", "error");
      }
    };
  }

  document.querySelectorAll(".avatar-pick").forEach(button => {
    button.onclick = () => saveUserAvatar(button.dataset.avatar);
  });
}

export function showChangePasswordDialog() {
  const old = document.getElementById("passwordChangeOverlay");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.id = "passwordChangeOverlay";
  overlay.className = "login-overlay";
  overlay.innerHTML = `
    <form class="login-card password-change-card">
      <div class="login-icon">🔑</div>
      <h2>تغيير كلمة المرور</h2>
      <p>اكتبي كلمة المرور الحالية ثم الجديدة.</p>

      <label for="currentPassword">كلمة المرور الحالية</label>
      <input id="currentPassword" type="password" autocomplete="current-password" required>

      <label for="newPassword">كلمة المرور الجديدة</label>
      <input id="newPassword" type="password" autocomplete="new-password" required>

      <label for="newPasswordConfirm">تأكيد الجديدة</label>
      <input id="newPasswordConfirm" type="password" autocomplete="new-password" required>

      <div id="passwordChangeError" class="login-error"></div>

      <div class="login-actions">
        <button type="submit">حفظ كلمة المرور الجديدة</button>
        <button type="button" class="ghost" id="cancelPasswordChange">إلغاء</button>
      </div>
    </form>
  `;

  document.body.appendChild(overlay);

  const form = overlay.querySelector("form");
  const currentInput = document.getElementById("currentPassword");
  const nextInput = document.getElementById("newPassword");
  const confirmInput = document.getElementById("newPasswordConfirm");
  const errorBox = document.getElementById("passwordChangeError");

  function setError(text) {
    errorBox.textContent = text || "";
  }

  document.getElementById("cancelPasswordChange").onclick = () => overlay.remove();

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const currentPassword = currentInput.value;
    const newPassword = nextInput.value;
    const confirmPassword = confirmInput.value;

    if (!isStrongEnoughPassword(newPassword)) {
      setError("كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف");
      showPop("كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف", "error");
      nextInput.select();
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين");
      showPop("كلمتا المرور غير متطابقتين", "error");
      confirmInput.select();
      return;
    }

    if (!auth.currentUser) {
      setError("يجب تسجيل الدخول أولاً");
      return;
    }

    try {
      const email = await deriveAuthEmail(state.currentUser);
      const credential = EmailAuthProvider.credential(email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);

      overlay.remove();
      showPop("تم تغيير كلمة المرور بنجاح");
      renderPersonalProfile(state.cachedData);
    } catch (e) {
      if (e && (e.code === "auth/wrong-password" || e.code === "auth/invalid-credential")) {
        setError("كلمة المرور الحالية غير صحيحة");
        showPop("كلمة المرور الحالية غير صحيحة", "error");
        currentInput.select();
        return;
      }
      setError("تعذر تغيير كلمة المرور الآن");
      showPop("تعذر تغيير كلمة المرور الآن", "error");
    }
  });

  setTimeout(() => currentInput.focus(), 50);
}

setStatsRenderers({
  renderProgramCalendar,
  renderPersonalProfile
});
