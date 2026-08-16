import { getAdmin } from "../server/firebaseAdmin.js";

/* global process */

const setCors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

const getBearerToken = (req) => {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7);
};

const normalizeEmail = (email = "") => String(email).trim().toLowerCase();

const configuredSuperEmails = () =>
  String(process.env.SUPER_ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed." });
  }

  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: "Missing bearer token." });
    }

    const admin = await getAdmin();
    const db = admin.firestore();
    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;
    const email = normalizeEmail(decoded.email);

    if (!uid || !email) {
      return res.status(400).json({
        success: false,
        message: "Signed-in user must have a valid email address.",
      });
    }

    const allowedEmails = configuredSuperEmails();
    const isClaimedSuper = decoded.role === "super";
    const isConfiguredSuper =
      allowedEmails.length > 0 && allowedEmails.includes(email);

    if (!isClaimedSuper && !isConfiguredSuper) {
      return res.status(403).json({
        success: false,
        message:
          "This account is not authorized for super admin profile recovery.",
      });
    }

    const existingByUid = await db.collection("offices").doc(uid).get();
    if (existingByUid.exists) {
      return res.status(200).json({
        success: true,
        message: "Super admin profile already exists.",
        data: { id: existingByUid.id, ...existingByUid.data() },
      });
    }

    const existingByEmail = await db
      .collection("offices")
      .where("email", "==", email)
      .limit(1)
      .get();

    if (!existingByEmail.empty) {
      const existingDoc = existingByEmail.docs[0];
      return res.status(200).json({
        success: true,
        message: "Super admin profile already exists.",
        data: { id: existingDoc.id, ...existingDoc.data() },
      });
    }

    await admin.auth().setCustomUserClaims(uid, { role: "super" });

    const authUser = await admin.auth().getUser(uid);
    const displayName =
      String(authUser.displayName || "").trim() || "Super Administrator";

    const officeDoc = {
      uid,
      name: displayName,
      officialName: displayName,
      email,
      username: "",
      usernameNormalized: "",
      role: "super",
      purposes: [],
      staffToVisit: [],
      status: "active",
      passwordChanged: false,
      passwordChangedAt: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("offices").doc(uid).set(officeDoc);

    return res.status(200).json({
      success: true,
      message: "Super admin profile restored.",
      data: {
        id: uid,
        ...officeDoc,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to restore super admin profile.",
      error: error?.message,
    });
  }
}
