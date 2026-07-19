/**
 * Migration: participants (القديمة، مبنية على الاسم) -> legacy-participants
 * (نسخة مجردة من passwordHash) حتى تستطيع واجهة الموقع (js/auth.js) "استعادة"
 * تقدم كل مشاركة أول مرة تُنشئ فيها حساب Firebase Authentication حقيقي بنفس اسمها.
 *
 * هذا السكربت لا يفعل أيًا مما يلي أبدًا:
 *   - لا يُنشئ أو يُعدّل أي مستخدم في Firebase Authentication.
 *   - لا يحذف أو يُعدّل وثائق participants/{id} الأصلية (تبقى نسخة احتياطية دائمة).
 *   - لا يحتوي أو يقرأ أي سر/مفتاح مباشرة - يعتمد على GOOGLE_APPLICATION_CREDENTIALS.
 *
 * الاستخدام:
 *   cd scripts
 *   npm install
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node migrate-users-to-auth.js --dry-run
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node migrate-users-to-auth.js
 *
 * على PowerShell:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\service-account.json"
 *   node migrate-users-to-auth.js --dry-run
 *
 * السكربت Idempotent: تشغيله عدة مرات آمن، أي وثيقة سبق ترحيلها تُتخطى.
 */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const PROJECT_ID = "fitness-challenge-6061e";
const PARTICIPANTS_COLLECTION = "participants";
const LEGACY_COLLECTION = "legacy-participants";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function initAdmin() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error("خطأ: يجب ضبط متغير البيئة GOOGLE_APPLICATION_CREDENTIALS ليشير إلى ملف Service Account JSON.");
    console.error('مثال (bash): GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node migrate-users-to-auth.js --dry-run');
    console.error('مثال (PowerShell): $env:GOOGLE_APPLICATION_CREDENTIALS="./service-account.json"; node migrate-users-to-auth.js --dry-run');
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: PROJECT_ID
  });
}

function backupParticipants(docs) {
  const backupDir = path.join(__dirname, "backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const file = path.join(backupDir, `participants-backup-${timestamp()}.json`);
  fs.writeFileSync(file, JSON.stringify(docs, null, 2), "utf8");
  console.log(`✔ تم حفظ نسخة احتياطية كاملة (${docs.length} وثيقة) في: ${file}`);
  return file;
}

// لا نحمل passwordHash ولا أي حقل متعلق بكلمة المرور القديمة إلى legacy-participants.
function stripPrivateFields(data) {
  const {
    passwordHash,
    passwordCreatedAt,
    passwordChangedAt,
    passwordResetAt,
    ...safe
  } = data;
  return safe;
}

async function migrate() {
  initAdmin();
  const db = admin.firestore();

  console.log(isDryRun ? "== Dry run: لن تُكتب أي بيانات فعليًا ==" : "== تنفيذ فعلي ==");

  const snap = await db.collection(PARTICIPANTS_COLLECTION).get();
  const docs = snap.docs.map(d => ({ id: d.id, data: d.data() }));

  if (docs.length === 0) {
    console.log("لا توجد وثائق في participants. لا شيء لعمل Migration له.");
    return;
  }

  backupParticipants(docs.map(d => ({ id: d.id, ...d.data })));

  const results = { migrated: 0, skipped: 0, errors: 0 };

  for (const { id, data } of docs) {
    try {
      if (!data || !data.name) {
        console.warn(`- تخطي ${id}: لا يوجد حقل name صالح`);
        results.skipped++;
        continue;
      }

      const legacyRef = db.collection(LEGACY_COLLECTION).doc(id);
      const existing = await legacyRef.get();

      if (existing.exists) {
        console.log(`- تخطي ${id}: موجودة بالفعل في legacy-participants (idempotent)`);
        results.skipped++;
        continue;
      }

      const safeData = stripPrivateFields(data);
      const payload = {
        ...safeData,
        migratedFromParticipantsId: id,
        migratedAt: new Date().toISOString(),
        claimedBy: null
      };

      if (isDryRun) {
        console.log(`- [DRY RUN] سيتم إنشاء legacy-participants/${id} بالحقول: ${Object.keys(payload).join(", ")}`);
      } else {
        await legacyRef.set(payload, { merge: true });
        console.log(`✔ تم نقل ${id} إلى legacy-participants (بدون passwordHash)`);
      }

      results.migrated++;
    } catch (e) {
      console.error(`✗ خطأ أثناء معالجة ${id}:`, e.message);
      results.errors++;
    }
  }

  console.log("\n== ملخص ==");
  console.table(results);

  if (!isDryRun) {
    console.log("\nتنبيه: الوثائق الأصلية في participants/ لم تُحذف ولم تُعدَّل - تبقى نسخة احتياطية دائمة.");
    console.log("الخطوة التالية: كل مشاركة تفتح الموقع وتُنشئ حساب Firebase Auth بنفس اسمها القديم");
    console.log("(تبويب \"حساب جديد\" في شاشة الدخول) - سيستعيد الموقع تقدمها تلقائيًا من legacy-participants.");
  }
}

migrate()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("فشل السكربت:", err);
    process.exit(1);
  });
