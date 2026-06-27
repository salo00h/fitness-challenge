import { ADMIN_PASSWORD, ADMIN_SESSION_KEY } from "./constants.js";
import { showPop } from "./ui.js";

// Admin Lock
export function isAdminUnlocked() {
  try {
    return sessionStorage.getItem(ADMIN_SESSION_KEY) === "yes";
  } catch (e) {
    return false;
  }
}

export function setAdminUnlocked() {
  try {
    sessionStorage.setItem(ADMIN_SESSION_KEY, "yes");
  } catch (e) { }
}

export function ensureAdminAccess() {
  return new Promise(resolve => {
    if (!document.getElementById("exerciseForm")) {
      resolve(true);
      return;
    }

    if (isAdminUnlocked()) {
      document.body.classList.remove("admin-locked");
      resolve(true);
      return;
    }

    document.body.classList.add("admin-locked");

    const overlay = document.createElement("div");
    overlay.id = "adminLoginOverlay";
    overlay.className = "admin-login-overlay";
    overlay.innerHTML = `
      <form class="admin-login-card">
        <div class="login-icon">🔐</div>
        <h2>دخول الإعدادات</h2>
        <p>اكتبي كلمة المرور لفتح صفحة الإعدادات.</p>
        <input id="adminPasswordInput" type="password" autocomplete="current-password" placeholder="كلمة المرور" required>
        <div id="adminPasswordError" class="admin-login-error"></div>
        <button type="submit">فتح الإعدادات</button>
      </form>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector("form").addEventListener("submit", e => {
      e.preventDefault();
      const input = document.getElementById("adminPasswordInput");
      const error = document.getElementById("adminPasswordError");

      if (input.value === ADMIN_PASSWORD) {
        setAdminUnlocked();
        document.body.classList.remove("admin-locked");
        overlay.remove();
        showPop("تم فتح صفحة الإعدادات بنجاح");
        resolve(true);
        return;
      }

      if (error) error.textContent = "كلمة المرور غير صحيحة";
      showPop("كلمة المرور غير صحيحة", "error");
      input.select();
    });

    setTimeout(() => document.getElementById("adminPasswordInput")?.focus(), 50);
  });
}
