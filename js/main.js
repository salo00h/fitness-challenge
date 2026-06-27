import { ensureAdminAccess } from "./adminLock.js";
import { ensureCurrentUser } from "./auth.js";
import { getData } from "./challengeMeta.js";
import { debugChallengeLock } from "./challengeMeta.js";
import {
  applyTheme,
  closeCertificate,
  renderDailyQuote,
  renderThemeToggle,
  toggleTheme
} from "./ui.js";
import {
  changeChallengeWeek,
  closeChallenge,
  completeProgramDay,
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
  renderParticipantsBoard
} from "./participants.js";
import {
  deleteItemFromAdmin,
  editChallengeMeta,
  editItem,
  initAdmin,
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
window.closeCertificate = closeCertificate;
window.debugChallengeLock = debugChallengeLock;

async function bootstrap() {
  applyTheme();
  renderThemeToggle();

  if (document.getElementById("exerciseForm")) {
    const hasAccess = await ensureAdminAccess();
    if (hasAccess) await initAdmin();
    return;
  }

  if (document.getElementById("days") || document.getElementById("doneCount")) {
    renderDailyQuote();
    await ensureCurrentUser();
    applyTheme();
    renderThemeToggle();
  }

  if (document.getElementById("days")) {
    await renderViewer();
  }

  if (document.getElementById("doneCount")) {
    const data = await getData();
    updateProgressBoard(data);
    bindWhatsappReport(data);
    await renderParticipantsBoard(data);
  }
}

bootstrap();
