import { ensureAdminAccess } from "./adminLock.js";
import { ensureCurrentUser } from "./auth.js";
import { getData } from "./challengeMeta.js";
import { debugChallengeLock } from "./challengeMeta.js";
import { state } from "./state.js";
import {
  applyTheme,
  closeCertificate,
  renderActiveNav,
  renderDailyQuote,
  renderMotivationShowcase,
  renderSoundToggle,
  renderThemeToggle,
  toggleSoundMuted,
  toggleTheme
} from "./ui.js";
import {
  changeChallengeWeek,
  closeChallenge,
  completeProgramDay,
  initHomeTabs,
  openChallenge,
  openMissionTarget,
  renderViewer,
  toggleDone
} from "./renderIndex.js";
import {
  bindWhatsappReport
} from "./renderStats.js";
import {
  updateProgressBoard
} from "./progress.js";
import {
  debugUserDone,
  renderParticipantsBoard
} from "./participants.js";
import {
  initLeaderboardPage
} from "./leaderboard.js";
import {
  initAdminReports
} from "./adminReports.js";
import {
  initBackupExport
} from "./backup.js";
import {
  maybeShowSmartMoment,
  renderGamificationHub,
  renderInboxBadge,
  syncFirebaseInboxMessages
} from "./gamification.js";
import {
  initMessagesPage
} from "./messages.js";
import {
  initHallOfFamePage
} from "./hallOfFame.js";
import {
  initAchievementsPage
} from "./achievements.js";
import {
  initStorePage
} from "./store.js";
import {
  renderAdvancedStats
} from "./advancedStats.js";
import {
  deleteItemFromAdmin,
  editChallengeMeta,
  editItem,
  initAdmin,
  initAdminTabs,
  resetParticipantPassword
} from "./renderAdmin.js";

window.toggleDone = toggleDone;
window.editItem = editItem;
window.deleteItemFromAdmin = deleteItemFromAdmin;
window.changeChallengeWeek = changeChallengeWeek;
window.openChallenge = openChallenge;
window.closeChallenge = closeChallenge;
window.openMissionTarget = openMissionTarget;
window.editChallengeMeta = editChallengeMeta;
window.completeProgramDay = completeProgramDay;
window.resetParticipantPassword = resetParticipantPassword;
window.toggleTheme = toggleTheme;
window.toggleSoundMuted = toggleSoundMuted;
window.closeCertificate = closeCertificate;
window.debugChallengeLock = debugChallengeLock;
window.debugUserDone = debugUserDone;

async function bootstrap() {
  applyTheme();
  renderThemeToggle();
  renderSoundToggle();
  renderActiveNav();
  initHomeTabs();

  if (document.getElementById("exerciseForm")) {
    const hasAccess = await ensureAdminAccess();
    if (hasAccess) {
      initAdminTabs();
      await initAdmin();
      initAdminReports();
      initBackupExport();
    }
    return;
  }

  if (document.getElementById("leaderboardBoard")) {
    await initLeaderboardPage();
    return;
  }

  if (document.getElementById("hallPageBoard")) {
    await initHallOfFamePage();
    return;
  }

  if (document.getElementById("messagesBoard")) {
    await ensureCurrentUser();
    applyTheme();
    renderThemeToggle();
    renderSoundToggle();
    await initMessagesPage();
    await renderInboxBadge();
    return;
  }

  if (document.getElementById("achievementsBoard")) {
    await ensureCurrentUser();
    applyTheme();
    renderThemeToggle();
    renderSoundToggle();
    await initAchievementsPage();
    await renderInboxBadge();
    return;
  }

  if (document.getElementById("storeBoard")) {
    await ensureCurrentUser();
    applyTheme();
    renderThemeToggle();
    renderSoundToggle();
    await initStorePage();
    await renderInboxBadge();
    return;
  }

  if (document.getElementById("days") || document.getElementById("doneCount")) {
    renderDailyQuote();
    await ensureCurrentUser();
    applyTheme();
    renderThemeToggle();
    renderSoundToggle();
  }

  if (document.getElementById("days")) {
    await renderViewer();
    renderMotivationShowcase();
    renderGamificationHub(state.cachedData, state.cachedParticipants || []);
    await syncFirebaseInboxMessages(state.cachedData, state.cachedParticipants || []);
    maybeShowSmartMoment(state.cachedData, state.cachedParticipants || []);
  }

  if (document.getElementById("doneCount")) {
    const data = await getData();
    updateProgressBoard(data);
    renderAdvancedStats(data);
    renderMotivationShowcase(data);
    bindWhatsappReport(data);
    await renderParticipantsBoard(data);
    renderGamificationHub(data, state.cachedParticipants || []);
    await syncFirebaseInboxMessages(data, state.cachedParticipants || []);
    maybeShowSmartMoment(data, state.cachedParticipants || []);
  }
}

bootstrap();
