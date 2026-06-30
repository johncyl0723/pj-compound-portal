const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {FieldValue, getFirestore} = require("firebase-admin/firestore");

initializeApp();

const REGION = "asia-east1";
const callableOptions = {
  region: REGION,
  invoker: "public",
};
const BOOTSTRAP_ADMIN_EMAILS = new Set([
  "john.cyl@gmail.com",
]);

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isBootstrapAdmin(request) {
  return BOOTSTRAP_ADMIN_EMAILS.has(normalizeEmail(request?.auth?.token?.email));
}

function assertAdmin(request) {
  if (!request.auth ||
    (request.auth.token.admin !== true && !isBootstrapAdmin(request))) {
    throw new HttpsError("permission-denied", "只有管理員可以執行這項操作。");
  }
}

function normalizeCode(value) {
  const code = String(value || "").trim().toUpperCase();
  if (!/^(PS|CS)\d{3}$/.test(code)) {
    throw new HttpsError("invalid-argument", "股東戶號格式不正確。");
  }
  return code;
}

function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 6) {
    throw new HttpsError("invalid-argument", "密碼至少需要 6 碼。");
  }
  return password;
}

function shareholderEmail(code) {
  return `${code.toLowerCase()}@pjcompound.internal`;
}

function serializeValue(value) {
  if (value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, serializeValue(entry)]),
    );
  }
  return value ?? null;
}

function serializeDoc(doc) {
  return {id: doc.id, ...serializeValue(doc.data())};
}

async function getShareholderAdminPayload(monthId) {
  const db = getFirestore();
  const shareholdersSnap = await db.collection("shareholders").get();
  const draftsSnap = await db.collection("shareholderDrafts").get();
  const shareholders = shareholdersSnap.docs
      .map(serializeDoc)
      .sort((a, b) => String(a.shareholderCode || "").localeCompare(String(b.shareholderCode || "")));
  const drafts = draftsSnap.docs
      .map(serializeDoc)
      .sort((a, b) => String(a.shareholderCode || "").localeCompare(String(b.shareholderCode || "")));

  const statements = [];
  if (monthId) {
    await Promise.all(shareholders.map(async (shareholder) => {
      const statementDoc = await db.collection("statements")
          .doc(shareholder.uid || shareholder.id)
          .collection("months")
          .doc(monthId)
          .get();
      if (statementDoc.exists) {
        statements.push({
          uid: shareholder.uid || shareholder.id,
          ...serializeDoc(statementDoc),
        });
      }
    }));
    statements.sort((a, b) => String(a.shareholderCode || "").localeCompare(String(b.shareholderCode || "")));
  }

  return {shareholders, drafts, statements};
}

async function getPortalAdminPayload() {
  const db = getFirestore();
  const [reportsSnap, topicsSnap, categoriesSnap] = await Promise.all([
    db.collection("portalMonthlyReports").get(),
    db.collection("portalTopics").get(),
    db.collection("portalCategories").get(),
  ]);
  const reports = reportsSnap.docs
      .map(serializeDoc)
      .filter((entry) => entry.active !== false)
      .sort((a, b) => String(b.id || "").localeCompare(String(a.id || "")));
  const topics = topicsSnap.docs
      .map(serializeDoc)
      .sort((a, b) => (a.order || 999) - (b.order || 999) ||
        String(a.title || "").localeCompare(String(b.title || "")));
  const categories = categoriesSnap.docs
      .map((doc) => ({key: doc.id, ...serializeValue(doc.data())}))
      .sort((a, b) => (a.order || 999) - (b.order || 999) ||
        String(a.name || "").localeCompare(String(b.name || "")));
  return {reports, topics, categories};
}

async function getPortalAnnouncementsPayload() {
  const db = getFirestore();
  const announcementsSnap = await db.collection("portalAnnouncements").get();
  const announcements = announcementsSnap.docs
      .map(serializeDoc)
      .sort((a, b) =>
        String(b.noticeDate || "").localeCompare(String(a.noticeDate || "")) ||
        String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return {announcements};
}

exports.approveShareholder = onCall(callableOptions, async (request) => {
  assertAdmin(request);
  const code = normalizeCode(request.data.shareholderCode);
  const password = validatePassword(request.data.password);
  const draftRef = getFirestore().collection("shareholderDrafts").doc(code);
  const draft = await draftRef.get();
  if (!draft.exists) {
    throw new HttpsError("not-found", "找不到這筆股東草稿。");
  }
  const displayName = String(draft.data().displayName || "").trim();
  if (!displayName) {
    throw new HttpsError("failed-precondition", "請先填寫股東姓名。");
  }

  let user;
  try {
    user = await getAuth().createUser({
      email: shareholderEmail(code),
      password,
      displayName,
      disabled: false,
    });
    await getFirestore().collection("shareholders").doc(user.uid).set({
      shareholderCode: code,
      displayName,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await draftRef.delete();
    return {uid: user.uid, shareholderCode: code};
  } catch (error) {
    if (user) await getAuth().deleteUser(user.uid);
    if (error.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", `${code} 已經建立過 Firebase 帳號。`);
    }
    throw error;
  }
});

exports.setShareholderPassword = onCall(callableOptions, async (request) => {
  assertAdmin(request);
  const uid = String(request.data.uid || "").trim();
  const password = validatePassword(request.data.password);
  if (!uid) throw new HttpsError("invalid-argument", "缺少股東 UID。");
  await getAuth().updateUser(uid, {password});
  await getFirestore().collection("shareholders").doc(uid).update({
    updatedAt: FieldValue.serverTimestamp(),
  });
  return {uid};
});

exports.setShareholderActive = onCall(callableOptions, async (request) => {
  assertAdmin(request);
  const uid = String(request.data.uid || "").trim();
  const active = request.data.active;
  if (!uid || typeof active !== "boolean") {
    throw new HttpsError("invalid-argument", "股東狀態資料不完整。");
  }
  await getAuth().updateUser(uid, {disabled: !active});
  await getFirestore().collection("shareholders").doc(uid).update({
    active,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return {uid, active};
});

exports.getShareholderAdminData = onCall(callableOptions, async (request) => {
  assertAdmin(request);
  const monthId = String(request.data.monthId || "").trim();
  return await getShareholderAdminPayload(monthId);
});

exports.getPortalAdminData = onCall(callableOptions, async (request) => {
  assertAdmin(request);
  return await getPortalAdminPayload();
});

exports.getPortalAnnouncementsAdminData = onCall(callableOptions, async (request) => {
  assertAdmin(request);
  return await getPortalAnnouncementsPayload();
});

exports.savePortalAnnouncement = onCall(callableOptions, async (request) => {
  assertAdmin(request);
  const id = String(request.data.id || "").trim();
  const noticeDate = String(request.data.noticeDate || "").trim();
  const message = String(request.data.message || "").trim();
  const active = request.data.active;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(noticeDate)) {
    throw new HttpsError("invalid-argument", "請提供正確的公告日期。");
  }
  if (!message) {
    throw new HttpsError("invalid-argument", "請提供公告內容。");
  }
  if (typeof active !== "boolean") {
    throw new HttpsError("invalid-argument", "請提供公告啟用狀態。");
  }

  const db = getFirestore();
  const ref = id ?
    db.collection("portalAnnouncements").doc(id) :
    db.collection("portalAnnouncements").doc();
  const payload = {
    noticeDate,
    message,
    active,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (id) {
    await ref.set(payload, {merge: true});
  } else {
    await ref.set({
      ...payload,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  return {id: ref.id};
});

exports.setPortalAnnouncementActive = onCall(callableOptions, async (request) => {
  assertAdmin(request);
  const id = String(request.data.id || "").trim();
  const active = request.data.active;
  if (!id || typeof active !== "boolean") {
    throw new HttpsError("invalid-argument", "請提供正確的公告參數。");
  }
  await getFirestore().collection("portalAnnouncements").doc(id).set({
    active,
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  return {id, active};
});

exports.deletePortalAnnouncement = onCall(callableOptions, async (request) => {
  assertAdmin(request);
  const id = String(request.data.id || "").trim();
  if (!id) {
    throw new HttpsError("invalid-argument", "請提供要刪除的公告編號。");
  }
  await getFirestore().collection("portalAnnouncements").doc(id).delete();
  return {id};
});
