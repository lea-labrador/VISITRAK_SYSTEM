import { getAdmin } from "../server/firebaseAdmin.js";
import {
  ensureAuthUser,
  hashOfficePassword,
  isValidPassword,
  verifyOfficePassword,
} from "../server/officeCredentials.js";

/* global process */

const setCors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

const normalizeUsername = (username = "") => username.trim().toLowerCase();
const USERNAME_REGEX = /^[a-z0-9][a-z0-9._-]{2,30}[a-z0-9]$/;
const REQUEST_COOLDOWN_MS = 400;
const requesterLastSeen = new Map();

const isQuotaExceededError = (error) => {
  const code = String(error?.code || "").trim().toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "resource-exhausted" ||
    code === "8" ||
    message.includes("resource_exhausted") ||
    message.includes("quota exceeded")
  );
};

const getRequesterKey = (req) => {
  const ip =
    req.headers["x-forwarded-for"] ||
    req.connection?.remoteAddress ||
    "unknown";
  return String(ip).split(",")[0].trim();
};

const canProceed = (key) => {
  const now = Date.now();
  const previous = requesterLastSeen.get(key) || 0;
  if (now - previous < REQUEST_COOLDOWN_MS) return false;
  requesterLastSeen.set(key, now);
  return true;
};

const invalidCredentials = (res) =>
  res.status(401).json({
    success: false,
    message: "Invalid username or password.",
  });

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed.",
    });
  }

  try {
    const requesterKey = getRequesterKey(req);
    if (!canProceed(requesterKey)) {
      return res.status(429).json({
        success: false,
        message: "Too many attempts. Please try again shortly.",
      });
    }

    const usernameNormalized = normalizeUsername(req.body?.username || "");
    const password = String(req.body?.password || "");

    if (!USERNAME_REGEX.test(usernameNormalized) || !isValidPassword(password, 1)) {
      return invalidCredentials(res);
    }

    const admin = await getAdmin();
    const db = admin.firestore();

    const officeSnapshot = await db
      .collection("offices")
      .where("usernameNormalized", "==", usernameNormalized)
      .limit(5)
      .get();

    let officeDoc =
      officeSnapshot.docs.find((doc) => (doc.data()?.role || "office") === "office") ||
      null;

    // Fallback for legacy documents that do not have usernameNormalized.
    if (!officeDoc) {
      const legacySnapshot = await db
        .collection("offices")
        .where("username", "==", usernameNormalized)
        .limit(5)
        .get();
      officeDoc =
        legacySnapshot.docs.find((doc) => (doc.data()?.role || "office") === "office") ||
        null;
    }

    if (!officeDoc) {
      return invalidCredentials(res);
    }
    const officeData = officeDoc.data() || {};

    if (officeData.status === "inactive") {
      return res.status(403).json({
        success: false,
        message: "Account is inactive.",
      });
    }

    let passwordVerified = verifyOfficePassword(password, officeData);
    let migrateLegacyPassword = false;

    if (!passwordVerified) {
      const legacyPassword = String(officeData.password || "");
      if (legacyPassword && legacyPassword === password) {
        passwordVerified = true;
        migrateLegacyPassword = true;
      }
    }

    if (!passwordVerified) {
      return invalidCredentials(res);
    }

    const uid = String(officeData.uid || officeDoc.id);
    await ensureAuthUser({
      admin,
      uid,
      role: "office",
      displayName: officeData.name || officeData.officialName || "Office User",
      disabled: false,
      email: null,
    });

    const customToken = await admin.auth().createCustomToken(uid, { role: "office" });
    const updatePayload = {
      uid,
      email: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (
      migrateLegacyPassword ||
      !officeData.credentialHash ||
      !officeData.credentialSalt
    ) {
      Object.assign(updatePayload, hashOfficePassword(password), {
        credentialAlgo: admin.firestore.FieldValue.delete(),
        credentialIterations: admin.firestore.FieldValue.delete(),
        credentialKeyLength: admin.firestore.FieldValue.delete(),
        credentialUpdatedAt: admin.firestore.FieldValue.delete(),
        password: admin.firestore.FieldValue.delete(),
      });
    }

    await officeDoc.ref.set(updatePayload, { merge: true });

    return res.status(200).json({
      success: true,
      customToken,
      uid,
      role: "office",
      username: officeData.username || usernameNormalized,
      officeId: officeDoc.id,
    });
  } catch (error) {
    const message = String(error?.message || "");
    const code = String(error?.code || "");
    const isQuotaError = isQuotaExceededError(error);
    const isConfigError =
      message.includes("Firebase Admin credentials") ||
      message.includes("Firebase Admin environment variables") ||
      message.includes("Invalid PEM formatted message");
    const isIndexError =
      code === "failed-precondition" ||
      message.toLowerCase().includes("index");
    const statusCode = isQuotaError ? 503 : 500;

    const userMessage = isConfigError
      ? "Server Firebase Admin configuration is invalid. Please verify Vercel Firebase Admin environment variables."
      : isQuotaError
        ? "Firestore quota is temporarily exhausted. Please try again later."
      : isIndexError
        ? "A required Firestore index is missing for office login."
        : "Unable to log in right now.";

    return res.status(statusCode).json({
      success: false,
      message: userMessage,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}
