import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    Timestamp,
    updateDoc,
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { auth, authPersistenceReady, db } from "./firebase";

const COLLECTION = "encoderLinks";

export const EXPIRY_OPTIONS = [
    { label: "8 hours", hours: 8 },
    { label: "1 day", hours: 24 },
    { label: "3 days", hours: 72 },
    { label: "7 days", hours: 168 },
    { label: "30 days", hours: 720 },
];

export const generateLinkId = () => {
    const bytes = new Uint8Array(16); // 128 bits -> 32 hex chars
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

export const buildEncoderUrl = (linkId) => {
    const url = new URL("/encode", window.location.origin);
    url.searchParams.set("l", linkId);
    return url.toString();
};

export const createEncoderLink = async ({ label, office, hours, createdBy }) => {
    const id = generateLinkId();
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + hours * 60 * 60 * 1000));

    await setDoc(doc(db, COLLECTION, id), {
        label: String(label || "").trim().slice(0, 80),
        office: String(office || "").trim(), // "" = any office
        status: "active",
        revoked: false,
        expiresAt,
        createdAt: serverTimestamp(),
        createdBy: {
            uid: createdBy?.uid || createdBy?.id || "",
            name: createdBy?.name || "",
        },
    });

    return id;
};

export const revokeEncoderLink = (linkId) =>
    updateDoc(doc(db, COLLECTION, linkId), {
        revoked: true,
        status: "revoked",
        revokedAt: serverTimestamp(),
    });

export const deleteEncoderLink = (linkId) => deleteDoc(doc(db, COLLECTION, linkId));

export const subscribeEncoderLinks = (onData, onError) =>
    onSnapshot(
        query(collection(db, COLLECTION), orderBy("createdAt", "desc")),
        (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => onError?.(err)
    );

export const fetchEncoderLink = async (linkId) => {
    const snap = await getDoc(doc(db, COLLECTION, linkId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

/** Returns "active" | "revoked" | "expired" | "missing" */
export const getEncoderLinkState = (link) => {
    if (!link) return "missing";
    if (link.revoked === true || link.status === "revoked") return "revoked";
    const expires = link.expiresAt?.toDate?.();
    if (!expires || expires.getTime() <= Date.now()) return "expired";
    return "active";
};

/** Signs the helper in anonymously. Throws if a real admin is already signed in. */
export const ensureEncoderSession = async () => {
    await authPersistenceReady;
    await auth.authStateReady();

    const current = auth.currentUser;
    if (current && !current.isAnonymous) {
        const err = new Error("ADMIN_SESSION");
        err.code = "visitrak/admin-session";
        throw err;
    }
    if (current?.isAnonymous) return current;

    const cred = await signInAnonymously(auth);
    return cred.user;
};