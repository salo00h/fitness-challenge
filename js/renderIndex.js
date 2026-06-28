import { state } from "./state.js";
import { collection, db, getDocs } from "./firebase.js";
import { USERS_COLLECTION } from "./constants.js";
import { getData } from "./challengeMeta.js";
import {
  challengeName,
  challengeNumber,
  getChallengeImageStyle,
  getChallengeMeta,
  getChallengeWeek,
  setChallengeWeek,
  challengePlaceholder
} from "./challengeMeta.js";
import { getDone, saveDone } from "./auth.js";
import {
  getJourneyInfo,
  getMissionItemsForChallenge,
  getTodayAbsoluteDay,
  isFutureProgramDay,
  isFutureProgramDayItems
} from "./commitment.js";
import {
  calcCompletionPercent,
  makeDoneRecord,
  updateProgressBoard,
  workoutOnly
} from "./progress.js";
import { calcUserStats, participantRankLabel } from "./participants.js";
import {
  confetti,
  playDing,
  renderGreetingMessage,
  renderSkeletonCards,
  showChallengeCertificate,
  showMomentPop,
  showPop
} from "./ui.js";
import {
  celebrateWeekCompletion,
  renderGamificationHub
} from "./gamification.js";
import {
  dayName,
  escapeHtml,
  getCompletedAt,
  getProgramAbsoluteDay,
  getYoutubeThumb,
  isDone,
  itemProgramDay,
  itemWeek,
  userDocId,
  weekName
} from "./utils.js";

const HOME_TAB_KEY = "fitness_home_tab_v1";
const HOME_TABS = ["today", "challenges", "activity"];

export function setHomeTab(tab = "today", options = {}) {
  const nextTab = HOME_TABS.includes(tab) ? tab : "today";
  const tabs = document.querySelectorAll(".home-tabs [data-home-tab]");
  const panels = document.querySelectorAll("[data-home-panel]");
  if (!tabs.length || !panels.length) return;

  tabs.forEach(button => {
    const isActive = button.dataset.homeTab === nextTab;
    button.classList.toggle("is-active", isActive);
    if (isActive) button.setAttribute("aria-selected", "true");
    else button.removeAttribute("aria-selected");
  });

  panels.forEach(panel => {
    panel.classList.toggle("is-active", panel.dataset.homePanel === nextTab);
  });

  document.body.dataset.homeTab = nextTab;
  localStorage.setItem(HOME_TAB_KEY, nextTab);

  if (options.scroll) {
    document.querySelector(`[data-home-panel="${nextTab}"]`)?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

export function initHomeTabs() {
  const tabs = document.querySelectorAll("[data-home-tab]");
  if (!tabs.length) return;

  tabs.forEach(button => {
    button.addEventListener("click", () => {
      setHomeTab(button.dataset.homeTab || "today", { scroll: !button.closest(".home-tabs") });
    });
  });

  setHomeTab(localStorage.getItem(HOME_TAB_KEY) || "today");
}

async function ensureParticipants(refreshParticipants = true) {
  if (!refreshParticipants && state.cachedParticipants) return state.cachedParticipants;
  if (!refreshParticipants && !state.cachedParticipants) return [];

  const snap = await getDocs(collection(db, USERS_COLLECTION));
  state.cachedParticipants = snap.docs.map(docSnap => docSnap.data());
  return state.cachedParticipants;
}

export function renderHomeCompetitionMini(data) {
  const box = document.getElementById("homeCompetitionMini");
  if (!box || !state.cachedParticipants) return;

  const rows = state.cachedParticipants
    .filter(user => user.name)
    .map(user => ({
      user,
      stats: calcUserStats(data, user.done || {}),
      isMe: String(user.name || "").trim().toLowerCase() === String(state.currentUser || "").trim().toLowerCase()
    }))
    .sort((a, b) =>
      b.stats.commitment - a.stats.commitment ||
      b.stats.percent - a.stats.percent ||
      b.stats.streak - a.stats.streak ||
      b.stats.minutes - a.stats.minutes ||
      String(a.user.name).localeCompare(String(b.user.name), "ar")
    );

  const currentRankIndex = rows.findIndex(row => row.isMe);
  const topRows = rows.slice(0, 3);

  box.innerHTML = `
    <div class="section-title">
      <h2>Ù„Ù…Ø­Ø© Ø§Ù„Ù…Ù†Ø§ÙØ³Ø©</h2>
      <span>${currentRankIndex >= 0 ? participantRankLabel(currentRankIndex) : "Ø§Ù„ØªØ±ØªÙŠØ¨ Ø§Ù„ÙƒØ§Ù…Ù„"}</span>
    </div>
    <div class="mini-rank-list">
      ${topRows.map((row, index) => `
        <article class="${row.isMe ? "is-me" : ""}">
          <strong>${participantRankLabel(index)}</strong>
          <span>${escapeHtml(row.user.avatar || "🌸")}</span>
          <div>
            <b>${escapeHtml(row.user.name)}</b>
            <small>${row.stats.commitment}% Ø§Ù„ØªØ²Ø§Ù… · ${row.stats.percent}% Ø¥Ù†Ø¬Ø§Ø² · Streak ${row.stats.streak}</small>
          </div>
        </article>
      `).join("")}
    </div>
    <a class="mini-board-link" href="leaderboard.html">ÙØªØ­ Ù„ÙˆØ­Ø© Ø§Ù„ØªØ±ØªÙŠØ¨ Ø§Ù„ÙƒØ§Ù…Ù„Ø©</a>
  `;
}

export async function openChallenge(challenge) {
  setHomeTab("challenges");
  state.activeChallenge = Number(challenge) || 1;
  await renderViewer({
    refreshData: false,
    refreshParticipants: false,
    showLoading: false
  });

  const opened = document.querySelector(`[data-challenge="${state.activeChallenge}"]`);
  if (opened) {
    opened.scrollIntoView({ behavior: "auto", block: "start" });
  }
}

export async function closeChallenge() {
  state.activeChallenge = null;
  await renderViewer({
    refreshData: false,
    refreshParticipants: false,
    showLoading: false
  });
}

export async function openMissionTarget(challenge, week, programDay) {
  setHomeTab("challenges");
  setChallengeWeek(challenge, week);
  state.activeChallenge = Number(challenge) || 1;

  await renderViewer({
    refreshData: false,
    refreshParticipants: false,
    showLoading: false
  });

  const target =
    document.querySelector(`[data-challenge="${Number(challenge) || 1}"] [data-program-day="${Number(programDay) || 1}"]`) ||
    document.querySelector(`[data-challenge="${Number(challenge) || 1}"]`);

  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.classList.add("is-highlighted");
    setTimeout(() => target.classList.remove("is-highlighted"), 1600);
  }
}

export function renderTodayMission(data) {
  const box = document.getElementById("todayMission");
  if (!box) return;

  const done = getDone();
  const challenges = [...new Set(data.map(challengeNumber))].sort((a, b) => a - b);
  const missions = challenges
    .map(challenge => {
      const todayAbsoluteDay = getTodayAbsoluteDay(challenge);
      if (todayAbsoluteDay < 1) return "";

      const items = getMissionItemsForChallenge(data, challenge, done);

      if (items.length === 0) return "";

      const sample = items[0];
      const complete = items.every(item => isDone(done[item.id]));
      const locked = isFutureProgramDayItems(items);
      const allRest = items.every(item => item.type === "rest");
      const missionAbsoluteDay = getProgramAbsoluteDay(sample);
      const journey = { ...getJourneyInfo(data, challenge), today: missionAbsoluteDay };

      return `
        <article class="today-mission-card is-clickable ${complete ? "is-complete" : ""}"
          role="button"
          tabindex="0"
          onclick="openMissionTarget(${challenge}, ${itemWeek(sample)}, ${itemProgramDay(sample)})"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openMissionTarget(${challenge}, ${itemWeek(sample)}, ${itemProgramDay(sample)})}">
          <div class="today-mission-head">
            <div>
              <span>${challengeName(challenge)} - ${weekName(itemWeek(sample))}</span>
              <h2>${complete ? "مهمة اليوم مكتملة ✓" : (allRest ? "يوم راحة 🌸" : "مهمة اليوم")}</h2>
            </div>
            <strong>${dayName(itemProgramDay(sample))}</strong>
          </div>

          <div class="journey-counter">
            <span>اليوم ${journey.today} من ${journey.totalDays} في الرحلة</span>
            <div><i style="width:${journey.percent}%"></i></div>
          </div>

          <div class="today-mission-list">
            ${items.map(item => `
              <div class="today-mission-item ${isDone(done[item.id]) ? "is-done" : ""}">
                <span>${item.type === "rest" ? "🌸 يوم راحة" : escapeHtml(item.title)}</span>
                <small>${isDone(done[item.id]) ? "مكتمل ✓" : (item.duration ? item.duration + " دقيقة" : "جاهز")}</small>
              </div>
            `).join("")}
          </div>

          ${locked
          ? `<div class="locked-day-banner">🔒 يفتح في موعده</div>`
          : `<button type="button" class="day-complete-btn ${complete ? "is-done" : ""}" ${complete ? "disabled" : ""} onclick="event.stopPropagation(); completeProgramDay(${challenge}, ${itemWeek(sample)}, ${itemProgramDay(sample)})">
              ${complete ? "اليوم مكتمل ✓" : (allRest ? "تسجيل يوم الراحة" : "تم إنجاز كل تمارين اليوم")}
            </button>`
        }
        </article>
      `;
    })
    .filter(Boolean);

  box.innerHTML = `
    <div class="section-title">
      <h2>مهمة اليوم</h2>
      <span>حسب تاريخ بداية كل تحدي</span>
    </div>
    ${missions.length ? missions.join("") : `<div class="empty-state mini-empty"><strong>🌷 يوم هادئ</strong><span>لا توجد تمارين محددة لليوم، استمتعي بالاستعداد للخطوة القادمة.</span></div>`}
  `;
}

export function renderActivityFeed(data) {
  const box = document.getElementById("activityFeed");
  if (!box || !state.cachedParticipants) return;

  const byId = data.reduce((map, item) => {
    map[item.id] = item;
    return map;
  }, {});

  const seen = new Set();
  const activities = [];

  state.cachedParticipants.forEach(user => {
    const name = String(user.name || "").trim();
    if (!name || !user.done) return;

    Object.entries(user.done).forEach(([id, record]) => {
      const item = byId[id];
      const completedAt = getCompletedAt(record);
      if (!item || !completedAt || !isDone(record)) return;

      const key = `${userDocId(name)}-${id}`;
      if (seen.has(key)) return;
      seen.add(key);

      activities.push({
        name,
        item,
        completedAt
      });
    });
  });

  activities.sort((a, b) => b.completedAt - a.completedAt);
  const latest = activities.slice(0, 10);

  if (latest.length === 0) {
    box.innerHTML = "";
    return;
  }

  box.innerHTML = `
    <div class="section-title">
      <h2>آخر الإنجازات</h2>
      <span>آخر 10 تحديثات</span>
    </div>
    <div class="activity-list">
      ${latest.map(activity => `
        <div class="activity-item">
          <strong>${escapeHtml(activity.name)}</strong>
          <span>${activity.item.type === "rest" ? "أكملت يوم راحة" : "أنجزت " + escapeHtml(activity.item.title)}</span>
          <small>${activity.completedAt.toLocaleDateString("ar")} ${activity.completedAt.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}</small>
        </div>
      `).join("")}
    </div>
  `;
}

function celebrationKey(kind, challenge, week = "") {
  return `fitness_celebrated_${kind}_${userDocId(state.currentUser || "guest")}_${challenge}_${week}`;
}

function maybeCelebrateMilestones(data, item, done) {
  if (!item || !isDone(done[item.id])) return;

  const challenge = challengeNumber(item);
  const week = itemWeek(item);
  const weekItems = workoutOnly(data).filter(x =>
    challengeNumber(x) === challenge && itemWeek(x) === week
  );
  const challengeItems = workoutOnly(data).filter(x => challengeNumber(x) === challenge);

  if (weekItems.length && weekItems.every(x => isDone(done[x.id]))) {
    const key = celebrationKey("week", challenge, week);
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, "yes");
      setTimeout(() => {
        celebrateWeekCompletion(
          `اكتمل ${weekName(week)}`,
          `مبروك! تم فتح وسام بطلة ${weekName(week)} داخل ${challengeName(challenge)}.`
        );
      }, 180);
      showPop(`🏆 اكتمل ${weekName(week)} من ${challengeName(challenge)}`);
    }
  }

  if (challengeItems.length && challengeItems.every(x => isDone(done[x.id]))) {
    const key = celebrationKey("challenge", challenge);
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, "yes");
      setTimeout(() => showChallengeCertificate(challenge), 350);
    }
  }
}

export function getProgramDayItems(data, challenge, week, programDay) {
  return workoutOnly(data).filter(item =>
    challengeNumber(item) === Number(challenge) &&
    itemWeek(item) === Number(week) &&
    itemProgramDay(item) === Number(programDay)
  );
}

export function notifyDayProgress(dayItems, done) {
  const remaining = dayItems.filter(item => !isDone(done[item.id]));

  if (remaining.length === 0) {
    setTimeout(confetti, 150);
    showMomentPop("اليوم اكتمل", "شغل ممتاز. خذي لحظة فخر صغيرة وكملي بنفس النفس.");
    showPop("ممتاز! اكتمل هذا اليوم 🎉");
    return;
  }

  if (remaining.length === 1) {
    showPop("باقي تمرين واحد وتكملين اليوم 🔥");
  }
}

export async function completeProgramDay(challenge, week, programDay) {
  const scrollY = window.scrollY;
  const allData = state.cachedData.length ? state.cachedData : await getData();
  const dayItems = getProgramDayItems(allData, challenge, week, programDay);

  if (dayItems.length === 0) return;

  if (isFutureProgramDayItems(dayItems)) {
    showPop("هذا اليوم لم يفتح بعد 🔒", "error");
    return;
  }

  const done = getDone();
  const alreadyComplete = dayItems.every(item => isDone(done[item.id]));

  if (alreadyComplete) {
    showPop("اليوم مكتمل ✓");
    return;
  }

  dayItems.forEach(item => {
    if (!isDone(done[item.id])) {
      done[item.id] = makeDoneRecord();
    }
  });

  await saveDone(done);
  playDing();
  notifyDayProgress(dayItems, done);
  maybeCelebrateMilestones(allData, dayItems[0], done);

  await renderViewer({
    refreshData: false,
    refreshParticipants: true,
    showLoading: false
  });
  renderGamificationHub(allData, state.cachedParticipants || []);

  window.scrollTo({
    top: scrollY,
    behavior: "instant"
  });
}

export async function toggleDone(id) {
  const scrollY = window.scrollY;
  const allData = state.cachedData.length ? state.cachedData : await getData();
  const currentItem = allData.find(x => x.id === id);

  if (!currentItem) return;

  if (isFutureProgramDay(currentItem)) {
    showPop("هذا اليوم لم يفتح بعد 🔒", "error");
    return;
  }

  const done = getDone();
  const wasDone = isDone(done[id]);

  if (wasDone) {
    delete done[id];
  } else {
    done[id] = makeDoneRecord();
  }
  await saveDone(done);

  if (!wasDone) {
    playDing();
    showPop("تم إنجاز التمرين بنجاح");
  } else {
    showPop("تم إلغاء إنجاز التمرين");
  }

  if (!wasDone && currentItem) {
    const dayItems = getProgramDayItems(
      allData,
      challengeNumber(currentItem),
      itemWeek(currentItem),
      itemProgramDay(currentItem)
    );
    notifyDayProgress(dayItems, done);
    maybeCelebrateMilestones(allData, currentItem, done);
  }

  await renderViewer({
    refreshData: false,
    refreshParticipants: true,
    showLoading: false
  });
  renderGamificationHub(allData, state.cachedParticipants || []);

  window.scrollTo({
    top: scrollY,
    behavior: "instant"
  });

  if (document.getElementById("doneCount")) {
    updateProgressBoard(allData);
  }
}

// Rendering
export async function renderViewer(options = {}) {
  const {
    refreshData = true,
    refreshParticipants = true,
    showLoading = true
  } = options;
  const daysBox = document.getElementById("days");
  if (!daysBox) return;

  const done = getDone();
  if (showLoading) {
    renderSkeletonCards(daysBox, 3);
  }

  const allData = refreshData || state.cachedData.length === 0 ? await getData() : state.cachedData;
  updateProgressBoard(allData);
  renderTodayMission(allData);
  await ensureParticipants(refreshParticipants);

  if (allData.length === 0) {
    daysBox.innerHTML = `
      <div class="empty-state card">
        <strong>🌷 لا توجد تمارين بعد</strong>
        <span>ابدئي بإضافة التمارين من صفحة الإعدادات، وسنرتبها هنا كبطاقات تحديات جميلة.</span>
      </div>
    `;
    return;
  }

  const challenges = [...new Set(allData.map(challengeNumber))].sort((a, b) => a - b);
  if (state.activeChallenge !== null && !challenges.includes(Number(state.activeChallenge))) {
    state.activeChallenge = null;
  }

  daysBox.innerHTML = challenges.map(challenge => {
    const challengeData = allData.filter(x => challengeNumber(x) === challenge);
    const savedWeek = getChallengeWeek(challenge);
    const weeks = [...new Set(challengeData.map(x => Number(x.week)))].sort((a, b) => a - b);
    const selectedWeek = weeks.includes(Number(savedWeek)) ? Number(savedWeek) : (weeks[0] || Number(savedWeek) || 1);
    if (Number(selectedWeek) !== Number(savedWeek)) {
      setChallengeWeek(challenge, selectedWeek);
    }

    const weekData = challengeData
      .filter(x => Number(x.week) === Number(selectedWeek))
      .sort((a, b) => Number(a.programDay) - Number(b.programDay));

    const isOpen = Number(state.activeChallenge) === Number(challenge);
    const meta = getChallengeMeta(challenge);
    const metaDescription = meta.description || "وصف التحدي يظهر هنا من صفحة الإعدادات";
    const metaImage = meta.image || challengePlaceholder(challenge);
    const metaImageStyle = getChallengeImageStyle(meta);

    const grouped = {};
    if (isOpen) {
      weekData.forEach(item => {
        if (!grouped[item.programDay]) grouped[item.programDay] = [];
        grouped[item.programDay].push(item);
      });
    }

    return `
      <section class="challenge-box card ${isOpen ? "is-open" : "is-closed"}" data-challenge="${challenge}">
        <div class="challenge-cover">
          <img src="${escapeHtml(metaImage)}" alt="${challengeName(challenge)}" style="${metaImageStyle}">
          <span>${challengeName(challenge)}</span>
        </div>

        <div class="challenge-head">
          <div>
            <span class="challenge-kicker">🔥 برنامج مستقل</span>
            <h2>${challengeName(challenge)}</h2>
            <p class="challenge-description">${escapeHtml(metaDescription)}</p>
          </div>
        </div>

        ${isOpen
        ? `
            <div class="challenge-actions">
              <button type="button" class="challenge-back-btn" onclick="closeChallenge()">رجوع للتحديات</button>
            </div>

            <div class="week-nav challenge-week-nav">
              <button type="button" onclick="changeChallengeWeek(${challenge}, -1)">الأسبوع السابق</button>
              <strong>${weekName(selectedWeek)}</strong>
              <button type="button" onclick="changeChallengeWeek(${challenge}, 1)">الأسبوع التالي</button>
            </div>

            ${weekData.length === 0
          ? `<div class="empty card">لا توجد تمارين في ${weekName(selectedWeek)} داخل ${challengeName(challenge)}.</div>`
          : `<div class="challenge-days">
                  ${Object.keys(grouped).sort((a, b) => a - b).map(day => {
            const items = grouped[day];
            const allRest = items.every(i => i.type === "rest");
            const restItem = items[0];
            const dayLocked = isFutureProgramDayItems(items);
            const dayComplete = items.every(item => isDone(done[item.id]));
            const dayToday = getProgramAbsoluteDay(items[0]) === getTodayAbsoluteDay(challenge);
            const dayCompleteButton = dayLocked
              ? ""
              : `<button type="button" class="day-complete-btn ${dayComplete ? "is-done" : ""}" ${dayComplete ? "disabled" : ""} onclick="completeProgramDay(${challenge}, ${selectedWeek}, ${day})">
                  ${dayComplete ? "اليوم مكتمل ✓" : "تم إنجاز كل تمارين اليوم"}
                </button>`;

            return `
                      <article class="day-card ${dayLocked ? "is-locked" : ""} ${dayComplete ? "is-complete" : ""} ${allRest ? "is-rest" : ""} ${dayToday ? "is-today" : ""}" data-program-day="${day}">
                        <div class="day-head">
                          <div>
                            <h2>${dayName(day)}</h2>
                          </div>
                          <span class="week-label">${weekName(selectedWeek)}</span>
                        </div>
                        ${dayLocked ? `<div class="locked-day-banner">🔒 يفتح في موعده</div>` : dayCompleteButton}

                        ${allRest
                ? `
                            <div class="rest">
                              <div>يوم راحة 🌸</div>
                              ${dayLocked
                  ? `<div class="locked-inline">🔒 يفتح في موعده</div>`
                  : `<button class="done-btn ${isDone(done[restItem.id]) ? "is-done" : ""}" onclick="toggleDone('${restItem.id}')">
                                    ${isDone(done[restItem.id]) ? "تم الإنجاز ✓" : "تم إنجاز يوم الراحة"}
                                  </button>`
                }
                            </div>
                          `
                : ""
              }

                        <div class="exercises">
                          ${items.map(item =>
                item.type === "rest"
                  ? ""
                  : `
                                <div class="exercise ${isDone(done[item.id]) ? "completed" : ""}">
                                  <a href="${item.youtube || "#"}" target="_blank" rel="noopener">
                                    <div class="image-wrap">
                                      <img src="${getYoutubeThumb(item.youtube)}" alt="${escapeHtml(item.title)}">
                                      ${isDone(done[item.id]) ? `<span class="done-ribbon">مكتمل ✓</span>` : ""}
                                    </div>
                                  </a>
                                  <div class="body">
                                    <span class="badge">${item.duration ? item.duration + " دقيقة" : "بدون مدة"}</span>
                                    <h3>${escapeHtml(item.title)}</h3>
                                    ${item.notes ? `<div class="notes">${escapeHtml(item.notes)}</div>` : ""}
                                    ${dayLocked
                    ? `<div class="locked-inline">🔒 يفتح في موعده</div>`
                    : `<button class="done-btn ${isDone(done[item.id]) ? "is-done" : ""}" onclick="toggleDone('${item.id}')">
                                          ${isDone(done[item.id]) ? "تم الإنجاز ✓" : "تم إنجاز التمرين"}
                                        </button>`
                  }
                                  </div>
                                </div>
                              `
              ).join("")}
                        </div>
                      </article>
                    `;
          }).join("")}
                </div>`
        }
          `
        : `
            <button type="button" class="challenge-enter-btn" onclick="openChallenge(${challenge})">دخول التحدي</button>
          `
      }
      </section>
    `;
  }).join("");

  updateProgressBoard(allData);
  renderActivityFeed(allData);
  renderHomeCompetitionMini(allData);
  renderGreetingMessage(allData);
}

export async function changeChallengeWeek(challenge, step) {
  const allData = state.cachedData.length ? state.cachedData : await getData();
  const challengeData = allData.filter(x => challengeNumber(x) === Number(challenge));
  const weeks = [...new Set(challengeData.map(x => Number(x.week)))].sort((a, b) => a - b);
  const minWeek = weeks.length ? Math.min(...weeks) : 1;
  const maxWeek = weeks.length ? Math.max(...weeks) : 1;
  const nextWeek = Math.min(maxWeek, Math.max(minWeek, getChallengeWeek(challenge) + Number(step)));
  setChallengeWeek(challenge, nextWeek);
  await renderViewer({
    refreshData: false,
    refreshParticipants: false,
    showLoading: false
  });
}
