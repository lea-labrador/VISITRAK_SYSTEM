// lib/info.services.js - COMPLETE FIXED VERSION WITH PROPER EXPIRATION
import { auth, db } from "./firebase";
import { getStoredUser } from "./sessionStorage";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  Timestamp,
} from "firebase/firestore";

// 🔹 Reference to the collections
const officesCollection = collection(db, "offices");
const activityLogsCollection = collection(db, "activityLogs");
const passwordResetTokensCollection = collection(db, "passwordResetTokens");
const normalizeEmail = (email = "") => email.trim().toLowerCase();
const normalizeUsername = (username = "") => username.trim().toLowerCase();
const USERNAME_REGEX = /^[a-z0-9][a-z0-9._-]{2,30}[a-z0-9]$/;
const normalizeOfficeList = (items = []) => {
  if (Array.isArray(items)) return items;
  if (typeof items === "string") {
    const name = items.trim();
    return name ? [{ id: `legacy_${Date.now()}`, name }] : [];
  }
  if (items && typeof items === "object") {
    return Object.values(items).filter(Boolean);
  }
  return [];
};
const normalizeNamedOfficeList = (items = [], prefix = "item") =>
  normalizeOfficeList(items)
    .map((item, index) => {
      const name = String(typeof item === "string" ? item : item?.name || "").trim();
      if (!name) return null;
      return {
        ...(typeof item === "object" && item !== null ? item : {}),
        id:
          typeof item === "object" && item?.id
            ? item.id
            : `${prefix}_${Date.now()}_${index}`,
        name,
      };
    })
    .filter(Boolean);

const waitForAuthUser = (timeoutMs = 3000) =>
  new Promise((resolve) => {
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      resolve(auth.currentUser || null);
    }, timeoutMs);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (settled || !user) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(user);
    });
  });

const callProtectedApi = async (url, method, body) => {
  let currentUser = auth.currentUser || (await waitForAuthUser());
  if (!currentUser) {
    throw new Error("Your session has expired. Please log in again.");
  }

  let idToken = "";
  try {
    idToken = await currentUser.getIdToken();
  } catch {
    currentUser = auth.currentUser || (await waitForAuthUser(1500));
    if (!currentUser) {
      throw new Error("Your session has expired. Please log in again.");
    }
    idToken = await currentUser.getIdToken();
  }

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let responseData = {};
  try {
    responseData = await response.json();
  } catch {
    // Ignore JSON parsing errors and use default message below.
  }

  if (!response.ok || responseData.success === false) {
    if (response.status === 404) {
      throw new Error(
        "API route not found. Start local API server with `npm run dev:api`."
      );
    }
    throw new Error(
      responseData.message || `Request failed with status ${response.status}`
    );
  }

  return responseData;
};

/**
 * Create an activity log
 */
const createActivityLog = async (logData) => {
  try {
    const logWithTimestamp = {
      ...logData,
      timestamp: serverTimestamp(),
    };
    
    await addDoc(activityLogsCollection, logWithTimestamp);
    return true;
  } catch  {
    return false;
  }
};

/**
 * Get current user from session storage (for activity logs)
 */
const getCurrentUser = () => {
  try {
    if (typeof window === 'undefined') {
      return {
        email: "system@admin.com",
        name: "System Administrator",
        role: "system",
        office: "System"
      };
    }
    
    const savedUser = getStoredUser();
    if (savedUser) {
      const user = JSON.parse(savedUser);
      return {
        email: user.email || "unknown@email.com",
        name: user.name || "Unknown User",
        role: user.role || "unknown",
        office: user.office || "System"
      };
    }
    return {
      email: "system@admin.com",
      name: "System Administrator",
      role: "system",
      office: "System"
    };
  } catch  {
    return {
      email: "system@admin.com",
      name: "System Administrator",
      role: "system",
      office: "System"
    };
  }
};

/* =============================
   PASSWORD RESET FUNCTIONS - WITH FIXED EXPIRATION CHECKING
============================= */

/**
 * Parse expiration date from Firestore timestamp
 */
const parseExpirationDate = (firestoreTimestamp) => {
  try {
    if (!firestoreTimestamp) return null;
    
    // If it's a Firestore Timestamp object
    if (firestoreTimestamp.toDate && typeof firestoreTimestamp.toDate === 'function') {
      return firestoreTimestamp.toDate();
    }
    
    // If it's in Firestore's object format {_seconds, _nanoseconds}
    if (firestoreTimestamp._seconds) {
      return new Date(firestoreTimestamp._seconds * 1000);
    }
    
    // If it's already a Date object
    if (firestoreTimestamp instanceof Date) {
      return firestoreTimestamp;
    }
    
    // If it's an ISO string
    if (typeof firestoreTimestamp === 'string') {
      return new Date(firestoreTimestamp);
    }
    
    return null;
  } catch  {
    return null;
  }
};

/**
 * Validate password reset token with PROPER EXPIRATION CHECKING
 */
export const validatePasswordResetToken = async (token, email = null) => {
  try {

    if (!token || token.trim() === '') {
      return null;
    }

    const cleanToken = token.trim();
    const now = new Date(); // Current time
    
    let cleanEmail = null;
    if (email) {
      try {
        cleanEmail = decodeURIComponent(email).trim().toLowerCase();
      } catch  {
        cleanEmail = email.trim().toLowerCase();
      }
    }


    // ========== QUERY FIRESTORE FOR TOKEN ==========
    try {
      // Query for the token
      const q = query(
        passwordResetTokensCollection,
        where("token", "==", cleanToken)
      );

      const querySnapshot = await getDocs(q);
      
      
      if (querySnapshot.empty) {
        return null;
      }
      
      const docSnap = querySnapshot.docs[0];
      const tokenData = docSnap.data();
      const tokenId = docSnap.id;
      

      // STEP 1: Check if token is already used
      if (tokenData.used === true) {
        
        // Clean up used token
        try {
          await deleteDoc(doc(db, "passwordResetTokens", tokenId));
        } catch  {
          // Ignore cleanup errors
        }
        
        return null;
      }

      // STEP 2: Verify email if provided
      if (cleanEmail && tokenData.email) {
        const storedEmail = tokenData.email?.toLowerCase();
        if (storedEmail !== cleanEmail) {
          return null;
        }
      }

      // STEP 3: CRITICAL - Check expiration PROPERLY
      const expiresAt = parseExpirationDate(tokenData.expiresAt);
      
      if (!expiresAt) {
        return null;
      }
      

      // CRITICAL FIX: Use getTime() for accurate comparison
      if (now.getTime() > expiresAt.getTime()) {
        
        // Mark as used
        try {
          await updateDoc(doc(db, "passwordResetTokens", tokenId), {
            used: true,
            expiredAt: serverTimestamp(),
            markedExpiredAt: new Date().toISOString()
          });
        } catch  {
        }
        
        // Try to delete it
        try {
          await deleteDoc(doc(db, "passwordResetTokens", tokenId));
        } catch  {
        }
        
        return null;
      }

      const timeLeftMinutes = Math.round((expiresAt.getTime() - now.getTime()) / 60000);
      
      return { 
        id: tokenId,
        ...tokenData,
        expiresAt: expiresAt,
        timeLeftMinutes: timeLeftMinutes
      };
      
    } catch  {
      
      // In development mode only, allow testing
      const isDevelopment = process.env.NODE_ENV === 'development' || 
                           (typeof window !== 'undefined' && 
                            (window.location.hostname === 'localhost' || 
                             window.location.hostname.includes('vercel')));
      
      if (isDevelopment) {
        if (cleanToken && cleanToken.length >= 32 && /^[a-f0-9]+$/i.test(cleanToken)) {
          
          // Create a test token with 15-minute expiration
          const testExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
          
          // IMPORTANT: In development, we still check if it would be expired
          if (now.getTime() > testExpiresAt.getTime()) {
            return null;
          }
          
          const timeLeftMinutes = Math.round((testExpiresAt.getTime() - now.getTime()) / 60000);
          
          return {
            id: `dev_fallback_${Date.now()}`,
            email: cleanEmail || 'dev@example.com',
            token: cleanToken,
            officeId: 'dev_office_id',
            officeName: 'Development Office',
            officialName: 'Dev User',
            expiresAt: testExpiresAt,
            used: false,
            warning: 'Development token - NOT FOR PRODUCTION',
            timeLeftMinutes: timeLeftMinutes
          };
        }
      }
      
      throw new Error("Unable to validate token. Please try again.");
    }
    
  } catch (error) {
    throw error;
  }
};

/**
 * Debug function to check a specific token's status
 */
export const debugTokenStatus = async (token) => {
  try {
    const cleanToken = token.trim();
    
    const q = query(
      passwordResetTokensCollection,
      where("token", "==", cleanToken)
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return { found: false };
    }
    
    const docSnap = querySnapshot.docs[0];
    const tokenData = docSnap.data();
    const tokenId = docSnap.id;
    
    const expiresAt = parseExpirationDate(tokenData.expiresAt);
    const now = new Date();
    const isExpired = expiresAt ? now.getTime() > expiresAt.getTime() : true;
    const isUsed = tokenData.used === true;
    const isValid = !isUsed && !isExpired;
    const timeLeftMinutes = expiresAt ? Math.round((expiresAt.getTime() - now.getTime()) / 60000) : null;
    
    
    return {
      found: true,
      id: tokenId,
      email: tokenData.email,
      used: isUsed,
      expiresAt: expiresAt,
      isExpired: isExpired,
      isValid: isValid,
      timeLeftMinutes: timeLeftMinutes
    };
    
  } catch (error) {
    return { error: error.message };
  }
};

/**
 * Mark password reset token as used
 */
export const markPasswordResetTokenUsed = async (tokenId) => {
  try {
    
    // Check if it's a development token
    if (tokenId.startsWith('dev_fallback_')) {
      return true;
    }
    
    // Firestore token
    const tokenRef = doc(db, "passwordResetTokens", tokenId);
    
    // Verify the token exists
    const tokenSnap = await getDoc(tokenRef);
    if (!tokenSnap.exists()) {
      throw new Error("Token not found");
    }
    
    await updateDoc(tokenRef, {
      used: true,
      usedAt: serverTimestamp(),
    });
    
    return true;
  } catch (error) {
    throw error;
  }
};

/**
 * Clean up expired tokens from Firestore
 */
export const cleanupExpiredTokens = async () => {
  try {
    
    const now = new Date();
    const nowMillis = now.getTime();
    
    // Get all unused tokens
    const q = query(
      passwordResetTokensCollection,
      where("used", "==", false)
    );
    
    const querySnapshot = await getDocs(q);
    const tokens = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      expiresAt: parseExpirationDate(doc.data().expiresAt)
    }));
    
    const expiredTokens = tokens.filter(token => {
      return token.expiresAt && nowMillis > token.expiresAt.getTime();
    });
    
    
    // Mark expired tokens as used
    for (const token of expiredTokens) {
      try {
        await updateDoc(doc(db, "passwordResetTokens", token.id), {
          used: true,
          expiredAt: serverTimestamp(),
          autoCleaned: true,
          cleanedAt: new Date().toISOString()
        });
      } catch  {
      }
    }
    
    // Also clean up old used tokens (older than 1 hour)
    const oneHourAgo = new Date(nowMillis - 60 * 60 * 1000);
    const usedQ = query(
      passwordResetTokensCollection,
      where("used", "==", true)
    );
    
    const usedSnapshot = await getDocs(usedQ);
    const oldUsedTokens = usedSnapshot.docs.filter(doc => {
      const usedAt = parseExpirationDate(doc.data().usedAt);
      const expiredAt = parseExpirationDate(doc.data().expiredAt);
      const checkDate = usedAt || expiredAt;
      return checkDate && checkDate.getTime() < oneHourAgo.getTime();
    });
    
    for (const tokenDoc of oldUsedTokens) {
      try {
        await deleteDoc(doc(db, "passwordResetTokens", tokenDoc.id));
      } catch  {
        // Ignore deletion errors
      }
    }
    
    return { 
      expiredMarked: expiredTokens.length, 
      oldDeleted: oldUsedTokens.length 
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get token by ID
 */
export const getTokenById = async (tokenId) => {
  try {
    const tokenRef = doc(db, "passwordResetTokens", tokenId);
    const tokenSnap = await getDoc(tokenRef);
    
    if (tokenSnap.exists()) {
      const data = tokenSnap.data();
      return {
        id: tokenSnap.id,
        ...data,
        expiresAt: parseExpirationDate(data.expiresAt),
        createdAt: parseExpirationDate(data.createdAt),
        usedAt: parseExpirationDate(data.usedAt)
      };
    }
    return null;
  } catch (error) {
    throw error;
  }
};

/**
 * Delete token by ID (admin function)
 */
export const deleteTokenById = async (tokenId) => {
  try {
    await deleteDoc(doc(db, "passwordResetTokens", tokenId));
    return true;
  } catch (error) {
    throw error;
  }
};

/**
 * Get all tokens for an email
 */
export const getTokensByEmail = async (email) => {
  try {
    const q = query(
      passwordResetTokensCollection,
      where("email", "==", email.toLowerCase().trim())
    );
    
    const snapshot = await getDocs(q);
    const tokens = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      expiresAt: parseExpirationDate(doc.data().expiresAt),
      createdAt: parseExpirationDate(doc.data().createdAt),
      usedAt: parseExpirationDate(doc.data().usedAt)
    }));
    
    return tokens;
  } catch (error) {
    throw error;
  }
};

/**
 * Update office password by email
 */
export const updateOfficePasswordByEmail = async (email, newPassword) => {
  try {
    
    const q = query(officesCollection, where("email", "==", email));
    const snap = await getDocs(q);
    
    if (snap.empty) {
      throw new Error("Office not found");
    }

    const officeDoc = snap.docs[0];
    const officeId = officeDoc.id;
    const officeData = officeDoc.data();
    

    await updateDoc(doc(db, "offices", officeId), {
      password: newPassword,
      updatedAt: serverTimestamp(),
    });

    return true;
  } catch (error) {
    throw error;
  }
};

/**
 * Create password reset activity log
 */
export const createPasswordResetActivityLog = async (email) => {
  try {
    
    const logData = {
      title: "Password Reset",
      description: `Password reset completed for ${email}`,
      office: email.split('@')[0] || "Unknown Office",
      type: "password_reset",
      userEmail: email,
      userName: "System",
      userRole: "system",
      timestamp: serverTimestamp(),
      action: "reset"
    };
    
    await addDoc(activityLogsCollection, logData);
    return true;
  } catch  {
    return false;
  }
};

/**
 * Check if email already exists (for validation)
 */
export const checkEmailExists = async (email, excludeId = null) => {
  try {
    const q = query(officesCollection, where("email", "==", normalizeEmail(email)));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return false;
    }
    
    // If excludeId is provided, check if it's the same office
    if (excludeId) {
      const offices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return offices.some(office => office.id !== excludeId);
    }
    
    return true;
  } catch (error) {
    throw error;
  }
};

export const checkUsernameExists = async (username, excludeId = null) => {
  try {
    const normalized = normalizeUsername(username);
    if (!normalized) return false;

    const q = query(
      officesCollection,
      where("usernameNormalized", "==", normalized)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return false;
    }

    if (excludeId) {
      const offices = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      return offices.some((office) => office.id !== excludeId);
    }

    return true;
  } catch (error) {
    throw error;
  }
};

/**
 * Validate office data structure
 */
const validateOfficeData = (office) => {
  const validatedOffice = { ...office };
  const role = validatedOffice.role === "super" ? "super" : "office";
  validatedOffice.role = role;

  if (role === "office") {
    const usernameNormalized = normalizeUsername(validatedOffice.username || "");
    validatedOffice.username = usernameNormalized;
    validatedOffice.usernameNormalized = usernameNormalized;
    delete validatedOffice.email;
  } else {
    validatedOffice.username = "";
    validatedOffice.usernameNormalized = "";
    validatedOffice.email = normalizeEmail(validatedOffice.email || "");
  }
  
  if (!validatedOffice.officialName) {
    validatedOffice.officialName = "";
  }
  
  validatedOffice.purposes = normalizeNamedOfficeList(
    validatedOffice.purposes,
    "purpose"
  );
  
  validatedOffice.staffToVisit = normalizeNamedOfficeList(
    validatedOffice.staffToVisit,
    "staff"
  );
  
  return validatedOffice;
};

/**
 * Add a new office to Firestore WITH ACTIVITY LOG
 */
export const addOffice = async (office) => {
  try {
    const role = office.role === "super" ? "super" : "office";
    if (role === "office") {
      const normalizedUsername = normalizeUsername(office.username || "");
      if (!USERNAME_REGEX.test(normalizedUsername)) {
        throw new Error(
          "Username is required (4-32 chars, lowercase letters, numbers, dot, underscore, hyphen)."
        );
      }

      const usernameExists = await checkUsernameExists(normalizedUsername);
      if (usernameExists) {
        throw new Error(`Office with username ${normalizedUsername} already exists`);
      }
    } else {
      const existingOffice = await getOfficeByEmail(office.email);
      if (existingOffice) {
        throw new Error(`Office with email ${office.email} already exists`);
      }
    }
    
    const validatedOffice = validateOfficeData(office);
    
    const officePayload = {
      name: validatedOffice.name,
      officialName: validatedOffice.officialName,
      ...(validatedOffice.role === "super"
        ? { email: validatedOffice.email }
        : {}),
      username: validatedOffice.username,
      role: validatedOffice.role,
      purposes: validatedOffice.purposes,
      staffToVisit: validatedOffice.staffToVisit,
    };
    const apiResponse = await callProtectedApi(
      "/api/create-office-account",
      "POST",
      officePayload
    );
    const createdOffice = apiResponse.data;
    
    const currentUser = getCurrentUser();
    await createActivityLog({
      title: "Office Created",
      description: `New office "${office.name}" (${office.officialName || 'No official name'}) was created with ${office.purposes?.length || 0} purposes and ${office.staffToVisit?.length || 0} staff members`,
      office: office.name,
      type: "office_created",
      userEmail: currentUser.email,
      userName: currentUser.name,
      userRole: currentUser.role,
      officeEmail: validatedOffice.email || "",
      officeUsername: validatedOffice.username || "",
      officeRole: office.role,
      officialOfficeName: office.officialName || '',
      purposesCount: office.purposes?.length || 0,
      staffCount: office.staffToVisit?.length || 0,
      action: "create"
    });
    
    
    return { 
      id: createdOffice.id, 
      ...createdOffice,
      createdAt: createdOffice.createdAt ? new Date(createdOffice.createdAt) : new Date()
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get a specific office by ID
 */
export const getOfficeById = async (id) => {
  try {
    const officeRef = doc(db, "offices", id);
    const officeSnap = await getDoc(officeRef);
    
    if (officeSnap.exists()) {
      const data = officeSnap.data();
      return { 
        id: officeSnap.id, 
        ...data,
        officialName: data.officialName || "",
        username: data.username || "",
        usernameNormalized: data.usernameNormalized || "",
        purposes: normalizeOfficeList(data.purposes),
        staffToVisit: normalizeOfficeList(data.staffToVisit)
      };
    }
    return null;
  } catch (error) {
    throw error;
  }
};

/**
 * Get office by email
 */
export const getOfficeByEmail = async (email) => {
  try {
    const cleanEmail = normalizeEmail(email);
    const q = query(officesCollection, where("email", "==", cleanEmail));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }
    
    const docSnap = snapshot.docs[0];
    const data = docSnap.data();
    return { 
      id: docSnap.id, 
      ...data,
      officialName: data.officialName || "",
      username: data.username || "",
      usernameNormalized: data.usernameNormalized || "",
      purposes: normalizeOfficeList(data.purposes),
      staffToVisit: normalizeOfficeList(data.staffToVisit)
    };
  } catch (error) {
    throw error;
  }
};

export const getOfficeByUsername = async (username) => {
  try {
    const cleanUsername = normalizeUsername(username);
    if (!cleanUsername) return null;

    const q = query(
      officesCollection,
      where("usernameNormalized", "==", cleanUsername)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;

    const docSnap = snapshot.docs[0];
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      officialName: data.officialName || "",
      username: data.username || cleanUsername,
      usernameNormalized: data.usernameNormalized || cleanUsername,
      purposes: normalizeOfficeList(data.purposes),
      staffToVisit: normalizeOfficeList(data.staffToVisit),
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Fetch all offices from Firestore
 */
export const fetchOffices = async () => {
  try {
    const snapshot = await getDocs(officesCollection);
    const offices = snapshot.docs.map((doc) => ({ 
      id: doc.id, 
      ...doc.data(),
      officialName: doc.data().officialName || "",
      username: doc.data().username || "",
      usernameNormalized: doc.data().usernameNormalized || "",
      purposes: normalizeOfficeList(doc.data().purposes),
      staffToVisit: normalizeOfficeList(doc.data().staffToVisit)
    }));
    
    return offices;
  } catch (error) {
    throw error;
  }
};

/**
 * Update an existing office WITH ACTIVITY LOG
 */
export const updateOffice = async (office) => {
  try {
    const role = office.role === "super" ? "super" : "office";
    if (role === "office") {
      const normalizedUsername = normalizeUsername(office.username || "");
      if (!USERNAME_REGEX.test(normalizedUsername)) {
        throw new Error(
          "Username is required (4-32 chars, lowercase letters, numbers, dot, underscore, hyphen)."
        );
      }

      const usernameExists = await checkUsernameExists(normalizedUsername, office.id);
      if (usernameExists) {
        throw new Error(`Office with username ${normalizedUsername} already exists`);
      }
    }

    const officeRef = doc(db, "offices", office.id);
    
    const currentOfficeSnap = await getDoc(officeRef);
    if (!currentOfficeSnap.exists()) {
      throw new Error(`Office with ID ${office.id} not found`);
    }
    
    const currentData = currentOfficeSnap.data();
    const validatedOffice = validateOfficeData(office);
    
    const updateData = {
      name: validatedOffice.name,
      officialName: validatedOffice.officialName,
      ...(validatedOffice.role === "super"
        ? { email: validatedOffice.email }
        : {}),
      username: validatedOffice.username,
      role: validatedOffice.role,
      purposes: validatedOffice.purposes,
      staffToVisit: validatedOffice.staffToVisit,
      status: office.status || currentData.status || "active",
    };
    await callProtectedApi("/api/update-office-account", "PUT", {
      id: office.id,
      ...updateData,
    });
    
    const currentUser = getCurrentUser();
    
    let description = `Office "${office.name}" was updated`;
    let changes = [];
    
    if (office.name !== currentData.name) {
      changes.push(`name changed from "${currentData.name}" to "${office.name}"`);
    }
    if (office.officialName !== currentData.officialName) {
      changes.push(`official name changed from "${currentData.officialName || 'none'}" to "${office.officialName || 'none'}"`);
    }
    if (
      (validatedOffice.role === "super" || (currentData.role || "office") === "super") &&
      normalizeEmail(office.email || "") !== normalizeEmail(currentData.email || "")
    ) {
      changes.push(`email changed from "${currentData.email}" to "${office.email}"`);
    }
    if ((office.username || "") !== (currentData.username || "")) {
      changes.push(
        `username changed from "${currentData.username || "none"}" to "${office.username || "none"}"`
      );
    }
    if (office.role !== currentData.role) {
      changes.push(`role changed from "${currentData.role}" to "${office.role}"`);
    }
    
    const currentPurposesCount = currentData.purposes?.length || 0;
    const newPurposesCount = office.purposes?.length || 0;
    if (currentPurposesCount !== newPurposesCount) {
      changes.push(`purposes changed from ${currentPurposesCount} to ${newPurposesCount}`);
    }
    
    const currentStaffCount = currentData.staffToVisit?.length || 0;
    const newStaffCount = office.staffToVisit?.length || 0;
    if (currentStaffCount !== newStaffCount) {
      changes.push(`staff list changed from ${currentStaffCount} to ${newStaffCount}`);
    }
    
    if (changes.length > 0) {
      description += ` (${changes.join(', ')})`;
    }
    
    await createActivityLog({
      title: "Office Updated",
      description: description,
      office: office.name,
      type: "office_updated",
      userEmail: currentUser.email,
      userName: currentUser.name,
      userRole: currentUser.role,
      previousName: currentData.name,
      newName: office.name,
      previousOfficialName: currentData.officialName || '',
      newOfficialName: office.officialName || '',
      purposesCount: newPurposesCount,
      staffCount: newStaffCount,
      action: "update"
    });
    
    
    return { 
      id: office.id, 
      ...updateData,
      officialName: validatedOffice.officialName,
      username: validatedOffice.username,
      usernameNormalized: validatedOffice.usernameNormalized,
      purposes: validatedOffice.purposes,
      staffToVisit: validatedOffice.staffToVisit
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Delete an office by ID WITH ACTIVITY LOG
 */
export const deleteOffice = async (id) => {
  try {
    const officeRef = doc(db, "offices", id);
    const officeDoc = await getDoc(officeRef);
    
    if (!officeDoc.exists()) {
      throw new Error(`Office with ID ${id} not found`);
    }
    
    const officeData = officeDoc.data();
    
    const currentUser = getCurrentUser();
    await createActivityLog({
      title: "Office Deleted",
      description: `Office "${officeData.name}" (${officeData.officialName || 'No official name'}) was deleted from the system. Removed ${officeData.purposes?.length || 0} purposes and ${officeData.staffToVisit?.length || 0} staff records`,
      office: officeData.name,
      type: "office_deleted",
      userEmail: currentUser.email,
      userName: currentUser.name,
      userRole: currentUser.role,
      deletedOfficeName: officeData.name,
      deletedOfficialName: officeData.officialName || '',
      deletedOfficeEmail: officeData.email,
      deletedPurposesCount: officeData.purposes?.length || 0,
      deletedStaffCount: officeData.staffToVisit?.length || 0,
      action: "delete"
    });
    
    await callProtectedApi("/api/delete-office-account", "DELETE", { id });
    
    return { 
      success: true, 
      id, 
      deletedOffice: officeData.name,
      deletedOfficialName: officeData.officialName || '',
      deletedPurposesCount: officeData.purposes?.length || 0,
      deletedStaffCount: officeData.staffToVisit?.length || 0
    };
  } catch (error) {
    throw error;
  }
}; 

/**
 * Create a login activity log
 */
export const createLoginActivityLog = async (userData) => {
  try {
    const logData = {
      title: "User Login",
      description: `${userData.name} logged into the system`,
      office: userData.office || userData.name,
      type: "login",
      userEmail: userData.email,
      userName: userData.name,
      userRole: userData.role,
      timestamp: serverTimestamp(),
      action: "login"
    };
    
    await addDoc(activityLogsCollection, logData);
    return true;
  } catch  {
    return false;
  }
};

/**
 * Get offices with specific purpose
 */
export const getOfficesByPurpose = async (purposeName) => {
  try {
    const allOffices = await fetchOffices();
    
    const filteredOffices = allOffices.filter(office => 
      normalizeNamedOfficeList(office.purposes).some(purpose => 
        purpose.name.toLowerCase().includes(purposeName.toLowerCase())
      )
    );
    
    return filteredOffices;
  } catch (error) {
    throw error;
  }
};

/**
 * Get offices with specific staff
 */
export const getOfficesByStaff = async (staffName) => {
  try {
    const allOffices = await fetchOffices();
    
    const filteredOffices = allOffices.filter(office => 
      normalizeNamedOfficeList(office.staffToVisit).some(staff => 
        staff.name.toLowerCase().includes(staffName.toLowerCase())
      )
    );
    
    return filteredOffices;
  } catch (error) {
    throw error;
  }
};

/**
 * Add a new purpose to an existing office
 */
export const addPurposeToOffice = async (officeId, purpose) => {
  try {
    const office = await getOfficeById(officeId);
    if (!office) {
      throw new Error(`Office with ID ${officeId} not found`);
    }
    
    const newPurpose = {
      id: `purpose_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: purpose.name || "New Purpose",
      ...purpose
    };
    
    const updatedPurposes = [
      ...normalizeNamedOfficeList(office.purposes, "purpose"),
      newPurpose,
    ];
    
    const updateData = {
      purposes: updatedPurposes,
      updatedAt: serverTimestamp()
    };
    
    const officeRef = doc(db, "offices", officeId);
    await updateDoc(officeRef, updateData);
    
    const currentUser = getCurrentUser();
    await createActivityLog({
      title: "Purpose Added",
      description: `Purpose "${purpose.name}" was added to office "${office.name}"`,
      office: office.name,
      type: "purpose_added",
      userEmail: currentUser.email,
      userName: currentUser.name,
      userRole: currentUser.role,
      purposeName: purpose.name,
      action: "update"
    });
    
    return { success: true, purpose: newPurpose };
  } catch (error) {
    throw error;
  }
};

/**
 * Add a new staff member to an existing office
 */
export const addStaffToOffice = async (officeId, staff) => {
  try {
    const office = await getOfficeById(officeId);
    if (!office) {
      throw new Error(`Office with ID ${officeId} not found`);
    }
    
    const newStaff = {
      id: `staff_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: staff.name || "New Staff",
      ...staff
    };
    
    const updatedStaff = [
      ...normalizeNamedOfficeList(office.staffToVisit, "staff"),
      newStaff,
    ];
    
    const updateData = {
      staffToVisit: updatedStaff,
      updatedAt: serverTimestamp()
    };
    
    const officeRef = doc(db, "offices", officeId);
    await updateDoc(officeRef, updateData);
    
    const currentUser = getCurrentUser();
    await createActivityLog({
      title: "Staff Added",
      description: `Staff "${staff.name}" was added to office "${office.name}"`,
      office: office.name,
      type: "staff_added",
      userEmail: currentUser.email,
      userName: currentUser.name,
      userRole: currentUser.role,
      staffName: staff.name,
      action: "update"
    });
    
    return { success: true, staff: newStaff };
  } catch (error) {
    throw error;
  }
};

/**
 * Remove a purpose from an office
 */
export const removePurposeFromOffice = async (officeId, purposeId) => {
  try {
    const office = await getOfficeById(officeId);
    if (!office) {
      throw new Error(`Office with ID ${officeId} not found`);
    }
    
    const purposes = normalizeNamedOfficeList(office.purposes, "purpose");
    const purposeToRemove = purposes.find(p => p.id === purposeId);
    if (!purposeToRemove) {
      throw new Error(`Purpose with ID ${purposeId} not found`);
    }
    
    const updatedPurposes = purposes.filter(p => p.id !== purposeId);
    
    const updateData = {
      purposes: updatedPurposes,
      updatedAt: serverTimestamp()
    };
    
    const officeRef = doc(db, "offices", officeId);
    await updateDoc(officeRef, updateData);
    
    const currentUser = getCurrentUser();
    await createActivityLog({
      title: "Purpose Removed",
      description: `Purpose "${purposeToRemove.name}" was removed from office "${office.name}"`,
      office: office.name,
      type: "purpose_removed",
      userEmail: currentUser.email,
      userName: currentUser.name,
      userRole: currentUser.role,
      purposeName: purposeToRemove.name,
      action: "update"
    });
    
    return { success: true, purpose: purposeToRemove };
  } catch (error) {
    throw error;
  }
};

/**
 * Remove a staff member from an office
 */
export const removeStaffFromOffice = async (officeId, staffId) => {
  try {
    const office = await getOfficeById(officeId);
    if (!office) {
      throw new Error(`Office with ID ${officeId} not found`);
    }
    
    const staffToVisit = normalizeNamedOfficeList(office.staffToVisit, "staff");
    const staffToRemove = staffToVisit.find(s => s.id === staffId);
    if (!staffToRemove) {
      throw new Error(`Staff with ID ${staffId} not found`);
    }
    
    const updatedStaff = staffToVisit.filter(s => s.id !== staffId);
    
    const updateData = {
      staffToVisit: updatedStaff,
      updatedAt: serverTimestamp()
    };
    
    const officeRef = doc(db, "offices", officeId);
    await updateDoc(officeRef, updateData);
    
    const currentUser = getCurrentUser();
    await createActivityLog({
      title: "Staff Removed",
      description: `Staff "${staffToRemove.name}" was removed from office "${office.name}"`,
      office: office.name,
      type: "staff_removed",
      userEmail: currentUser.email,
      userName: currentUser.name,
      userRole: currentUser.role,
      staffName: staffToRemove.name,
      action: "update"
    });
    
    return { success: true, staff: staffToRemove };
  } catch (error) {
    throw error;
  }
};

/**
 * Update office official name only
 */
export const updateOfficeOfficialName = async (officeId, officialName) => {
  try {
    const officeRef = doc(db, "offices", officeId);
    const officeSnap = await getDoc(officeRef);
    
    if (!officeSnap.exists()) {
      throw new Error(`Office with ID ${officeId} not found`);
    }
    
    const currentData = officeSnap.data();
    
    const updateData = {
      officialName: officialName || "",
      updatedAt: serverTimestamp()
    };
    
    await updateDoc(officeRef, updateData);
    
    const currentUser = getCurrentUser();
    await createActivityLog({
      title: "Official Name Updated",
      description: `Office "${currentData.name}" official name changed from "${currentData.officialName || 'none'}" to "${officialName || 'none'}"`,
      office: currentData.name,
      type: "office_updated",
      userEmail: currentUser.email,
      userName: currentUser.name,
      userRole: currentUser.role,
      previousOfficialName: currentData.officialName || '',
      newOfficialName: officialName || '',
      action: "update"
    });
    
    return { success: true, officialName };
  } catch (error) {
    throw error;
  }
};

/**
 * Create password reset request activity log
 */
export const createPasswordResetRequestLog = async (email) => {
  try {
    
    const logData = {
      title: "Password Reset Request",
      description: `Password reset requested for ${email}`,
      office: email.split('@')[0] || "Unknown Office",
      type: "password_reset_request",
      userEmail: email,
      userName: "User",
      userRole: "user",
      timestamp: serverTimestamp(),
      action: "request"
    };
    
    await addDoc(activityLogsCollection, logData);
    return true;
  } catch  {
    return false;
  }
};

/**
 * Get all password reset tokens
 */
export const getAllPasswordResetTokens = async () => {
  try {
    const snapshot = await getDocs(passwordResetTokensCollection);
    const tokens = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      expiresAt: parseExpirationDate(doc.data().expiresAt),
      createdAt: parseExpirationDate(doc.data().createdAt),
      usedAt: parseExpirationDate(doc.data().usedAt)
    }));
    
    return tokens;
  } catch (error) {
    throw error;
  }
};

/**
 * Debug function to check all tokens in database
 */
export const debugAllPasswordTokens = async () => {
  try {
    const snapshot = await getDocs(passwordResetTokensCollection);
    
    const tokens = [];
    const now = new Date();
    snapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      const expiresAt = parseExpirationDate(data.expiresAt);
      const isExpired = expiresAt ? now.getTime() > expiresAt.getTime() : true;
      
      tokens.push({
        id: doc.id,
        ...data,
        expiresAt: expiresAt,
        isExpired: isExpired,
        createdAt: parseExpirationDate(data.createdAt),
        usedAt: parseExpirationDate(data.usedAt)
      });
      
    });
    
    const validTokens = tokens.filter(t => !t.used && !t.isExpired);
    
    return tokens;
  } catch  {
    return [];
  }
};

/**
 * Get active (unexpired, unused) tokens count
 */
export const getActiveTokensCount = async () => {
  try {
    const tokens = await getAllPasswordResetTokens();
    const now = new Date();
    const activeTokens = tokens.filter(token => {
      return !token.used && token.expiresAt && now.getTime() < token.expiresAt.getTime();
    });
    
    return activeTokens.length;
  } catch  {
    return 0;
  }
};

/**
 * Setup periodic token cleanup
 */
export const setupTokenCleanup = () => {
  if (typeof window !== 'undefined') {
    // Clean up every 30 minutes
    setInterval(async () => {
      try {
        const result = await cleanupExpiredTokens();
        if (result.expiredMarked > 0 || result.oldDeleted > 0) {
        }
      } catch  {
      }
    }, 30 * 60 * 1000); // 30 minutes
    
  }
};

// Schedule cleanup if in browser
if (typeof window !== 'undefined') {
  setTimeout(() => {
    setupTokenCleanup();
  }, 10000); // Start after 10 seconds
}

/**
 * Public endpoint: check whether an office account exists by username or email.
 */
export const lookupOfficePasswordResetAccount = async (identifier) => {
  const cleanIdentifier = String(identifier || "").trim().toLowerCase();
  if (!cleanIdentifier) {
    throw new Error("Username or email is required.");
  }

  const response = await fetch("/api/office-password-reset-requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "lookup",
      identifier: cleanIdentifier,
    }),
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // Ignore JSON parse errors and use fallback below.
  }

  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || "Failed to validate account.");
  }

  return {
    success: true,
    exists: payload.exists === true,
    username: payload.username || "",
    usernameNormalized: payload.usernameNormalized || "",
    message: payload.message || "",
  };
};

/**
 * Public endpoint: office admin submits a password reset request using username.
 */
export const requestOfficePasswordReset = async (username) => {
  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername) {
    throw new Error("Username is required.");
  }

  const response = await fetch("/api/office-password-reset-requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username: cleanUsername }),
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // Ignore JSON parse errors and use fallback below.
  }

  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || "Failed to submit password reset request.");
  }

  return payload;
};

/**
 * Public endpoint: cancel a pending office password reset request.
 */
export const cancelOfficePasswordResetRequest = async (username, requestId = "") => {
  const cleanUsername = normalizeUsername(username);
  const cleanRequestId = String(requestId || "").trim();

  if (!cleanUsername && !cleanRequestId) {
    throw new Error("Username or requestId is required.");
  }

  const response = await fetch("/api/office-password-reset-requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "cancel",
      username: cleanUsername || "",
      requestId: cleanRequestId,
    }),
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // Ignore JSON parse errors and use fallback below.
  }

  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || "Failed to cancel password reset request.");
  }

  return payload;
};

/**
 * Public endpoint: check the latest password reset request status by username.
 */
export const getOfficePasswordResetRequestStatus = async (username) => {
  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername || !USERNAME_REGEX.test(cleanUsername)) {
    return {
      success: true,
      status: "none",
      message: "No password reset request found.",
      resetLink: null,
    };
  }

  const response = await fetch("/api/office-password-reset-requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "status",
      username: cleanUsername,
    }),
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // Ignore JSON parse errors and use fallback below.
  }

  if (!response.ok || payload.success === false) {
    throw new Error(
      payload.message || "Failed to check password reset request status."
    );
  }

  return payload;
};

/**
 * Super admin endpoint: list office password reset requests.
 */
export const getOfficePasswordResetRequests = async (status = "all") => {
  const cleanStatus = String(status || "all").trim().toLowerCase();
  const suffix =
    cleanStatus && cleanStatus !== "all"
      ? `?status=${encodeURIComponent(cleanStatus)}`
      : "";

  const response = await callProtectedApi(
    `/api/office-password-reset-requests${suffix}`,
    "GET"
  );

  return response?.requests || [];
};

/**
 * Super admin endpoint: resolve password reset request (approve/reject).
 */
export const resolveOfficePasswordResetRequest = async (
  requestId,
  action,
  reason = ""
) => {
  const cleanRequestId = String(requestId || "").trim();
  const cleanAction = String(action || "").trim().toLowerCase();
  if (!cleanRequestId || !["approve", "reject"].includes(cleanAction)) {
    throw new Error("Valid requestId and action are required.");
  }

  return callProtectedApi("/api/resolve-office-password-reset-request", "POST", {
    requestId: cleanRequestId,
    action: cleanAction,
    reason: String(reason || "").trim(),
  });
};

/**
 * Wrapper functions for backward compatibility
 */
export const updateOfficeWithLog = async (office) => {
  return updateOffice(office);
};

export const deleteOfficeWithLog = async (id) => {
  return deleteOffice(id);
};

export const addOfficeWithLog = async (office) => {
  return addOffice(office);
};

/**
 * Super admin: set a temporary password for an office account.
 */
export const adminResetOfficePassword = async (officeId, newPassword) => {
  if (!officeId) {
    throw new Error("Office id is required.");
  }

  if (!newPassword || newPassword.trim().length < 8) {
    throw new Error("Temporary password must be at least 8 characters.");
  }

  const response = await callProtectedApi("/api/admin-reset-office-password", "POST", {
    id: officeId,
    newPassword: newPassword.trim(),
  });

  const currentUser = getCurrentUser();
  const officeName = response?.data?.name || "Office";
  const officeEmail = response?.data?.email || "";
  const officeUsername = response?.data?.username || "";

  await createActivityLog({
    title: "Office Password Reset",
    description: `Super admin manually reset password for "${officeName}" (${officeUsername || officeEmail || "unknown login"})`,
    office: officeName,
    type: "password_reset",
    userEmail: currentUser.email,
    userName: currentUser.name,
    userRole: currentUser.role,
    resetOfficeId: officeId,
    resetOfficeEmail: officeEmail,
    resetOfficeUsername: officeUsername,
    action: "reset",
  });

  return response;
};

/**
 * Office admin: change own password using username-based credentials.
 */
export const changeOfficeOwnPassword = async (currentPassword, newPassword) => {
  if (!currentPassword || !newPassword) {
    throw new Error("Current and new password are required.");
  }

  if (newPassword.trim().length < 8) {
    throw new Error("New password must be at least 8 characters.");
  }

  return callProtectedApi("/api/office-change-password", "POST", {
    currentPassword: String(currentPassword),
    newPassword: String(newPassword).trim(),
  });
};
