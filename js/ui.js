import { AVATARS, DAILY_QUOTES, DAY_MS, THEME_KEY } from "./constants.js";
import { state } from "./state.js";
import { challengeName } from "./challengeMeta.js";
import { getTodayAbsoluteDay, isFutureProgramDayItems } from "./commitment.js";
import { escapeHtml, getProgramAbsoluteDay, getProgressTitle, isDone, startOfDay, userDocId } from "./utils.js";

export function themeStorageKey() {
  return state.currentUser ? `${THEME_KEY}_${userDocId(state.currentUser)}` : THEME_KEY;
}

export function getStoredTheme() {
  return localStorage.getItem(themeStorageKey()) || localStorage.getItem(THEME_KEY) || "light";
}

export function applyTheme(theme = getStoredTheme()) {
  const value = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = value;
  localStorage.setItem(themeStorageKey(), value);
  if (!state.currentUser) localStorage.setItem(THEME_KEY, value);
}

export function toggleTheme() {
  const next = getStoredTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  renderThemeToggle();
}

export function renderThemeToggle() {
  const topbar = document.querySelector(".topbar");
  if (!topbar) return;

  let button = document.getElementById("themeToggle");
  if (!button) {
    button = document.createElement("button");
    button.id = "themeToggle";
    button.type = "button";
    button.className = "theme-toggle";
    button.onclick = toggleTheme;
    topbar.appendChild(button);
  }

  button.textContent = getStoredTheme() === "dark" ? "☀️ نهاري" : "🌙 ليلي";
}

export function getDefaultAvatar(name = "") {
  const normalized = String(name || "").trim().replace(/\s+/g, " ");
  const index = [...normalized].reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATARS.length;
  return AVATARS[index] || "🌸";
}

export function getUserAvatar(user = {}) {
  return user.avatar || getDefaultAvatar(user.name || state.currentUser);
}

export function getDailyQuote(date = new Date()) {
  const dayIndex = Math.floor(startOfDay(date).getTime() / DAY_MS);
  return DAILY_QUOTES[Math.abs(dayIndex) % DAILY_QUOTES.length];
}

// Rendering
export function renderDailyQuote() {
  let box = document.getElementById("dailyQuote");
  if (!box) {
    const main = document.querySelector("main.container");
    const hero = document.querySelector(".hero, .stats-hero");
    if (!main || !hero) return;

    box = document.createElement("section");
    box.id = "dailyQuote";
    box.className = "daily-quote";
    hero.insertAdjacentElement("afterend", box);
  }

  box.innerHTML = `
    <span>اقتباس اليوم</span>
    <strong>${getDailyQuote()}</strong>
  `;
}

export function getTodayMissionSummary(data = state.cachedData) {
  const safeData = Array.isArray(data) ? data : [];
  if (safeData.length === 0) return { state: "empty", remaining: 0 };

  const done = state.currentDone || {};
  const challenges = [...new Set(safeData.map(item => Number(item.challenge || 1)))].sort((a, b) => a - b);
  const missions = challenges
    .map(challenge => {
      const todayAbsoluteDay = getTodayAbsoluteDay(challenge);
      if (todayAbsoluteDay < 1) return null;

      const items = safeData.filter(item =>
        Number(item.challenge || 1) === Number(challenge) &&
        getProgramAbsoluteDay(item) === todayAbsoluteDay
      );

      if (items.length === 0) return null;

      return {
        items,
        locked: isFutureProgramDayItems(items),
        complete: items.every(item => isDone(done[item.id])),
        allRest: items.every(item => item.type === "rest"),
        remainingWorkouts: items.filter(item => item.type !== "rest" && !isDone(done[item.id])).length
      };
    })
    .filter(Boolean);

  if (missions.length === 0) return { state: "empty", remaining: 0 };
  if (missions.every(mission => mission.locked)) return { state: "locked", remaining: 0 };

  const available = missions.filter(mission => !mission.locked);
  if (available.every(mission => mission.complete)) return { state: "complete", remaining: 0 };
  if (available.every(mission => mission.allRest)) return { state: "rest", remaining: 0 };

  const remaining = available.reduce((sum, mission) => sum + mission.remainingWorkouts, 0);
  return remaining > 0
    ? { state: "workout", remaining }
    : { state: "rest", remaining: 0 };
}

export function renderGreetingMessage(data = state.cachedData) {
  if (!state.currentUser) return;
  const main = document.querySelector("main.container");
  const anchor = document.getElementById("currentUserBar");
  if (!main || !anchor) return;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "صباح القوة" : hour < 18 ? "مساء النشاط" : "ليلة إنجاز";
  const summary = getTodayMissionSummary(data);
  const message = {
    complete: "ممتاز! مهمة اليوم مكتملة ✓",
    rest: "اليوم راحة وتعافي، استمتعي بيومك 🌸",
    locked: "مهمة اليوم لم تفتح بعد 🔒",
    empty: "لا توجد مهمة محددة اليوم، استعدي للخطوة القادمة 🌷",
    workout: summary.remaining === 1
      ? "باقي تمرين واحد وتكملين اليوم 🔥"
      : `تمارين اليوم تنتظرك: ${summary.remaining} تمارين 🔥`
  }[summary.state] || "تمارين اليوم تنتظرك 🔥";

  let box = document.getElementById("greetingMessage");
  if (!box) {
    box = document.createElement("section");
    box.id = "greetingMessage";
    box.className = "greeting-message";
    anchor.insertAdjacentElement("afterend", box);
  }

  box.innerHTML = `<strong>${greeting} يا ${escapeHtml(state.currentUser)}</strong><span>${message}</span>`;
}

export function renderSkeletonCards(target, count = 3) {
  if (!target) return;
  target.innerHTML = `
    <div class="skeleton-grid">
      ${Array.from({ length: count }).map(() => `
        <article class="skeleton-card">
          <i></i>
          <span></span>
          <b></b>
          <small></small>
        </article>
      `).join("")}
    </div>
  `;
}

export function setProgress(idPercent, idBar, percent) {
  const p = document.getElementById(idPercent);
  const b = document.getElementById(idBar);

  if (p) p.textContent = percent + "%";
  if (b) b.style.width = percent + "%";

  const card = p?.closest(".progress-card");
  if (card) {
    card.style.setProperty("--progress", `${Number(percent) * 3.6}deg`);
    let ring = card.querySelector(".mini-ring");
    if (!ring) {
      ring = document.createElement("div");
      ring.className = "mini-ring";
      ring.setAttribute("aria-hidden", "true");
      card.prepend(ring);
    }
    card.classList.toggle("is-glowing", idPercent === "commitmentPercent" && Number(percent) >= 90);
  }

  const heroRing = p?.closest(".hero-ring");
  if (heroRing) {
    heroRing.style.setProperty("--progress", `${Number(percent) * 3.6}deg`);
  }

  if (idPercent === "challengePercent") {
    const text = document.getElementById("challengePercentText");
    if (text) text.textContent = percent + "%";
  }
}

export function playDing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1175, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch (e) { }
}

export function confetti() {
  const emojis = ["🎉", "✨", "🏆", "⭐", "🔥", "💪"];
  for (let i = 0; i < 35; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti";
    piece.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.animationDelay = Math.random() * 0.4 + "s";
    piece.style.fontSize = (18 + Math.random() * 18) + "px";
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 2300);
  }
}

export function strongConfetti() {
  confetti();
  setTimeout(confetti, 240);
  setTimeout(confetti, 520);
}

export function closeCertificate() {
  document.getElementById("certificateOverlay")?.remove();
}

export function showChallengeCertificate(challenge) {
  closeCertificate();
  strongConfetti();

  const overlay = document.createElement("div");
  overlay.id = "certificateOverlay";
  overlay.className = "certificate-overlay";
  overlay.innerHTML = `
    <section class="certificate-card">
      <span class="certificate-kicker">شهادة إنجاز</span>
      <h2>مبروك يا ${state.currentUser || "بطلة"}</h2>
      <p>أكملتِ ${challengeName(challenge)} بقوة واستمرارية.</p>
      <strong>🏆 ${getProgressTitle(100)}</strong>
      <button type="button" onclick="closeCertificate()">إغلاق</button>
    </section>
  `;
  document.body.appendChild(overlay);
}

export function showPop(message, type = "success") {
  let stack = document.getElementById("popStack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "popStack";
    stack.className = "pop-stack";
    document.body.appendChild(stack);
  }

  const pop = document.createElement("div");
  pop.className = `pop-toast ${type === "error" ? "is-error" : "is-success"}`;
  pop.textContent = message;
  stack.appendChild(pop);

  requestAnimationFrame(() => pop.classList.add("is-visible"));
  setTimeout(() => {
    pop.classList.remove("is-visible");
    setTimeout(() => pop.remove(), 260);
  }, 2600);
}
