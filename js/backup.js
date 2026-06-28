import { collection, db, getDocs } from "./firebase.js";
import { COLLECTION_NAME, USERS_COLLECTION, CHALLENGE_META_TYPE } from "./constants.js";
import { showPop } from "./ui.js";

function exportDateStamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function fetchCollectionDocs(collectionName) {
  const snap = await getDocs(collection(db, collectionName));
  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

async function fetchExercisesSplit() {
  const docs = await fetchCollectionDocs(COLLECTION_NAME);

  return {
    exercises: docs.filter(item => item.type !== CHALLENGE_META_TYPE),
    challengeMeta: docs.filter(item => item.type === CHALLENGE_META_TYPE)
  };
}

export async function exportExercisesJson() {
  const { exercises } = await fetchExercisesSplit();
  downloadJson(`fitness-exercises-${exportDateStamp()}.json`, exercises);
}

export async function exportParticipantsJson() {
  const participants = await fetchCollectionDocs(USERS_COLLECTION);
  downloadJson(`fitness-participants-${exportDateStamp()}.json`, participants);
}

export async function exportFullBackupJson() {
  const [{ exercises, challengeMeta }, participants] = await Promise.all([
    fetchExercisesSplit(),
    fetchCollectionDocs(USERS_COLLECTION)
  ]);

  downloadJson(`fitness-full-backup-${exportDateStamp()}.json`, {
    exportedAt: new Date().toISOString(),
    exercises,
    participants,
    "challenge-meta": challengeMeta
  });
}

export function initBackupExport() {
  const box = document.getElementById("backupExportPanel");
  if (!box) return;

  const buttons = [
    {
      id: "exportExercisesJson",
      action: exportExercisesJson,
      success: "تم تصدير التمارين"
    },
    {
      id: "exportParticipantsJson",
      action: exportParticipantsJson,
      success: "تم تصدير المشاركات"
    },
    {
      id: "exportFullBackupJson",
      action: exportFullBackupJson,
      success: "تم تصدير النسخة الكاملة"
    }
  ];

  buttons.forEach(item => {
    const button = document.getElementById(item.id);
    if (!button) return;

    button.onclick = async () => {
      const original = button.textContent;
      button.disabled = true;
      button.textContent = "جاري التصدير...";

      try {
        await item.action();
        showPop(item.success);
      } catch (e) {
        showPop("تعذر تصدير ملف JSON", "error");
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    };
  });
}
