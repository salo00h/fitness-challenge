import { state } from "./state.js";
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
import { renderParticipantsBoard } from "./participants.js";
import {
  confetti,
  playDing,
  renderGreetingMessage,
  renderSkeletonCards,
  showChallengeCertificate,
  showPop,
  strongConfetti
} from "./ui.js";
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

export async function openChallenge(challenge) {
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
      setTimeout(strongConfetti, 180);
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
            const dayCompleteButton = dayLocked
              ? ""
              : `<button type="button" class="day-complete-btn ${dayComplete ? "is-done" : ""}" ${dayComplete ? "disabled" : ""} onclick="completeProgramDay(${challenge}, ${selectedWeek}, ${day})">
                  ${dayComplete ? "اليوم مكتمل ✓" : "تم إنجاز كل تمارين اليوم"}
                </button>`;

            return `
                      <article class="day-card ${dayLocked ? "is-locked" : ""} ${dayComplete ? "is-complete" : ""}" data-program-day="${day}">
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
  await renderParticipantsBoard(allData, { refreshParticipants });
  renderActivityFeed(allData);
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
