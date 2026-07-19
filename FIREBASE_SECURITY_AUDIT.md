# تدقيق أمني شامل — Fitness Challenge (fitness-challenge-6061e)

تاريخ التدقيق: 2026-07-19
حالة المشروع وقت التدقيق: Firestore في **Test Mode** (كل القراءة/الكتابة مفتوحة لأي شخص حتى تاريخ الانتهاء).

تم فحص كل ملفات `js/*.js` وكل استدعاءات `collection / doc / getDoc / getDocs / setDoc / deleteDoc / updateDoc / addDoc`، بالإضافة إلى تشغيل فحص **حي للقراءة فقط** (بدون أي كتابة) ضد قاعدة البيانات الفعلية لتأكيد الثغرات وليس افتراضها.

---

## 1) Collections الموجودة فعليًا

| Collection | الغرض | شكل مفتاح الوثيقة (Document ID) الحالي |
|---|---|---|
| `exercises` | تمارين البرنامج + وثائق "بيانات التحدي" (نوع خاص) | معرّف عشوائي `uid()` للتمارين، و `challenge_meta_{n}` لبيانات التحدي |
| `participants` | حساب كل مشاركة: الاسم، الصورة الرمزية، **passwordHash**، `done{}`، `lastLoginAt` | `encodeURIComponent(name.toLowerCase())` — **مبني بالكامل على النص القادم من العميل** |
| `notifications` | إشعارات/رسائل داخل التطبيق لكل مشاركة | `` `${userDocId}__${messageId}` `` |
| `game-state` | جواهر، XP إضافية، عناصر مفتوحة، عجلة الحظ اليومية | `userDocId(name)` |

لا توجد Collections أخرى مستخدمة حاليًا في `js/*`. ملاحظة: يوجد ملف `app.js` في جذر المشروع (نسخة قديمة أحادية الملف) يحتوي نفس firebaseConfig لكنه **غير مرتبط بأي صفحة HTML حاليًا** (تم التأكد بالفحص) — كود ميت، لا يشكل خطرًا تشغيليًا لكنه يستحق الحذف لاحقًا لتقليل الالتباس.

### شكل الوثائق (مبني من القراءة الفعلية للكود + عيّنة حية من القاعدة):

```
participants/{urlencoded(name.lower())}
{
  name, avatar,
  passwordHash,          // SHA-256 hex — يُنشأ ويُتحقق منه بالكامل في المتصفح
  passwordCreatedAt, passwordChangedAt, passwordResetAt,
  lastLoginAt,
  done: { [exerciseId]: true | { completed, completedAt, migratedFromLegacy } },
  updatedAt
}

exercises/{id}                      // تمرين عادي
{ id, title, challenge, week, programDay, duration, type, youtube, notes }

exercises/challenge_meta_{n}         // بيانات تحدٍ
{ id, type:"challenge-meta", challenge, image, imageX, imageY, imageZoom, startDate, description, updatedAt }

notifications/{uid}__{msgId}
{ id, docId, userId, userName, type, title, body, priority, createdAt, updatedAt, day, read, archived }

game-state/{userId}
{ userId, userName, gems, bonusXp, unlockedItems[], spins:{date:reward}, updatedAt }
```

---

## 2) التحقق الحي (قراءة فقط، لم يتم أي تعديل على القاعدة)

تم تشغيل الموقع محليًا (خادم ثابت بدون أي سيرفر خلفي) وتنفيذ استعلامات قراءة فقط من console المتصفح ضد مشروع Firebase الحقيقي:

- **مؤكد:** `getDocs(collection(db,'participants'))` بدون أي تسجيل دخول يُعيد الوثيقتين الكاملتين لـ "صفاء" و"🌸Sahar" **بما فيها حقل `passwordHash`** (SHA-256 كامل). أي زائر لأي صفحة HTML (index / stats / leaderboard / hall) يجلب هذا في الخلفية.
- **مؤكد:** بنية `exercises` تحتوي فعليًا تحديين × 3 أسابيع × 7 أيام = 42 وثيقة (21 لكل تحدٍ) — يفسر لماذا كانت الأرقام القديمة المُبلّغ عنها بصيغة "1 / 21".
- **تم فحص خطأ "الأسبوع الأول 0%" لصفاء تحديدًا (بيانات حية):**
  - `debugUserDone('صفاء')` الآن: `23/42 (55%)`, أسابيع مكتملة = 3, **لا توجد أي سجلات "early completion" محذوفة أو مرفوضة**.
  - `debugUserDone('🌸Sahar')`: `27/42 (64%)`, أسابيع مكتملة = 3.
  - الكود الحالي في `progress.js` (`sanitizeDoneRecords` = `upgradeLegacyDoneRecords`) **لا يحذف أي سجل إطلاقًا** — فقط "يُرقّي" السجلات القديمة (`true` → object). ودالة `isEarlyCompletionRecord` تستثني صراحة الأسبوع الأول (`if (itemWeek(item) === 1) return false;`).
  - الحقل التشخيصي `wouldHaveBeenRemovedByOldBug` (والذي يحسب ماذا كانت ستفعله نسخة قديمة افتراضية من sanitize) يساوي `3` لسحر و`0` لصفاء — أي أن **الكود الحالي يحتوي بالفعل على استثناء واقٍ من هذا الخطأ**، ولا يبدو أن الخطأ قابل لإعادة الإنتاج على البيانات الحيّة الحالية أو على الكود الحالي.
  - **الخلاصة:** الخطأ المذكور في الطلب (١/٢١، ٥٪، الأسبوع الأول ٠٪) غير موجود حاليًا في البيانات الحية ولا في الكود الحالي — يبدو أنه أُصلح ضمن تعديل سابق (commit `c560faa "fix index"`). سيتم مع ذلك تطبيق تحصين إضافي (مفتاح `done` محلي خاص بكل UID) كخط دفاع ثانٍ (تفصيل في القسم 9 من ملف الإعداد).

---

## 3) الثغرات المكتشفة (مرتبة حسب الخطورة)

### 🔴 حرجة — 1: انتحال هوية مشاركة أخرى بالكامل
أي متصفح (حتى بدون فتح الموقع نفسه) يستطيع تنفيذ:
```js
setDoc(doc(db, "participants", "%F0%9F%8C%B8sahar"), { done: {...}, passwordHash: "" }, { merge: true })
```
لأن **لا يوجد أي تحقق من الهوية على مستوى الخادم** — `state.currentUser` مجرد نص من `localStorage`، ولا تستخدم أي Firebase Authentication حقيقية. Test Mode الحالي يسمح بهذا فعليًا الآن، وليس فقط بعد انتهاء الصلاحية.

### 🔴 حرجة — 2: تسريب `passwordHash` لكل زائر
`getDocs(collection(db,'participants'))` تُستخدم في 5 أماكن مختلفة (`leaderboard.js`, `participants.js`, `renderIndex.js`, `renderAdmin.js`, `gamification.js` عبر `state.cachedParticipants`) وتجلب **الوثيقة كاملة** بما فيها `passwordHash` إلى متصفح كل زائر، حتى في صفحات لا تحتاج كلمة المرور إطلاقًا (لوحة الترتيب، Hall of Fame). SHA-256 بدون Salt قابل لكسره عبر Rainbow Tables لكلمات مرور قصيرة (الحد الأدنى الحالي 4 أحرف فقط).

### 🔴 حرجة — 3: حماية admin.html وهمية بالكامل
`ADMIN_PASSWORD = "1234"` ثابت في `constants.js` يُشحن لكل متصفح، ويُتحقق منه بالكامل في JavaScript، ويُخزَّن القبول في `sessionStorage` فقط. **لا علاقة لهذا بقواعد Firestore** — أي شخص يفتح Console ويستدعي `saveExercise(...)`, `deleteExercise(...)`, `saveChallengeMeta(...)`, أو `resetParticipantPassword(...)` مباشرة (بدون المرور بشاشة كلمة السر أصلًا) ينفّذها بنجاح تام في Test Mode الحالي.

### 🟠 عالية — 4: أي مشاركة تستطيع تعديل تقدّم مشاركة أخرى
بما أن معرف الوثيقة هو الاسم فقط، وأي `setDoc` مسموح حاليًا، تستطيع أي مشاركة (بقصد أو خطأ برمجي في الواجهة) الكتابة فوق `done` أو `avatar` لمشاركة أخرى بمجرد معرفة اسمها.

### 🟠 عالية — 5: عدم وجود حد لكتابة `game-state` (gems/bonusXp)
`economy.js` يقرأ ويكتب `game-state/{userId}` مباشرة من العميل بدون أي تحقق من صحة العمليات (لف العجلة مرة واحدة يوميًا هو تحقق **من جهة العميل فقط**؛ يمكن استدعاء `saveGameState` مباشرة بأي قيمة `gems`/`bonusXp`).

### 🟡 متوسطة — 6: `notifications` قابلة للانتحال
`pushUserNotification` تكتب `userId: currentUserKey()` بدون أي تحقق خادمي أن الكاتب هو صاحب هذا المعرف — حاليًا (Test Mode) يمكن لأي طرف إنشاء إشعارات باسم أي مستخدم آخر أو حذف/أرشفة رسائل ليست له.

### 🟡 متوسطة — 7: تخزين محلي عام غير مرتبط بحساب
`DONE_KEY = "fitness_program_done_v1"` (وبالمثل مفاتيح `game-state`/`inbox` المحلية) **لا تحمل اسم/معرف المستخدم** ضمن مفتاح `localStorage` الأساسي بشكل كافٍ لمنع التلوث عند تسجيل خروج مستخدمة ودخول أخرى على نفس المتصفح قبل اكتمال أول مزامنة (`saveDone` يُستدعى فور الدخول، لكن يوجد نافذة زمنية قصيرة نظريًا). تم تحويلها إلى مفاتيح خاصة بكل UID (تفصيل في ملف الإعداد).

### 🟢 منخفضة — 8: `app.js` كود ميت يحتوي نسخة مكررة من إعدادات Firebase
غير مستخدم من أي صفحة، لكنه يزيد سطح الالتباس عند القراءة المستقبلية للمشروع.

---

## 4) مصفوفة الصلاحيات المطلوبة (بعد الحل)

| العملية | زائرة (غير مسجلة) | مشاركة مسجلة | صاحبة الحساب | Admin |
|---|---|---|---|---|
| قراءة `exercises` | ✅ (تصميم القراءة العامة مطلوب لإبقاء لوحة الترتيب/Hall تعمل بدون تسجيل، لا بيانات حساسة فيها) | ✅ | ✅ | ✅ |
| كتابة `exercises` / بيانات التحدي | ❌ | ❌ | ❌ | ✅ فقط |
| قراءة `public-profiles/*` (اسم/صورة/إحصائيات علنية) | ✅ | ✅ | ✅ | ✅ |
| كتابة `public-profiles/{uid}` | ❌ | ❌ | ✅ لوثيقتها فقط، وحقول محددة | ✅ |
| قراءة/كتابة `participants/{uid}` (بيانات خاصة كاملة) | ❌ | ❌ | ✅ لوثيقتها فقط | ✅ لأي وثيقة |
| قراءة `legacy-participants/*` (بدون passwordHash، لغرض الترحيل فقط) | ❌ | ✅ (لإيجاد بياناتها القديمة عند أول دخول) | — | ✅ |
| تحديث `legacy-participants/{id}.claimedBy` (مرة واحدة فقط) | ❌ | ✅ لنفسها فقط، وإذا لم تُطالَب مسبقًا | — | ✅ |
| `notifications` | ❌ | قراءة/تعديل إشعاراتها فقط | ✅ | ✅ لأي مشاركة |
| `game-state/{uid}` | ❌ | قراءة/كتابة وثيقتها فقط | ✅ | ✅ للقراءة |
| `roles/{uid}` | ❌ | قراءة وثيقتها فقط (لمعرفة هل هي Admin) | — | لا كتابة من العميل إطلاقًا (Console/Admin SDK فقط) |

---

## 5) القرار المعماري (تفصيل المقارنة في FIREBASE_SECURITY_SETUP.md)

تم اختيار: **Firebase Authentication (Email/Password) + `roles/{uid}` للتمييز الإداري + فصل `public-profiles` عن `participants`**، بدون أي Cloud Functions إلزامية (مع توضيح أين تبقى الحماية الكاملة للاقتصاد الداخلي (gems/XP) بحاجة فعلية لـ Cloud Function مستقبلًا). السبب الكامل والمقارنة بين كل الخيارات (A–F) موجودة في `FIREBASE_SECURITY_SETUP.md`.
