import React, { useState, useMemo, useEffect } from "react";
import { Ban, Clipboard, Download, FileText, Printer, QrCode, X } from "lucide-react";
import useFeedbackRatings from "../hooks/useFeedbackRatings";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import FeedbackModal from "../components/FeedbackModal";
import FilterBar from "../components/FilterBars";
import FeedbackTable from "../components/FeedbackTable";
import bisuLogo from "../assets/bisulogo.png";
import bagongPilipinasLogo from "../assets/bagong_pilipinas_logo.png";
import tuvISOLogo from "../assets/tuvISO_logo.png";

const PRINT_OFFICE_HEADER = "Office of the Human Resource Management";

const toTrimmedText = (value) => (typeof value === "string" ? value.trim() : "");

const isAllOfficesOption = (value) =>
  toTrimmedText(value).toLowerCase() === "all offices";

const isSuperAdminOfficeOption = (value) =>
  toTrimmedText(value).toLowerCase() === "super admin";

const getAnonymousAlias = (index) =>
  `Anonymous${String(index + 1).padStart(3, "0")}`;

const getFeedbackDisplayName = (feedback, index) => {
  if (!feedback || typeof feedback !== "object") {
    return getAnonymousAlias(index);
  }

  if (typeof feedback.displayName === "boolean") {
    if (feedback.displayName) {
      return "Anonymous";
    }

    return toTrimmedText(feedback.name) || getAnonymousAlias(index);
  }

  const storedDisplayName = toTrimmedText(feedback.displayName);
  if (!storedDisplayName) {
    return getAnonymousAlias(index);
  }

  const normalizedDisplayName = storedDisplayName.toLowerCase();
  if (normalizedDisplayName === "anonymous" || normalizedDisplayName === "anon") {
    return "Anonymous";
  }

  if (
    normalizedDisplayName === "name" ||
    normalizedDisplayName === "show name" ||
    normalizedDisplayName === "display name"
  ) {
    return toTrimmedText(feedback.name) || getAnonymousAlias(index);
  }

  return storedDisplayName;
};

const getNumericRating = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeQuestionRatings = (answers, questions = []) => {
  if (!answers) return [];

  if (Array.isArray(answers)) {
    return answers.map((answer, index) => {
      const fallbackQuestion = toTrimmedText(questions[index]) || `Question ${index + 1}`;

      if (answer && typeof answer === "object") {
        const question = toTrimmedText(
          answer.question ||
          answer.label ||
          answer.text ||
          answer.title ||
          answer.prompt ||
          answer.item
        );

        const rating = getNumericRating(
          answer.rating ??
          answer.score ??
          answer.value ??
          answer.answer ??
          answer.selected
        );

        return {
          question: question || fallbackQuestion,
          rating,
        };
      }

      return {
        question: fallbackQuestion,
        rating: getNumericRating(answer),
      };
    });
  }

  if (typeof answers === "object") {
    return Object.entries(answers).map(([question, rating], index) => ({
      question: toTrimmedText(question) || `Question ${index + 1}`,
      rating: getNumericRating(rating),
    }));
  }

  return [];
};

const getValidSatisfactionRating = (value) => {
  const numeric = getNumericRating(value);

  if (numeric === null) return null;
  if (numeric <= 0 || numeric > 5) return null;

  return numeric;
};

const getAverageQuestionRating = (questionRatings = []) => {
  if (!Array.isArray(questionRatings)) return null;

  const numericRatings = questionRatings
    .map((item) => getValidSatisfactionRating(item?.rating))
    .filter((rating) => rating !== null);

  if (numericRatings.length === 0) return null;

  const total = numericRatings.reduce((sum, rating) => sum + rating, 0);
  return total / numericRatings.length;
};

const getFeedbackSatisfaction = (feedback, questionRatings = []) => {
  const rawAverageRating = getValidSatisfactionRating(feedback?._raw?.averageRating);
  if (rawAverageRating !== null) {
    return rawAverageRating;
  }

  const normalizedAverageRating = getValidSatisfactionRating(feedback?.averageRating);
  if (normalizedAverageRating !== null) {
    return normalizedAverageRating;
  }

  return getAverageQuestionRating(questionRatings);
};

const toLocalDateInput = (dateObj) => {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return "";

  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatPrintFooterDate = () => "07/01/24";

const getOfficialOfficeName = (officeValue, offices = []) => {
  const normalizedOffice = toTrimmedText(officeValue).toLowerCase();
  if (!normalizedOffice) return "";

  const matchedOffice = offices.find((officeItem) => {
    const officeName = toTrimmedText(officeItem?.name).toLowerCase();
    const officialName = toTrimmedText(officeItem?.officialName).toLowerCase();

    return normalizedOffice === officeName || normalizedOffice === officialName;
  });

  return (
    toTrimmedText(matchedOffice?.officialName) || toTrimmedText(officeValue)
  );
};

const compareOfficeNames = (leftOffice, rightOffice, offices = []) => {
  const leftOfficial = getOfficialOfficeName(leftOffice, offices) || leftOffice;
  const rightOfficial = getOfficialOfficeName(rightOffice, offices) || rightOffice;

  return (
    toTrimmedText(leftOfficial).toLowerCase() ===
    toTrimmedText(rightOfficial).toLowerCase()
  );
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const generateFeedbackToken = () => {
  const randomBytes = new Uint8Array(16);

  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(randomBytes);
  } else {
    for (let index = 0; index < randomBytes.length; index += 1) {
      randomBytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
};

const MANUAL_FEEDBACK_BASE_URL =
  import.meta.env.VITE_VISITRAK_WEB_URL || "https://visitrak-web.vercel.app";

const buildManualFeedbackUrl = ({ token, accessKey, officeName = "" }) => {
  const url = new URL("/satisfaction", MANUAL_FEEDBACK_BASE_URL);
  url.searchParams.set("mode", "manual");
  url.searchParams.set("token", token);
  url.searchParams.set("k", accessKey);

  const trimmedOffice = toTrimmedText(officeName);
  if (trimmedOffice) {
    url.searchParams.set("office", trimmedOffice);
  }

  return url.toString();
};

const getUserIdentifier = (user) =>
  user?.email || user?.username || user?.name || user?.uid || "Unknown user";

const buildQrImageUrl = (value) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=12&data=${encodeURIComponent(
    value
  )}`;

const LIFETIME_QR_MAX_USES = 1000000000;
const LIFETIME_QR_EXPIRES_AT = new Date("9999-12-31T23:59:59.999Z");

const getQrUsageLabel = (qr) => {
  if (qr?.type === "lifetime") return "Lifetime access";
  if (qr?.type === "batch") return `Batch token, ${qr.maxUses} maximum uses`;
  return "Single-use token";
};

const getQrExpiryLabel = (qr) => {
  if (qr?.type === "lifetime" || !qr?.expiresAt) {
    return "Never expires unless revoked by an admin.";
  }

  return `Expires ${qr.expiresAt.toLocaleString()}.`;
};

const toDateValue = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatQrDate = (value) => {
  const date = toDateValue(value);
  return date ? date.toLocaleString() : "Not available";
};

const getQrSortTime = (qr) => {
  const date =
    toDateValue(qr?.createdAt) ||
    toDateValue(qr?.createdAtClient) ||
    toDateValue(qr?.updatedAt);
  return date ? date.getTime() : 0;
};

const getManualQrOfficeName = (qr) =>
  toTrimmedText(qr?.office) ||
  toTrimmedText(qr?.officeName) ||
  toTrimmedText(qr?.officeVisited) ||
  toTrimmedText(qr?.unitOfficeVisited) ||
  toTrimmedText(qr?.manualSubmissionDefaults?.office) ||
  toTrimmedText(qr?.manualSubmissionDefaults?.officeName) ||
  toTrimmedText(qr?.manualSubmissionDefaults?.officeVisited) ||
  toTrimmedText(qr?.manualSubmissionDefaults?.unitOfficeVisited) ||
  "All Offices";

const isManualQrTokenActive = (qr) => {
  if (!qr || qr.revoked === true || qr.status === "revoked") return false;
  if (qr.status && qr.status !== "active") return false;
  if (qr.type === "single" && qr.used === true) return false;

  const remainingUses = Number(qr.remainingUses);
  if (Number.isFinite(remainingUses) && remainingUses <= 0) return false;

  const expiresAt = toDateValue(qr.expiresAt);
  if (expiresAt && expiresAt.getTime() <= Date.now()) return false;

  return true;
};

const isManualQrOfficeConflict = (existingOffice, requestedOffice) =>
  toTrimmedText(existingOffice).toLowerCase() ===
  toTrimmedText(requestedOffice).toLowerCase();

const Feedback = ({ user }) => {
  const [search, setSearch] = useState("");
  const [dayRange, setDayRange] = useState({ start: "", end: "" });
  const [office, setOffice] = useState("");
  const [selectedVisitor, setSelectedVisitor] = useState(null);
  const [offices, setOffices] = useState([]);
  const [showPrintSignatoryModal, setShowPrintSignatoryModal] = useState(false);
  const [printSignatories, setPrintSignatories] = useState({
    prepared: "MA. MAELITH L. BUCHAN",
    verified: "HORONORIO O. UEHARA",
    approved: "MARIETTA C. MACALOLOT, PhD",
  });
  const [printFooterFields, setPrintFooterFields] = useState({
    documentCode: "F-AQA-CSF-003",
    revisionNumber: "Rev 3",
  });
  const [printTableFields, setPrintTableFields] = useState({});
  const [printFooterSnapshot, setPrintFooterSnapshot] = useState({
    printedDate: formatPrintFooterDate(new Date()),
  });
  const [manualQrSettingsOpen, setManualQrSettingsOpen] = useState(false);
  const [manualQrSettings, setManualQrSettings] = useState({
    mode: "lifetime",
    expiresInHours: 24,
    maxUses: 1,
    officeName: "",
  });
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [generatedQr, setGeneratedQr] = useState(null);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [qrManagerOpen, setQrManagerOpen] = useState(false);
  const [manualQrTokens, setManualQrTokens] = useState([]);
  const [manualQrTokensLoading, setManualQrTokensLoading] = useState(false);
  const [revokingQrId, setRevokingQrId] = useState("");
  const normalizedUserType = toTrimmedText(user?.type).toLowerCase();
  const normalizedUserRole = toTrimmedText(user?.role).toLowerCase();
  const isSuperAdmin =
    normalizedUserType === "superadmin" || normalizedUserRole === "super";
  const isOfficeAdmin =
    !isSuperAdmin &&
    (normalizedUserType === "officeadmin" ||
      normalizedUserRole === "officeadmin" ||
      normalizedUserRole === "office");

  // Use the custom hook to fetch feedbacks
  const { feedbacks, loading, error } = useFeedbackRatings();

  // ✅ FIX: Set office to user's office if they're an Office Admin
  useEffect(() => {
    if (isOfficeAdmin && user?.office) {
      setOffice(user.office);
    }
  }, [isOfficeAdmin, user?.office]);

  const handlePrintSignatoryChange = (role, value) => {
    setPrintSignatories((previous) => ({
      ...previous,
      [role]: value,
    }));
  };

  const handlePrintFooterFieldChange = (field, value) => {
    setPrintFooterFields((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handlePrintTableFieldChange = (officeKey, field, value) => {
    setPrintTableFields((previous) => ({
      ...previous,
      [officeKey]: {
        ...(previous[officeKey] || {}),
        [field]: value,
      },
    }));
  };

  useEffect(() => {
    const syncPrintedDate = () => {
      setPrintFooterSnapshot({
        printedDate: formatPrintFooterDate(new Date()),
      });
    };

    window.addEventListener("beforeprint", syncPrintedDate);

    return () => {
      window.removeEventListener("beforeprint", syncPrintedDate);
    };
  }, []);

  // Fetch offices from Firestore
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "offices"),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            name: d.name || "",
            officialName: d.officialName || "",
            role: d.role || "office",
          };
        });

        setOffices(data);
      },
      () => {
        setOffices([]);
      }
    );

    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!qrManagerOpen) return undefined;

    setManualQrTokensLoading(true);
    const tokensRef = collection(db, "manualFeedbackTokens");

    const unsubscribe = onSnapshot(
      tokensRef,
      (snapshot) => {
        const tokens = snapshot.docs
          .map((tokenDoc) => ({
            id: tokenDoc.id,
            ...tokenDoc.data(),
          }))
          .sort((first, second) => getQrSortTime(second) - getQrSortTime(first));
        setManualQrTokens(tokens);
        setManualQrTokensLoading(false);
      },
      () => {
        setManualQrTokens([]);
        setManualQrTokensLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [qrManagerOpen]);

  // Get a safe date string from createdAt
  const getSafeDateString = (createdAt) => {
    if (!createdAt) return "";

    try {
      // Handle both Date objects and Firestore Timestamps
      if (createdAt.toDate) {
        return toLocalDateInput(createdAt.toDate());
      } else if (createdAt instanceof Date) {
        return toLocalDateInput(createdAt);
      } else if (typeof createdAt === "string" || typeof createdAt === "number") {
        return toLocalDateInput(new Date(createdAt));
      }
    } catch {
      return "";
    }

    return "";
  };

  // Get formatted display date
  const getDisplayDate = (createdAt) => {
    if (!createdAt) return "Date not available";

    try {
      let dateObj;

      if (createdAt.toDate) {
        dateObj = createdAt.toDate();
      } else if (createdAt instanceof Date) {
        dateObj = createdAt;
      } else if (typeof createdAt === "string" || typeof createdAt === "number") {
        dateObj = new Date(createdAt);
      }

      if (!dateObj || Number.isNaN(dateObj.getTime())) {
        return "Date not available";
      }

      return dateObj.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "Invalid date";
    }
  };

  // Combined filter logic with safe data access
  const filteredFeedbacks = useMemo(() => {
    if (!Array.isArray(feedbacks)) {
      return [];
    }

    try {
      return feedbacks
        .map((f, idx) => {
          const suggestion = toTrimmedText(f?.suggestion);
          const commendation = toTrimmedText(f?.commendation);
          const questionRatings = normalizeQuestionRatings(f?.answers, f?.questions);
          const displayName = getFeedbackDisplayName(f, idx);
          const satisfaction = getFeedbackSatisfaction(f, questionRatings);

          return {
            f,
            idx,
            suggestion,
            commendation,
            questionRatings,
            displayName,
            satisfaction,
          };
        })
        .filter(({ f, suggestion, commendation, displayName, satisfaction }) => {
          if (!f) return false;

          const hasWrittenFeedback = Boolean(commendation || suggestion);
          const hasDisplayableFeedback = hasWrittenFeedback || satisfaction !== null;
          if (!hasDisplayableFeedback) return false;

          const feedbackOffice = f.office || "Unspecified";
          const searchLower = (search || "").toLowerCase();

          // Safe search across multiple fields
          const nameMatch = displayName.toLowerCase().includes(searchLower);
          const suggestionMatch = suggestion.toLowerCase().includes(searchLower);
          const commendationMatch = commendation.toLowerCase().includes(searchLower);
          const visitIdMatch = (f.visitId || "").toLowerCase().includes(searchLower);
          const matchesSearch = nameMatch || suggestionMatch || commendationMatch || visitIdMatch;

          // Handle date range filter safely
          const dayString = getSafeDateString(f.createdAt);
          const matchesDate = (() => {
            if (!dayRange.start && !dayRange.end) return true;
            if (!dayString) return false;
            if (dayRange.start && dayString < dayRange.start) return false;
            if (dayRange.end && dayString > dayRange.end) return false;
            return true;
          })();

          // Handle office filter based on user role
          let matchesOffice = true;
          if (isOfficeAdmin) {
            matchesOffice = compareOfficeNames(
              feedbackOffice,
              user.office || "",
              offices,
            );
          } else if (office) {
            matchesOffice = compareOfficeNames(feedbackOffice, office, offices);
          }

          return matchesSearch && matchesDate && matchesOffice;
        })
        .map(({ f, idx, suggestion, commendation, questionRatings, displayName, satisfaction }) => {
          const feedbackOffice = f.office || "Unspecified";
          const officialOfficeName =
            getOfficialOfficeName(feedbackOffice, offices) || feedbackOffice;
          const formattedDate = getDisplayDate(f.createdAt);
          const previewComment =
            suggestion ||
            commendation ||
            "No written feedback provided. Rating details are available.";

          return {
            // Data for FeedbackTable
            id: f.id || `feedback-${idx}`,
            alias: getAnonymousAlias(idx),
            displayName,
            office: feedbackOffice,
            officialOfficeName,
            comment: previewComment,
            date: formattedDate,
            satisfaction,
            commendation: commendation || "No commendation provided.",
            suggestion: suggestion || "No suggestion provided.",
            questionRatings,

            // Additional data for FeedbackModal
            name: f.name || "",
            answers: f.answers || [],
            createdAt: f.createdAt || new Date(),
            visitDateTime: f.visitDateTime || f.createdAt || null,
            visitId: f.visitId || "",
            sex: f.sex || "",
            clientType: f.clientType || "",
            regionOfResidence: f.regionOfResidence || "",
            serviceAvailed: f.serviceAvailed || f.visitPurpose || "",
            servicedBy: f.servicedBy || "",
            cc1Rating: f.cc1Rating ?? null,
            cc2Rating: f.cc2Rating ?? null,
            cc3Rating: f.cc3Rating ?? null,

            // Store original for reference
            originalData: f,
          };
        });
    } catch {
      return [];
    }
  }, [feedbacks, search, dayRange, office, isOfficeAdmin, user?.office, offices]);

  // Generate unique office options
  const officeOptions = useMemo(() => {
    try {
      const officeNames = (offices || [])
        .filter((officeItem) => toTrimmedText(officeItem?.role).toLowerCase() !== "super")
        .map((officeItem) => toTrimmedText(officeItem?.name))
        .filter((officeName) => officeName && !isSuperAdminOfficeOption(officeName));

      const feedbackOfficeNames = Array.isArray(feedbacks)
        ? feedbacks
          .map((feedback) => toTrimmedText(feedback?.office))
          .filter((officeName) => officeName && !isSuperAdminOfficeOption(officeName))
        : [];

      const combined = [...officeNames, ...feedbackOfficeNames];
      if (isOfficeAdmin && user?.office) {
        combined.push(user.office);
      }

      const uniqueOffices = [...new Set(combined)]
        .filter((officeName) => !isAllOfficesOption(officeName))
        .filter((officeName) => !isSuperAdminOfficeOption(officeName))
        .sort();
      if (uniqueOffices.length > 0) {
        return uniqueOffices;
      }

      return ["Main Office", "Branch Office", "Headquarters"];
    } catch {
      return ["Main Office", "Branch Office", "Headquarters"];
    }
  }, [offices, feedbacks, isOfficeAdmin, user?.office]);

  const openManualQrSettings = () => {
    if (!isSuperAdmin) {
      alert("Only the Super Admin can generate manual feedback QR codes.");
      return;
    }

    const defaultOfficeName = isOfficeAdmin ? user?.office || "" : office || "";

    setManualQrSettings({
      mode: "lifetime",
      expiresInHours: 24,
      maxUses: 1,
      officeName: defaultOfficeName,
    });
    setManualQrSettingsOpen(true);
  };

  const handleGenerateQRCode = async () => {
    if (!isSuperAdmin) {
      alert("Only the Super Admin can generate manual feedback QR codes.");
      return;
    }

    const token = generateFeedbackToken();
    const accessKey = generateFeedbackToken();
    const targetOffice = isOfficeAdmin ? user?.office : manualQrSettings.officeName;
    const approvedOffice = toTrimmedText(targetOffice) || "All Offices";
    const officialOfficeName =
      getOfficialOfficeName(approvedOffice, offices) || approvedOffice;
    const isLifetimeQr = manualQrSettings.mode === "lifetime";
    const expiresInHours = isLifetimeQr
      ? 0
      : Math.max(1, Math.min(168, Number(manualQrSettings.expiresInHours) || 24));
    const maxUses = isLifetimeQr
      ? LIFETIME_QR_MAX_USES
      : manualQrSettings.mode === "batch"
        ? Math.max(1, Math.min(500, Number(manualQrSettings.maxUses) || 25))
        : 1;
    const expiresAt = isLifetimeQr
      ? LIFETIME_QR_EXPIRES_AT
      : new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    const feedbackUrl = buildManualFeedbackUrl({
      token,
      accessKey,
      officeName: approvedOffice,
    });
    const approvedBy = {
      id: user?.id || user?.uid || "",
      name: user?.name || user?.displayName || user?.username || "",
      email: user?.email || "",
      role: user?.type || user?.role || "",
    };

    setIsGeneratingQr(true);

    try {
      if (isLifetimeQr) {
        const existingQrSnapshot = await getDocs(collection(db, "manualFeedbackTokens"));
        const conflictingQr = existingQrSnapshot.docs
          .map((tokenDoc) => ({
            id: tokenDoc.id,
            ...tokenDoc.data(),
          }))
          .find((qrToken) => {
            if (qrToken.type !== "lifetime") return false;
            if (!isManualQrTokenActive(qrToken)) return false;

            return isManualQrOfficeConflict(
              getManualQrOfficeName(qrToken),
              approvedOffice,
            );
          });

        if (conflictingQr) {
          const conflictingOffice =
            getOfficialOfficeName(getManualQrOfficeName(conflictingQr), offices) ||
            getManualQrOfficeName(conflictingQr);

          alert(
            `An active lifetime feedback QR code already exists for ${conflictingOffice}. Revoke the existing lifetime QR code first before creating another one.`
          );
          return;
        }
      }

      const docRef = await addDoc(collection(db, "manualFeedbackTokens"), {
        token,
        accessKey,
        url: feedbackUrl,
        mode: "manual",
        type: manualQrSettings.mode,
        source: "manual-qr",
        office: approvedOffice,
        officeName: approvedOffice,
        officeVisited: approvedOffice,
        unitOfficeVisited: approvedOffice,
        officialOfficeName,
        approvedBy,
        approvedByLabel: getUserIdentifier(user),
        createdAt: serverTimestamp(),
        createdAtClient: new Date(),
        expiresAt,
        lifetime: isLifetimeQr,
        maxUses,
        remainingUses: maxUses,
        useCount: 0,
        used: false,
        status: "active",
        revoked: false,
        manualSubmissionDefaults: {
          manualEntry: true,
          source: "manual-qr",
          name: "Anonymous",
          visitName: "",
          visitId: "",
          office: approvedOffice,
          officeName: approvedOffice,
          officeVisited: approvedOffice,
          unitOfficeVisited: approvedOffice,
          officialOfficeName,
        },
      });

      setGeneratedQr({
        id: docRef.id,
        token,
        accessKey,
        url: feedbackUrl,
        type: manualQrSettings.mode,
        office: approvedOffice,
        officialOfficeName,
        expiresAt,
        maxUses,
      });
      setManualQrSettingsOpen(false);
      setQrModalOpen(true);
    } catch (err) {
      const errorDetail = err?.code || err?.message || "Unknown error";
      alert(`Failed to generate manual feedback QR code: ${errorDetail}`);
    } finally {
      setIsGeneratingQr(false);
    }
  };

  const copyGeneratedUrl = async () => {
    if (!generatedQr?.url) return;

    try {
      await navigator.clipboard.writeText(generatedQr.url);
      alert("Manual feedback QR link copied.");
    } catch {
      alert("Could not copy the link. Please copy it manually.");
    }
  };

  const revokeManualQr = async (qrToken) => {
    if (!qrToken?.id || revokingQrId) return;

    const confirmed = window.confirm(
      "Revoke this QR code? Anyone scanning it after this will no longer be able to use it."
    );
    if (!confirmed) return;

    setRevokingQrId(qrToken.id);

    try {
      const qrDocRef = doc(db, "manualFeedbackTokens", qrToken.id);

      await updateDoc(qrDocRef, {
        revoked: true,
        status: "revoked",
        updatedAt: serverTimestamp(),
      });
      await deleteDoc(qrDocRef);
    } catch (err) {
      const errorDetail = err?.code || err?.message || "Unknown error";
      alert(`Failed to revoke QR code: ${errorDetail}`);
    } finally {
      setRevokingQrId("");
    }
  };

  const printGeneratedQr = () => {
    if (!generatedQr) return;

    const printWindow = window.open("", "_blank", "width=480,height=640");
    if (!printWindow) {
      alert("Please allow pop-ups so the QR code can be printed.");
      return;
    }

    const qrOfficeName = generatedQr.officialOfficeName || generatedQr.office;

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Manual Feedback QR Code</title>
          <style>
            @page {
              size: letter portrait;
              margin: 0.45in;
            }
            * {
              box-sizing: border-box;
            }
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              color: #111827;
              background: #ffffff;
            }
            .page {
              min-height: calc(11in - 0.9in);
              display: flex;
              align-items: flex-start;
              justify-content: center;
            }
            .qr-card {
              width: 100%;
              max-width: 720px;
              border: 0;
              border-radius: 0;
              overflow: hidden;
              background: #ffffff;
            }
            .header {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 20px;
              padding: 18px 28px 14px;
              border-bottom: 0;
              text-align: left;
              background: #ffffff;
            }
            .brand {
              display: flex;
              align-items: center;
              gap: 14px;
              min-width: 0;
            }
            .bisu-logo {
              width: 64px;
              height: 64px;
              object-fit: contain;
              flex: 0 0 auto;
            }
            .header-logos {
              display: flex;
              align-items: center;
              gap: 12px;
              flex: 0 0 auto;
            }
            .bagong-logo {
              width: 96px;
              height: 64px;
              object-fit: contain;
            }
            .iso-logo {
              width: 128px;
              height: 64px;
              object-fit: contain;
            }
            .header-text {
              line-height: 1.12;
              min-width: 0;
            }
            .header-text p {
              margin: 0;
              color: #111827;
            }
            .school {
              margin: 0;
              font-size: 16px;
              font-weight: 700;
              letter-spacing: 0.03em;
            }
            .republic {
              font-size: 14.67px;
            }
            .address,
            .header-office,
            .tagline {
              font-size: 13.33px;
            }
            .tagline {
              font-family: "Times New Roman", Times, serif;
              font-style: italic;
            }
            .content {
              padding: 22px 28px 26px;
              text-align: center;
            }
            h1 {
              font-size: 24px;
              margin: 0;
              letter-spacing: 0.02em;
              text-transform: uppercase;
              color: #000000;
            }
            .subtitle {
              margin: 8px auto 0;
              max-width: 390px;
              font-size: 13px;
              line-height: 1.45;
              color: #000000;
            }
            .office {
              margin: 14px auto 0;
              padding: 8px 12px;
              border: 0;
              border-radius: 999px;
              display: inline-block;
              font-size: 13px;
              font-weight: 700;
              color: #000000;
              background: #ffffff;
              max-width: 100%;
            }
            p {
              margin: 6px 0;
              font-size: 13px;
              color: #000000;
            }
            .qr-frame {
              width: 410px;
              height: 410px;
              margin: 22px auto 14px;
              padding: 16px;
              border: 4px solid #6b46c1;
              border-radius: 18px;
              background: #ffffff;
              position: relative;
            }
            .qr-frame::before,
            .qr-frame::after {
              content: "";
              position: absolute;
              inset: 8px;
              border: 1px solid #c4b5fd;
              border-radius: 12px;
              pointer-events: none;
            }
            .qr-frame img {
              width: 372px;
              height: 372px;
              display: block;
              margin: 0 auto;
            }
            .scan-line {
              margin: 0;
              font-size: 16px;
              font-weight: 700;
              color: #000000;
            }
            .footer-note {
              margin-top: 16px;
              font-size: 11px;
              color: #000000;
              line-height: 1.4;
            }
            @media print {
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="qr-card">
              <div class="header">
                <div class="brand">
                  <img class="bisu-logo" src="${bisuLogo}" alt="BISU Logo" />
                  <div class="header-text">
                    <p class="republic">Republic of the Philippines</p>
                    <p class="school">BOHOL ISLAND STATE UNIVERSITY</p>
                    <p class="address">Magsija, Balilihan 6342, Bohol, Philippines</p>
                    <p class="header-office">${escapeHtml(qrOfficeName)}</p>
                    <p class="tagline">Balance | Integrity | Stewardship | Uprightness</p>
                  </div>
                </div>
                <div class="header-logos">
                  <img class="bagong-logo" src="${bagongPilipinasLogo}" alt="Bagong Pilipinas Logo" />
                  <img class="iso-logo" src="${tuvISOLogo}" alt="ISO 9001:2015 Certification" />
                </div>
              </div>

              <div class="content">
                <h1>Feedback QR Code</h1>
                <p class="subtitle">Scan this code to open the digital Customer Satisfaction Feedback Form.</p>
                <p class="office">${escapeHtml(qrOfficeName)}</p>

                <div class="qr-frame">
                  <img src="${buildQrImageUrl(generatedQr.url)}" alt="Feedback QR Code" />
                </div>

                <p class="scan-line">Scan to submit feedback</p>

                <p class="footer-note">Keep this QR code visible and unobstructed. Reprint if the code becomes folded, faded, or difficult to scan.</p>
              </div>
            </div>
          </div>
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleConfirmPrint = () => {
    setShowPrintSignatoryModal(false);

    try {
      setPrintFooterSnapshot({
        printedDate: formatPrintFooterDate(new Date()),
      });

      setTimeout(() => {
        window.print();
      }, 0);
    } catch {
      alert("Failed to print. Please try again.");
    }
  };

  const sanitizeFileName = (value) =>
    toTrimmedText(value)
      .replace(/[\\/:*?"<>|]/g, "")   // strip characters invalid in filenames
      .replace(/\s+/g, "-")            // spaces -> hyphens
      .slice(0, 80) || "feedback-qr";

  const downloadGeneratedQr = async () => {
    if (!generatedQr?.url) return;

    try {
      const response = await fetch(buildQrImageUrl(generatedQr.url));
      if (!response.ok) throw new Error("Failed to fetch QR image");

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const officeLabel = sanitizeFileName(
        generatedQr.officialOfficeName || generatedQr.office
      );

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${officeLabel}-feedback-qr.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert("Could not download the QR code. Please try again.");
      console.error(err);
    }
  };

  // Handle view full action
  const handleViewFull = (visitor) => {
    try {
      if (!visitor) return;

      const modalData = {
        id: visitor.id || "",
        displayName: visitor.displayName || visitor.alias || "Anonymous",
        alias: visitor.alias || "",
        name: visitor.name || "Anonymous",
        office: visitor.office || "Unspecified",
        officialOfficeName:
          visitor.officialOfficeName ||
          getOfficialOfficeName(visitor.office, offices) ||
          visitor.office ||
          "Unspecified",
        date: visitor.date || "Date not available",
        comment: visitor.comment || "No feedback provided.",
        commendation: visitor.commendation || "No commendation provided.",
        suggestion: visitor.suggestion || "No suggestion provided.",
        satisfaction: visitor.satisfaction ?? null,
        answers: visitor.answers || [],
        questionRatings: visitor.questionRatings || [],
        createdAt: visitor.createdAt || new Date(),
        visitDateTime: visitor.visitDateTime || visitor.createdAt || null,
        visitId: visitor.visitId || "",
        sex: visitor.sex || "",
        clientType: visitor.clientType || "",
        regionOfResidence: visitor.regionOfResidence || "",
        serviceAvailed: visitor.serviceAvailed || "",
        servicedBy: visitor.servicedBy || "",
        cc1Rating: visitor.cc1Rating ?? null,
        cc2Rating: visitor.cc2Rating ?? null,
        cc3Rating: visitor.cc3Rating ?? null,
      };
      setSelectedVisitor(modalData);
    } catch {
      alert("Failed to open feedback details. Please try again.");
    }
  };

  const printOfficeName = PRINT_OFFICE_HEADER;

  const printRows = useMemo(() => {
    const rowsByOffice = new Map();

    filteredFeedbacks.forEach((feedback) => {
      const officeName = toTrimmedText(feedback?.office) || "Unspecified";

      if (!rowsByOffice.has(officeName)) {
        rowsByOffice.set(officeName, {
          office: officeName,
          commendations: [],
          suggestions: [],
        });
      }

      const row = rowsByOffice.get(officeName);
      const commendation = toTrimmedText(feedback?.commendation);
      const suggestion = toTrimmedText(feedback?.suggestion);

      if (
        commendation &&
        commendation !== "No commendation provided." &&
        !row.commendations.includes(commendation)
      ) {
        row.commendations.push(commendation);
      }

      if (
        suggestion &&
        suggestion !== "No suggestion provided." &&
        !row.suggestions.includes(suggestion)
      ) {
        row.suggestions.push(suggestion);
      }
    });

    const rows = [...rowsByOffice.values()].sort((a, b) =>
      a.office.localeCompare(b.office)
    );

    return rows;
  }, [filteredFeedbacks]);

  const printRowsForTable = useMemo(() => {
    if (printRows.length > 0) return printRows;

    return [
      {
        office: "N/A",
        commendations: [],
        suggestions: [],
      },
    ];
  }, [printRows]);

  useEffect(() => {
    setPrintTableFields((previous) => {
      const next = {};

      printRowsForTable.forEach((row) => {
        const officeKey = row.office || "N/A";
        const existing = previous[officeKey] || {};

        next[officeKey] = {
          commendation:
            existing.commendation ??
            (Array.isArray(row.commendations) && row.commendations.length > 0
              ? row.commendations.join("\n")
              : "N/A"),
          detailSuggestions:
            existing.detailSuggestions ??
            (Array.isArray(row.suggestions) && row.suggestions.length > 0
              ? row.suggestions.join("\n")
              : "N/A"),
          rootCause: existing.rootCause ?? "N/A",
          actionPlan: existing.actionPlan ?? "N/A",
          targetImplementation: existing.targetImplementation ?? "N/A",
          implementationStatus: existing.implementationStatus ?? "",
        };
      });

      return next;
    });
  }, [printRowsForTable]);

  const reportMonthLabel = useMemo(() => {
    let sourceDate = null;

    const rangeDate = dayRange.start || dayRange.end;
    if (rangeDate) {
      const [year, month] = rangeDate.split("-").map(Number);
      if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
        sourceDate = new Date(year, month - 1, 1);
      }
    }

    if (!sourceDate && filteredFeedbacks.length > 0) {
      const createdAt = filteredFeedbacks[0]?.createdAt;

      if (createdAt?.toDate) {
        sourceDate = createdAt.toDate();
      } else if (createdAt instanceof Date) {
        sourceDate = createdAt;
      } else if (typeof createdAt === "string") {
        const parsed = new Date(createdAt);
        if (!Number.isNaN(parsed.getTime())) {
          sourceDate = parsed;
        }
      }
    }

    if (!sourceDate) {
      sourceDate = new Date();
    }

    return sourceDate
      .toLocaleDateString("en-US", { month: "long", year: "numeric" })
      .toUpperCase();
  }, [dayRange.start, dayRange.end, filteredFeedbacks]);

  const preparedByNameForPrint =
    toTrimmedText(printSignatories.prepared) || "________________________";
  const verifiedByNameForPrint =
    toTrimmedText(printSignatories.verified) || "________________________";
  const approvedByNameForPrint =
    toTrimmedText(printSignatories.approved) || "________________________";
  const documentCodeForPrint =
    toTrimmedText(printFooterFields.documentCode) || "F-AQA-CSF-003";
  const revisionNumberForPrint =
    toTrimmedText(printFooterFields.revisionNumber) || "Rev 3";
  const printedDateForPrint =
    printFooterSnapshot.printedDate || formatPrintFooterDate(new Date());
  const printFooterContent = `${documentCodeForPrint} | ${revisionNumberForPrint} | ${printedDateForPrint} | Page 1 of 1`;
  const printFooterContentCSS = JSON.stringify(printFooterContent);
  const PRINT_PAGE_WIDTH_IN = 13;
  const PRINT_PAGE_HEIGHT_IN = 8.5;
  const PRINT_PAGE_MARGIN_TOP_CM = 1.27;
  const PRINT_PAGE_MARGIN_RIGHT_CM = 1.27;
  const PRINT_PAGE_MARGIN_BOTTOM_CM = 1.9;
  const PRINT_PAGE_MARGIN_LEFT_CM = 1.27;
  const PRINT_MARGIN_TOTAL_CM =
    PRINT_PAGE_MARGIN_LEFT_CM + PRINT_PAGE_MARGIN_RIGHT_CM;

  const renderPrintMultilineText = (value, fallback = "N/A", className = "") => {
    const text = toTrimmedText(value) || fallback;

    return (
      <div className={`whitespace-pre-line break-words ${className}`.trim()}>
        {text}
      </div>
    );
  };

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen dark:bg-[#1f1f1f] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-300">Loading feedback data...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen dark:bg-[#1f1f1f] flex items-center justify-center">
        <div className="text-center text-red-500 bg-red-50 dark:bg-red-900/20 p-6 rounded-lg max-w-md mx-auto">
          <p className="text-lg font-semibold">Error Loading Feedback</p>
          <p className="mt-2">{error.message || "Failed to load feedback data"}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Handle case where feedbacks is not an array
  if (!Array.isArray(feedbacks)) {
    return (
      <div className="min-h-screen dark:bg-[#1f1f1f] flex items-center justify-center">
        <div className="text-center text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 p-6 rounded-lg max-w-md mx-auto">
          <p className="text-lg font-semibold">Data Format Issue</p>
          <p className="mt-2">Feedback data is not in the expected format.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Screen View */}
      <div className="print:hidden min-h-screen dark:bg-[#1f1f1f]">
        <div className="px-4 sm:px-8 pt-6 pb-6 space-y-6 flex flex-col">

          {/* 🔍 Filters */}
          <FilterBar
            search={search}
            setSearch={setSearch}
            dayRange={dayRange}
            setDayRange={setDayRange}
            office={office}
            setOffice={setOffice}
            officeOptions={officeOptions}
            user={user}
            totalCount={feedbacks.length}
            filteredCount={filteredFeedbacks.length}
            onGenerateQRCode={isSuperAdmin ? openManualQrSettings : undefined}
            onManageQRCodes={isSuperAdmin ? () => setQrManagerOpen(true) : undefined}
            isGeneratingQRCode={isGeneratingQr}
          />

          {/* 📋 Feedback Table */}
          {filteredFeedbacks.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-lg shadow">
              {feedbacks.length === 0
                ? "No feedback data available yet."
                : "No feedback matches your filters."}
            </div>
          ) : (
            <>
              <FeedbackTable
                visitors={filteredFeedbacks}
                onViewFull={handleViewFull}
              />
            </>
          )}
        </div>

        {/* Modal Overlay */}
        {selectedVisitor && (
          <FeedbackModal
            isOpen={!!selectedVisitor}
            onClose={() => setSelectedVisitor(null)}
            visitor={selectedVisitor}
          />
        )}

        {manualQrSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-gray-900 dark:text-gray-100">
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    Generate Manual Feedback QR
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Admin approval for anonymous paper-form encoding.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setManualQrSettingsOpen(false)}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                  aria-label="Close manual QR settings"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 px-5 py-5">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
                    Office
                  </label>
                  {isOfficeAdmin ? (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                      {user?.office || "Assigned Office"}
                    </div>
                  ) : (
                    <select
                      value={manualQrSettings.officeName}
                      onChange={(event) =>
                        setManualQrSettings((previous) => ({
                          ...previous,
                          officeName: event.target.value,
                        }))
                      }
                      className="h-[42px] w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:bg-gray-900 dark:text-gray-200"
                    >
                      <option value="">All Offices</option>
                      {officeOptions.map((officeName) => (
                        <option key={`manual-qr-office-${officeName}`} value={officeName}>
                          {officeName}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                    Token Type
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setManualQrSettings((previous) => ({
                          ...previous,
                          mode: "lifetime",
                        }))
                      }
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${manualQrSettings.mode === "lifetime"
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                        : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        }`}
                    >
                      Lifetime
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setManualQrSettings((previous) => ({
                          ...previous,
                          mode: "single",
                          maxUses: 1,
                        }))
                      }
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${manualQrSettings.mode === "single"
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                        : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        }`}
                    >
                      Single-use
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setManualQrSettings((previous) => ({
                          ...previous,
                          mode: "batch",
                          maxUses: Math.max(2, Number(previous.maxUses) || 25),
                        }))
                      }
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${manualQrSettings.mode === "batch"
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                        : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        }`}
                    >
                      Batch
                    </button>
                  </div>
                </div>

                {manualQrSettings.mode === "lifetime" && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                    This QR opens the feedback form directly and stays active until an admin revokes it.
                  </div>
                )}

                {manualQrSettings.mode !== "lifetime" && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
                        Expires In
                      </label>
                      <select
                        value={manualQrSettings.expiresInHours}
                        onChange={(event) =>
                          setManualQrSettings((previous) => ({
                            ...previous,
                            expiresInHours: Number(event.target.value),
                          }))
                        }
                        className="h-[42px] w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:bg-gray-900 dark:text-gray-200"
                      >
                        <option value={1}>1 hour</option>
                        <option value={8}>8 hours</option>
                        <option value={24}>24 hours</option>
                        <option value={72}>3 days</option>
                        <option value={168}>7 days</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
                        Max Uses
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="500"
                        disabled={manualQrSettings.mode === "single"}
                        value={manualQrSettings.mode === "single" ? 1 : manualQrSettings.maxUses}
                        onChange={(event) =>
                          setManualQrSettings((previous) => ({
                            ...previous,
                            maxUses: Number(event.target.value),
                          }))
                        }
                        className="h-[42px] w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:bg-gray-100 disabled:text-gray-500 dark:bg-gray-900 dark:text-gray-200 dark:disabled:bg-gray-800"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 border-t border-gray-200 px-5 py-4 sm:flex-row sm:justify-end dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setManualQrSettingsOpen(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGenerateQRCode}
                  disabled={isGeneratingQr}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed"
                >
                  <QrCode size={16} />
                  {isGeneratingQr ? "Generating..." : "Generate Feedback QR"}
                </button>
              </div>
            </div>
          </div>
        )}

        {qrModalOpen && generatedQr && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-lg rounded-lg bg-white shadow-xl dark:bg-gray-900 dark:text-gray-100">
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    <QrCode size={22} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      Manual Feedback Approval QR
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {generatedQr.officialOfficeName || generatedQr.office}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setQrModalOpen(false)}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                  aria-label="Close QR code modal"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-5 py-5">
                <div className="flex flex-col items-center gap-4">
                  <div className="rounded-lg border border-gray-200 bg-white p-4">
                    <img
                      src={buildQrImageUrl(generatedQr.url)}
                      alt="Generated feedback QR code"
                      className="h-[280px] w-[280px]"
                    />
                  </div>

                  <div className="w-full space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Approval
                      </label>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                        {getQrUsageLabel(generatedQr)}
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Link
                      </label>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm break-all text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                        {generatedQr.url}
                      </div>
                    </div>

                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {getQrExpiryLabel(generatedQr)} Manual submissions should be saved as anonymous paper-form entries.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-gray-200 px-5 py-4 sm:flex-row sm:justify-end dark:border-gray-700">
                <button
                  type="button"
                  onClick={copyGeneratedUrl}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <Clipboard size={16} /> Copy Link
                </button>
                {/* <a
                  href={buildQrImageUrl(generatedQr.url)}
                  download={`feedback-qr-${generatedQr.token}.png`}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <Download size={16} /> Download
                </a> */}
                <button
                  type="button"
                  onClick={downloadGeneratedQr}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <Download size={16} /> Download
                </button>
                <button
                  type="button"
                  onClick={printGeneratedQr}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                  <Printer size={16} /> Print
                </button>
              </div>
            </div>
          </div>
        )}

        {qrManagerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl dark:bg-gray-900 dark:text-gray-100">
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    Manage Feedback QR Codes
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Revoke lifetime or temporary feedback access links.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setQrManagerOpen(false)}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                  aria-label="Close QR manager"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="max-h-[70vh] overflow-y-auto px-5 py-5">
                {manualQrTokensLoading ? (
                  <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    Loading QR codes...
                  </p>
                ) : manualQrTokens.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    No manual feedback QR codes found.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {manualQrTokens.map((qrToken) => {
                      const revoked = qrToken.revoked === true || qrToken.status === "revoked";
                      const active = !revoked && qrToken.status === "active";

                      return (
                        <div
                          key={qrToken.id}
                          className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-gray-900 dark:text-gray-100">
                                  {qrToken.officialOfficeName || qrToken.office || "All Offices"}
                                </p>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${active
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                                    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                                    }`}
                                >
                                  {revoked ? "Revoked" : qrToken.type === "lifetime" ? "Lifetime" : qrToken.status || "Active"}
                                </span>
                              </div>
                              <p className="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">
                                {qrToken.url}
                              </p>
                              <div className="mt-2 grid gap-1 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-2">
                                <span>Created: {formatQrDate(qrToken.createdAtClient || qrToken.createdAt)}</span>
                                <span>
                                  Uses: {qrToken.useCount || 0}
                                  {qrToken.type === "lifetime" ? "" : ` / ${qrToken.maxUses || 1}`}
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => revokeManualQr(qrToken)}
                              disabled={revoked || revokingQrId === qrToken.id}
                              className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30 dark:disabled:border-gray-700 dark:disabled:text-gray-500"
                            >
                              <Ban size={16} />
                              {revokingQrId === qrToken.id ? "Revoking..." : revoked ? "Revoked" : "Revoke"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Print View Only - CSF Monthly Commendations & Suggestions */}
      <div className="hidden print:block bg-white print-only-section text-black">
        <div className="csf-page p-6">
          <table className="print-wrapper w-full border-collapse">
            <thead>
              <tr>
                <th className="print-header-cell">
                  <div
                    className="flex items-start justify-between mb-4 gap-5"
                    style={{ paddingInline: "18px" }}
                  >
                    <div
                      className="flex items-center gap-4"
                      style={{ marginLeft: "14px" }}
                    >
                      <div className="w-16 h-16 flex items-center justify-center">
                        <img src={bisuLogo} alt="BISU Logo" className="w-full h-full object-contain" />
                      </div>
                      <div className="leading-tight">
                        <p className="text-[14.67px]">Republic of the Philippines</p>
                        <h1 className="text-[16px] font-bold tracking-wide print-header-title">
                          BOHOL ISLAND STATE UNIVERSITY
                        </h1>
                        <p className="text-[13.33px]">Magsija, Balilihan 6342, Bohol, Philippines</p>
                        <p className="text-[13.33px]">{printOfficeName}</p>
                        <p className="text-[13.33px] italic">Balance | Integrity | Stewardship | Uprightness</p>
                      </div>
                    </div>

                    <div
                      className="flex gap-3 items-center"
                      style={{ marginRight: "20px" }}
                    >
                      <div className="w-24 h-16 flex items-center justify-center">
                        <img
                          src={bagongPilipinasLogo}
                          alt="Bagong Pilipinas Logo"
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="w-32 h-16 flex items-center justify-center">
                        <img src={tuvISOLogo} alt="ISO 9001:2015 Certification" className="w-full h-full object-contain" />
                      </div>
                    </div>
                  </div>
                </th>
              </tr>
              <tr>
                <th>
                  <h2 className="text-center text-[20px] tracking-wide uppercase mb-2">
                    Monthly Customer Satisfaction Summary Form -{" "}
                    <span className="underline">{reportMonthLabel}</span>
                  </h2>


                </th>

              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <p className="text-[18px] font-semibold mb-2 text-left">
                    CSF Monthly Commendations &amp; Suggestions
                  </p>
                  <table className="w-full border-collapse csf-table">
                    <colgroup>
                      <col style={{ width: "16%" }} />
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "7%" }} />
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "9%" }} />
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "8%" }} />
                    </colgroup>
                    <thead>

                      <tr>
                        <th rowSpan={2} className="w-[16%]">Office</th>
                        <th rowSpan={2} className="w-[18%]">Commendation</th>
                        <th rowSpan={2} className="w-[18%]">Detail of Suggestions</th>
                        <th rowSpan={2} className="w-[7%]">Root Cause</th>
                        <th rowSpan={2} className="w-[8%]">Action Plan</th>
                        <th rowSpan={2} className="w-[9%]">Target of Implementation</th>
                        <th colSpan={3} className="w-[24%]">Status of Implementation</th>
                      </tr>
                      <tr>
                        <th>Implementation (Closed)</th>
                        <th>On-going / To be Implemented (Open)</th>
                        <th>Not Implemented</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printRowsForTable.map((row, index) => {
                        const officeKey = row.office || "N/A";
                        const fields = printTableFields[officeKey] || {};

                        return (
                          <tr key={`${row.office}-${index}`}>
                            <td>{renderPrintMultilineText(row.office, "N/A", "text-center")}</td>
                            <td>{renderPrintMultilineText(fields.commendation, "N/A")}</td>
                            <td>{renderPrintMultilineText(fields.detailSuggestions, "N/A")}</td>
                            <td>{renderPrintMultilineText(fields.rootCause, "N/A")}</td>
                            <td>{renderPrintMultilineText(fields.actionPlan, "N/A")}</td>
                            <td>{renderPrintMultilineText(fields.targetImplementation, "N/A")}</td>
                            <td className="text-center">
                              {renderPrintMultilineText(
                                fields.implementationStatus === "closed" ? "N/A" : "",
                                "",
                                "text-center",
                              )}
                            </td>
                            <td className="text-center">
                              {renderPrintMultilineText(
                                fields.implementationStatus === "open" ? "N/A" : "",
                                "",
                                "text-center",
                              )}
                            </td>
                            <td className="text-center">
                              {renderPrintMultilineText(
                                fields.implementationStatus === "notImplemented"
                                  ? "N/A"
                                  : "",
                                "",
                                "text-center",
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </td>
              </tr>
              <tr className="csf-signatories-row">
                <td className="csf-signatories-cell">
                  <div className="feedback-signatories">
                    <div className="grid grid-cols-2 gap-24 mb-2 feedback-signatories-row">
                      <div className="text-center feedback-signatory-group">
                        <p className="text-left mb-3">Prepared:</p>
                        <p className="font-semibold underline feedback-signatory-name">
                          {preparedByNameForPrint}
                        </p>
                        <p>Administrative Aide VI</p>
                      </div>

                      <div className="text-center feedback-signatory-group">
                        <p className="text-left mb-3">Verified:</p>
                        <p className="font-semibold underline feedback-signatory-name">
                          {verifiedByNameForPrint}
                        </p>
                        <p>Human Resource Management Officer II</p>
                      </div>
                    </div>

                    <div className="max-w-md mx-auto text-center feedback-signatories-row">
                      <div className="feedback-signatory-group">
                        <p className="mb-3 text-left pl-10">Approved:</p>
                        <p className="font-semibold underline feedback-signatory-name">
                          {approvedByNameForPrint}
                        </p>
                        <p>Campus Director</p>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {showPrintSignatoryModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/15 backdrop-blur-md p-4 no-print print:hidden">
          <div className="w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#faf5ff_0%,#ffffff_58%,#f8fafc_100%)] px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#553C9A] text-white shadow-lg shadow-violet-200/70">
                    <Printer size={18} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold tracking-tight text-slate-900">
                      Print Settings
                    </h3>
                    <p className="mt-1 max-w-xl text-sm text-slate-600">
                      Update the report signatories and footer details before
                      printing.
                    </p>
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-2 rounded-full border border-violet-100 bg-white/80 px-3 py-1 text-xs font-medium text-violet-700">
                  <FileText size={14} />
                  <span>Feedback Report</span>
                </div>
              </div>
            </div>

            <div className="max-h-[72vh] overflow-y-auto px-5 py-5 sm:px-6">
              <div className="grid gap-5 lg:grid-cols-[1.2fr_0.95fr]">
                <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-slate-900">
                      Signatories
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      These names will appear under the printed report.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                      <span>Prepared</span>
                      <input
                        type="text"
                        value={printSignatories.prepared}
                        onChange={(e) =>
                          handlePrintSignatoryChange("prepared", e.target.value)
                        }
                        placeholder="Enter name"
                        className="h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </label>

                    <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                      <span>Verified</span>
                      <input
                        type="text"
                        value={printSignatories.verified}
                        onChange={(e) =>
                          handlePrintSignatoryChange("verified", e.target.value)
                        }
                        placeholder="Enter name"
                        className="h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </label>
                  </div>

                  <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                    <span>Approved</span>
                    <input
                      type="text"
                      value={printSignatories.approved}
                      onChange={(e) =>
                        handlePrintSignatoryChange("approved", e.target.value)
                      }
                      placeholder="Enter name"
                      className="h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </label>
                </section>

                <section className="rounded-2xl border border-violet-100 bg-[linear-gradient(180deg,#fcfaff_0%,#ffffff_100%)] p-4 sm:p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Footer
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Date and page number are filled in automatically.
                      </p>
                    </div>
                    <div className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                      Auto
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                      <span>Document Code</span>
                      <input
                        type="text"
                        value={printFooterFields.documentCode}
                        onChange={(e) =>
                          handlePrintFooterFieldChange(
                            "documentCode",
                            e.target.value,
                          )
                        }
                        placeholder="Enter document code"
                        className="h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </label>

                    <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                      <span>Revision Number</span>
                      <input
                        type="text"
                        value={printFooterFields.revisionNumber}
                        onChange={(e) =>
                          handlePrintFooterFieldChange(
                            "revisionNumber",
                            e.target.value,
                          )
                        }
                        placeholder="Enter revision number"
                        className="h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Print Date
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-700">
                          {formatPrintFooterDate(new Date())}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Page Count
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-700">
                          Auto on print
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-dashed border-violet-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                        Footer Preview
                      </p>
                      <p className="mt-2 break-words text-sm text-slate-700">
                        {documentCodeForPrint} | {revisionNumberForPrint} |{" "}
                        {formatPrintFooterDate(new Date())} | Page 1 of 1
                      </p>
                    </div>
                  </div>
                </section>
              </div>

              <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-slate-900">
                    CSF Action Entries
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Add the action details that should appear in the printed
                    Root Cause and implementation status table.
                  </p>
                </div>

                <div className="space-y-5">
                  {printRowsForTable.map((row, index) => {
                    const officeKey = row.office || "N/A";
                    const fields = printTableFields[officeKey] || {};

                    return (
                      <div
                        key={`print-table-row-${officeKey}-${index}`}
                        className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                      >
                        <div className="mb-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">
                              {officeKey}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              Commendation and suggestions are auto-filled from
                              feedback. You can refine them and supply the action
                              details here.
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700 lg:col-span-2">
                            <span>Commendation</span>
                            <textarea
                              value={fields.commendation || ""}
                              onChange={(e) =>
                                handlePrintTableFieldChange(
                                  officeKey,
                                  "commendation",
                                  e.target.value,
                                )
                              }
                              rows={4}
                              placeholder="Enter commendation details"
                              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                          </label>

                          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700 lg:col-span-2">
                            <span>Detail of Suggestions</span>
                            <textarea
                              value={fields.detailSuggestions || ""}
                              onChange={(e) =>
                                handlePrintTableFieldChange(
                                  officeKey,
                                  "detailSuggestions",
                                  e.target.value,
                                )
                              }
                              rows={4}
                              placeholder="Enter detail of suggestions"
                              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                          </label>

                          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                            <span>Root Cause</span>
                            <textarea
                              value={fields.rootCause || ""}
                              onChange={(e) =>
                                handlePrintTableFieldChange(
                                  officeKey,
                                  "rootCause",
                                  e.target.value,
                                )
                              }
                              rows={4}
                              placeholder="Enter root cause"
                              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                          </label>

                          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                            <span>Action Plan</span>
                            <textarea
                              value={fields.actionPlan || ""}
                              onChange={(e) =>
                                handlePrintTableFieldChange(
                                  officeKey,
                                  "actionPlan",
                                  e.target.value,
                                )
                              }
                              rows={4}
                              placeholder="Enter action plan"
                              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                          </label>

                          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                            <span>Target of Implementation</span>
                            <textarea
                              value={fields.targetImplementation || ""}
                              onChange={(e) =>
                                handlePrintTableFieldChange(
                                  officeKey,
                                  "targetImplementation",
                                  e.target.value,
                                )
                              }
                              rows={4}
                              placeholder="Enter target of implementation"
                              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                          </label>
                        </div>

                        <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                          <span>Status of Implementation</span>
                          <select
                            value={fields.implementationStatus || ""}
                            onChange={(e) =>
                              handlePrintTableFieldChange(
                                officeKey,
                                "implementationStatus",
                                e.target.value,
                              )
                            }
                            className="h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                          >
                            <option value="">Select status</option>
                            <option value="closed">
                              Implementation (Closed)
                            </option>
                            <option value="open">
                              On-going / To be Implemented (Open)
                            </option>
                            <option value="notImplemented">
                              Not Implemented
                            </option>
                          </select>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
              <button
                type="button"
                onClick={() => setShowPrintSignatoryModal(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPrint}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#553C9A] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-200/70 hover:bg-[#44307B]"
              >
                <Printer size={16} />
                <span>Continue to Print</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print-specific styles */}
      <style>{`
        @media print {
          @page {
            size: ${PRINT_PAGE_WIDTH_IN}in ${PRINT_PAGE_HEIGHT_IN}in;
            margin: ${PRINT_PAGE_MARGIN_TOP_CM}cm ${PRINT_PAGE_MARGIN_RIGHT_CM}cm ${PRINT_PAGE_MARGIN_BOTTOM_CM}cm ${PRINT_PAGE_MARGIN_LEFT_CM}cm;
            @bottom-left {
              content: ${printFooterContentCSS};
              font-family: Arial, sans-serif;
              font-size: 11px;
              font-weight: 400;
              text-align: left;
              vertical-align: top;
              padding-top: 0.15cm;
              white-space: nowrap;
            }
          }

          body * {
            visibility: hidden;
          }
          
          .print-only-section,
          .print-only-section * {
            visibility: visible;
          }
          
          .print-only-section {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: #fff;
            margin: 0;
            padding: 0;
          }

          .print-wrapper > thead {
          display: table-header-group;
        }

        .print-wrapper > tbody {
          display: table-row-group;
        }

        .print-wrapper > thead > tr > th,
        .print-wrapper > thead > tr > td,
        .print-wrapper > tbody > tr > td {
          border: none !important;
          padding: 0;
          vertical-align: top;
        }

        .print-wrapper .print-header-cell {
          text-align: left;
          font-weight: normal;
        }

        .print-header-title {
          font-family: "Arial, sans-serif";
        }

        .print-header-title {
          font-family: Arial, sans-serif;
        }
          html,
          body {
            margin: 0;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          .csf-section {
          page-break-inside: auto;
          break-inside: auto;
        }

          .csf-table th,
          .csf-table td {
            border: 0.75px solid #000 !important;
            vertical-align: top;
            word-break: break-word;
            overflow-wrap: anywhere;
            white-space: normal;
            box-decoration-break: clone;
          -webkit-box-decoration-break: clone;
          }

          .csf-table th {
            font-size: 8pt;
            font-weight: 700;
            line-height: 1;
            text-align: center;
            padding: 6px 4px;
          }

          .csf-table {
            width: 100%;
            table-layout: fixed;
            page-break-inside: auto;
            break-inside: auto;
            border-collapse: separate;
            border-spacing: 0;
          }

          .csf-table thead {
          display: table-row-group !important;
        }

          .csf-table thead tr {
            page-break-inside: avoid;
            break-inside: avoid;
          }

          .csf-table tbody {
            display: table-row-group;
          }

          .csf-table tbody tr {
            page-break-inside: auto;
            break-inside: auto;
          }

          .csf-table td {
            font-size: 10pt;
            line-height: 1;
            padding: 6px 6px;
            page-break-inside: auto;
          break-inside: auto;
          overflow-wrap: anywhere;
          word-break: break-word;
          white-space: normal;
          vertical-align: top;
          }

          .csf-table ul {
            margin: 0;
            padding-left: 14px;
          }

          .csf-table li {
            margin-bottom: 3px;
          }

          .csf-signatories-row {
            page-break-inside: avoid;
            break-inside: avoid;
          }

          .csf-signatories-cell {
            border: none !important;
            padding: 0 !important;
          }

          .feedback-signatories {
            margin-top: 24px;
            font-size: 9pt;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .feedback-signatories-row,
          .feedback-signatory-group {
            margin-top: 0;
            line-height: 1;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .feedback-signatory-name {
            white-space: nowrap;
          }
          
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </>
  );
};

export default Feedback;
