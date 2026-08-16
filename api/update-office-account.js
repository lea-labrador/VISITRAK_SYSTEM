import { getAdmin } from "../server/firebaseAdmin.js";
import { ensureAuthUser, hashOfficePassword } from "../server/officeCredentials.js";

const setCors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

const getBearerToken = (req) => {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7);
};

const normalizeEmail = (email = "") => email.trim().toLowerCase();
const normalizeUsername = (username = "") => username.trim().toLowerCase();
const normalizeList = (value) => (Array.isArray(value) ? value : []);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-z0-9][a-z0-9._-]{2,30}[a-z0-9]$/;
const isValidUsername = (value) =>
  typeof value === "string" && USERNAME_REGEX.test(normalizeUsername(value));

const ensureUsernameAvailable = async (db, usernameNormalized, excludeId) => {
  const existingUsername = await db
    .collection("offices")
    .where("usernameNormalized", "==", usernameNormalized)
    .limit(5)
    .get();

  if (existingUsername.empty) return true;

  return existingUsername.docs.every((doc) => doc.id === excludeId);
};

const getAuthUser = async (admin, uid) => {
  const cleanUid = String(uid || "").trim();
  if (!cleanUid) return null;

  try {
    return await admin.auth().getUser(cleanUid);
  } catch (error) {
    if (String(error?.code || "") === "auth/user-not-found") return null;
    throw error;
  }
};

const getAuthUserByEmail = async (admin, email) => {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;

  try {
    return await admin.auth().getUserByEmail(cleanEmail);
  } catch (error) {
    if (String(error?.code || "") === "auth/user-not-found") return null;
    throw error;
  }
};

const resolveAuthUid = async (admin, { id, existing, role }) => {
  if (role !== "super") return existing.uid || id;

  const uidCandidates = [existing.uid, id];
  for (const uid of uidCandidates) {
    const user = await getAuthUser(admin, uid);
    if (user) return user.uid;
  }

  const userByExistingEmail = await getAuthUserByEmail(admin, existing.email);
  return userByExistingEmail?.uid || existing.uid || id;
};

const ensureSuperRequester = async (admin, db, req) => {
  const token = getBearerToken(req);
  if (!token) throw new Error("Missing bearer token");

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch (error) {
    const code = String(error?.code || "");
    const message = String(error?.message || "");
    const isTokenError =
      code.startsWith("auth/") ||
      message.includes("ID token") ||
      message.includes("argument") ||
      message.includes("token");

    if (isTokenError) {
      throw new Error("Invalid bearer token");
    }
    throw error;
  }
  if (decoded.role === "super") return decoded;

  const officeDoc = await db.collection("offices").doc(decoded.uid).get();
  if (officeDoc.exists && officeDoc.data()?.role === "super") return decoded;

  if (decoded.email) {
    const byEmail = await db
      .collection("offices")
      .where("email", "==", normalizeEmail(decoded.email))
      .limit(5)
      .get();
    const hasSuperEmailMatch = byEmail.docs.some(
      (doc) => (doc.data()?.role || "office") === "super"
    );
    if (hasSuperEmailMatch) return decoded;
  }

  throw new Error("Not authorized");
};

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "PUT") {
    return res.status(405).json({ success: false, message: "Method not allowed." });
  }

  try {
    const admin = await getAdmin();
    const db = admin.firestore();
    await ensureSuperRequester(admin, db, req);

    const {
      id,
      name,
      officialName = "",
      email,
      username = "",
      role = "office",
      purposes = [],
      staffToVisit = [],
      status = "active",
    } = req.body || {};

    const cleanName = String(name || "").trim();
    if (!id || !cleanName) {
      return res.status(400).json({
        success: false,
        message: "id and name are required.",
      });
    }

    const officeRef = db.collection("offices").doc(id);
    const officeSnap = await officeRef.get();
    if (!officeSnap.exists) {
      return res.status(404).json({ success: false, message: "Office not found." });
    }

    const existing = officeSnap.data() || {};
    const cleanRole = role === "super" ? "super" : "office";
    const uid = await resolveAuthUid(admin, { id, existing, role: cleanRole });
    const normalizedUsername = normalizeUsername(username);
    let cleanEmail = normalizeEmail(email);
    const isInactive = status === "inactive";

    if (cleanRole === "office") {
      if (!isValidUsername(normalizedUsername)) {
        return res.status(400).json({
          success: false,
          message:
            "Username is required for office admins (4-32 chars, lowercase letters, numbers, dot, underscore, hyphen).",
        });
      }

      const usernameAvailable = await ensureUsernameAvailable(
        db,
        normalizedUsername,
        id
      );
      if (!usernameAvailable) {
        return res.status(409).json({
          success: false,
          message: "Username is already in use.",
        });
      }

      cleanEmail = "";
    } else if (!EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Valid email is required for super admin accounts.",
      });
    }

    await ensureAuthUser({
      admin,
      uid,
      role: cleanRole,
      displayName: cleanName,
      disabled: isInactive,
      email: cleanRole === "super" ? cleanEmail : null,
      password: cleanRole === "super" ? "superadmin2025" : "",
    });

    const shouldBootstrapOfficeCredentials =
      cleanRole === "office" &&
      (!existing.credentialHash || !existing.credentialSalt);
    const bootstrapPassword = String(existing.password || "").trim();
    const officeCredentialFields =
      cleanRole === "office"
        ? {
            ...(shouldBootstrapOfficeCredentials
              ? hashOfficePassword(bootstrapPassword || "officeadmin2025")
              : {}),
            credentialAlgo: admin.firestore.FieldValue.delete(),
            credentialIterations: admin.firestore.FieldValue.delete(),
            credentialKeyLength: admin.firestore.FieldValue.delete(),
            credentialUpdatedAt: admin.firestore.FieldValue.delete(),
            password: admin.firestore.FieldValue.delete(),
          }
        : {
            credentialHash: admin.firestore.FieldValue.delete(),
            credentialSalt: admin.firestore.FieldValue.delete(),
            credentialAlgo: admin.firestore.FieldValue.delete(),
            credentialIterations: admin.firestore.FieldValue.delete(),
            credentialKeyLength: admin.firestore.FieldValue.delete(),
            credentialUpdatedAt: admin.firestore.FieldValue.delete(),
            password: admin.firestore.FieldValue.delete(),
          };

    const updateData = {
      uid,
      name: cleanName,
      officialName,
      email:
        cleanRole === "super"
          ? cleanEmail
          : admin.firestore.FieldValue.delete(),
      username: cleanRole === "office" ? normalizedUsername : "",
      usernameNormalized: cleanRole === "office" ? normalizedUsername : "",
      role: cleanRole,
      purposes: normalizeList(purposes),
      staffToVisit: normalizeList(staffToVisit),
      status: isInactive ? "inactive" : "active",
      ...officeCredentialFields,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await officeRef.update(updateData);

    const responseData = {
      id,
      ...existing,
      ...updateData,
    };

    if (cleanRole !== "super") {
      delete responseData.email;
    }

    return res.status(200).json({
      success: true,
      message: "Office account updated successfully.",
      data: responseData,
    });
  } catch (error) {
    const errorMessage = String(error?.message || "");
    const isConfigError =
      errorMessage.includes("Firebase Admin credentials") ||
      errorMessage.includes("Firebase Admin environment variables") ||
      errorMessage.includes("Invalid PEM formatted message");
    const isAuthTokenError =
      errorMessage === "Missing bearer token" ||
      errorMessage === "Invalid bearer token";
    const isConflictError = String(error?.code || "") === "auth/email-already-exists";
    const status =
      error.message === "Not authorized"
        ? 403
        : isAuthTokenError
          ? 401
          : isConflictError
            ? 409
            : 500;
    return res.status(status).json({
      success: false,
      message:
        status === 401
          ? "Session token is invalid for the server Firebase project. Sign out and sign in again."
           : status === 403
             ? "Not authorized."
             : status === 409
               ? "This email is already used by another authentication account."
             : isConfigError
               ? "Server Firebase Admin configuration is invalid. Please check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY on Vercel."
               : "Failed to update office account.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}
