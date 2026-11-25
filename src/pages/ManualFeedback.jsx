/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, onSnapshot, serverTimestamp, Timestamp } from "firebase/firestore";
import { IoChevronDown } from "react-icons/io5";
import {
    MdSentimentDissatisfied,
    MdSentimentNeutral,
    MdSentimentSatisfied,
    MdSentimentVeryDissatisfied,
    MdSentimentVerySatisfied,
} from "react-icons/md";
import { AlertTriangle, CheckCircle2, Check, ShieldAlert } from "lucide-react";
import { db } from "../lib/firebase";
import bisuLogo from "../assets/bisulogo.png";
import bagongPilipinasLogo from "../assets/bagong_pilipinas_logo.png";
import tuvIsoLogo from "../assets/tuvISO_logo.png";

/* -------------------------------------------------------------------------- */
/*  Form definition (same questions as the public VisiTrak web form)          */
/* -------------------------------------------------------------------------- */

const RATING_QUESTIONS = [
    "Responsiveness (Pag abi-abi).",
    "Reliability (Quality) (Masaligan sa serbisyo).",
    "Access & Facilities (Sayon tuoron ang opisina, komportable ug maayo ang mga pasilidad).",
    "Communication (Pamaagi sa pagpasabot).",
    "Costs (Klaridad sa bayranan).",
    "Integrity (Matuinod-anon, makiangayon, ug patas).",
    "Assurance (Kasiguruhan sa serbisyo).",
    "Outcome (Nahatag ang hustong serbisyo).",
];

const REGION_OPTIONS = [
    "NONE",
    "NCR",
    "CAR",
    "I",
    "II",
    "III",
    "IV-A",
    "IV-B",
    "V",
    "VI",
    "VII",
    "VIII",
    "IX",
    "X",
    "XI",
    "XII",
    "XIII",
    "BARMM",
];

const CC_QUESTIONS = [
    {
        id: "cc1",
        title: "CC1",
        text: "Which of the following best describes your awareness of a CC?",
        gridClass: "grid grid-cols-1 gap-y-2",
        options: [
            { value: "1", label: "1 - I know what a CC is and I saw this office's CC." },
            { value: "2", label: "2 - I know what a CC is but I did not see its office's CC." },
            { value: "3", label: "3 - I learned of the CC only when I saw this office's CC." },
            {
                value: "4",
                label: "4 - I do not know what a CC is and I did not see one in this office.",
                note: "(Answer 'N/A' on CC2 and CC3)",
            },
        ],
    },
    {
        id: "cc2",
        title: "CC2",
        text: "If aware of CC (answered 1-3 in CC1), would you say that the CC of this office was..?",
        gridClass: "grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2",
        options: [
            { value: "1", label: "1 - Easy to see" },
            { value: "2", label: "2 - Somewhat easy to see" },
            { value: "3", label: "3 - Difficult to see" },
            { value: "4", label: "4 - Not visible at all" },
            { value: "5", label: "5 - N/A" },
        ],
    },
    {
        id: "cc3",
        title: "CC3",
        text: "If aware of CC (answered codes 1-3 in CC1), how much did the CC help you in your transaction?",
        gridClass: "grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2",
        options: [
            { value: "1", label: "1 - Helped very much" },
            { value: "2", label: "2 - Somewhat helped" },
            { value: "3", label: "3 - Did not help" },
            { value: "4", label: "4 - N/A" },
        ],
    },
];

const CC_NOT_AWARE = "4"; // CC1 answer that auto-fills CC2/CC3 as N/A
const CC2_NA = "5";
const CC3_NA = "4";

const RATING_ICONS = [
    { value: 5, Icon: MdSentimentVerySatisfied, color: "#4f46e5" },
    { value: 4, Icon: MdSentimentSatisfied, color: "#22c55e" },
    { value: 3, Icon: MdSentimentNeutral, color: "#eab308" },
    { value: 2, Icon: MdSentimentDissatisfied, color: "#f97316" },
    { value: 1, Icon: MdSentimentVeryDissatisfied, color: "#ef4444" },
];

const RATING_LABELS = {
    1: "Very unsatisfied (1)",
    2: "Unsatisfied (2)",
    3: "Neutral (3)",
    4: "Satisfied (4)",
    5: "Very satisfied (5)",
};

const FORM_FOOTER = "F-AQA-CSF-003 | Rev. 3 | 07/01/24 | Page 1 of 1";

const labelClass = "text-xs sm:text-sm font-semibold text-[#1f1f1f]";
const fieldClass =
    "w-full mt-1 rounded-md border border-[#b9b9b9] bg-white px-3 py-2 text-sm text-[#232323] outline-none focus:border-[#7f5bb3] focus:ring-2 focus:ring-[#7f5bb3]/30";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const toText = (value) => (typeof value === "string" ? value.trim() : "");

const isSuperAdminUser = (user) =>
    toText(user?.type).toLowerCase() === "superadmin" || toText(user?.role).toLowerCase() === "super";

const isSelectableOffice = (value) => {
    const text = toText(value).toLowerCase();
    return Boolean(text) && text !== "all offices" && text !== "super admin";
};

const pad = (n) => String(n).padStart(2, "0");

const toDateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const toTimeInput = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const buildVisitDate = (dateStr, timeStr) => {
    const now = new Date();
    if (!dateStr) return now;

    const [y, m, d] = dateStr.split("-").map(Number);
    const [hh, mm] = (timeStr || "12:00").split(":").map(Number);
    const result = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);

    if (Number.isNaN(result.getTime())) return now;
    return result > now ? now : result; // never store a future date
};

// dateOfVisit / timeOfVisit: pass "" to start with "None". Leave undefined for "now".
const makeBlankForm = (office = "", dateOfVisit, timeOfVisit) => {
    const now = new Date();
    return {
        office,
        dateOfVisit: dateOfVisit ?? toDateInput(now),
        timeOfVisit: timeOfVisit ?? toTimeInput(now),
        clientType: "",
        sex: "",
        region: "VII",
        servicesAvailed: "",
        servicedBy: "",
        cc: { cc1: "", cc2: "", cc3: "" },
        answers: {}, // { 1: 5, 2: 0 (N/A), ... } - unanswered questions are absent
        commendation: "",
        suggestion: "",
    };
};

/** Everything the paper form has that is still blank (informational only). */
const getMissingItems = (form) => {
    const missing = [];
    if (!form.dateOfVisit) missing.push("Date of Visit");
    if (!form.timeOfVisit) missing.push("Time of Visit");
    if (!form.clientType) missing.push("Client Type");
    if (!form.sex) missing.push("Sex");
    if (!form.region) missing.push("Region of Residence");
    if (!form.cc.cc1) missing.push("CC1");
    if (!form.cc.cc2) missing.push("CC2");
    if (!form.cc.cc3) missing.push("CC3");
    RATING_QUESTIONS.forEach((_, index) => {
        if (form.answers[index + 1] === undefined) missing.push(`Rating ${index + 1}`);
    });
    return missing;
};

/** A save needs at least SOME real content, otherwise it is an empty record. */
const hasAnyContent = (form) =>
    Object.keys(form.answers).length > 0 ||
    Boolean(form.cc.cc1 || form.cc.cc2 || form.cc.cc3) ||
    Boolean(toText(form.commendation) || toText(form.suggestion));

/* -------------------------------------------------------------------------- */
/*  Small UI pieces                                                           */
/* -------------------------------------------------------------------------- */

const RatingInput = ({ value, onChange }) => {
    const notApplicable = value === 0;

    return (
        <div className="w-full">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between w-full gap-4">
                <div className="flex items-center justify-between w-full md:flex-1 md:pr-6">
                    {RATING_ICONS.map(({ value: iconValue, Icon, color }) => {
                        const active = value === iconValue;
                        return (
                            <div key={iconValue} className="flex flex-col items-center">
                                <button
                                    type="button"
                                    onClick={() => onChange(active ? undefined : iconValue)}
                                    aria-label={`Rate ${iconValue}`}
                                    className={`p-2.5 sm:p-3 rounded-full transition focus:outline-none focus:ring-2 focus:ring-[#8f8f8f]/40 ${active ? "ring-1 ring-black/10 shadow-sm bg-[#ececec]" : "hover:bg-[#ececec]"
                                        }`}
                                >
                                    <Icon
                                        className="w-9 h-9 sm:w-10 sm:h-10 transition-colors"
                                        style={{ color: active ? color : "#9b9b9b" }}
                                    />
                                </button>
                                <span
                                    className="text-xs sm:text-sm mt-0.5 font-medium"
                                    style={{ color: active ? color : "#777777" }}
                                >
                                    {iconValue}
                                </span>
                            </div>
                        );
                    })}
                </div>

                <button
                    type="button"
                    onClick={() => onChange(notApplicable ? undefined : 0)}
                    className="flex items-center w-fit md:shrink-0 px-2 py-1 rounded-md hover:bg-[#ececec] focus:outline-none focus:ring-2 focus:ring-[#8f8f8f]/40"
                >
                    <div
                        className={`w-4 h-4 mr-2 rounded-[3px] border flex items-center justify-center ${notApplicable ? "bg-[#4f4f4f] border-[#4f4f4f]" : "border-[#878787] bg-white"
                            }`}
                    >
                        {notApplicable && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="text-[#2f2f2f] text-sm sm:text-base font-medium select-none whitespace-nowrap">
                        Not Applicable.
                    </span>
                </button>
            </div>

            <div className="mt-2 text-xs sm:text-sm text-[#777777] min-h-5 text-center">
                {value === undefined
                    ? "Not answered (can be left blank)"
                    : notApplicable
                        ? "Not Applicable selected"
                        : `Selected: ${RATING_LABELS[value]}`}
            </div>
        </div>
    );
};

const ModalShell = ({ children }) => (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 text-gray-800 shadow-2xl">{children}</div>
    </div>
);

/* -------------------------------------------------------------------------- */
/*  The actual encoding form (only ever mounted for Super Admin)              */
/* -------------------------------------------------------------------------- */

const ManualFeedbackForm = ({ user }) => {
    const [offices, setOffices] = useState([]);
    const [form, setForm] = useState(() => makeBlankForm());
    const [error, setError] = useState("");
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(null); // { office, incomplete, missingCount }
    const [savedCount, setSavedCount] = useState(0);
    const topRef = useRef(null);

    const todayInput = toDateInput(new Date());

    /* ---- offices (each office = its own form header / its own data) ---- */
    useEffect(() => {
        const unsub = onSnapshot(
            collection(db, "offices"),
            (snapshot) => {
                const list = snapshot.docs
                    .map((d) => {
                        const data = d.data() || {};
                        return {
                            id: d.id,
                            name: toText(data.name),
                            officialName: toText(data.officialName),
                            role: toText(data.role).toLowerCase() || "office",
                        };
                    })
                    .filter((o) => o.role !== "super" && isSelectableOffice(o.name))
                    .sort((a, b) => a.name.localeCompare(b.name));
                setOffices(list);
            },
            () => setOffices([]),
        );
        return () => unsub();
    }, []);

    const selectedOffice = useMemo(() => offices.find((o) => o.name === form.office) || null, [offices, form.office]);

    const headerOfficeName = selectedOffice?.officialName || selectedOffice?.name || form.office || "Select an office";

    const missingItems = useMemo(() => getMissingItems(form), [form]);
    const answeredCount = Object.keys(form.answers).length;
    const ccCount = Object.values(form.cc).filter(Boolean).length;

    /* ---- field updaters ---- */
    const setField = (field, value) => {
        setError("");
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const setAnswer = (number, value) => {
        setError("");
        setForm((prev) => {
            const answers = { ...prev.answers };
            if (value === undefined) delete answers[number];
            else answers[number] = value;
            return { ...prev, answers };
        });
    };

    const toggleCc = (questionId, optionValue) => {
        setError("");
        setForm((prev) => {
            const cc = { ...prev.cc };
            const togglingOff = cc[questionId] === optionValue;

            if (questionId === "cc1") {
                if (togglingOff) {
                    return { ...prev, cc: { cc1: "", cc2: "", cc3: "" } };
                }
                if (optionValue === CC_NOT_AWARE) {
                    return { ...prev, cc: { cc1: CC_NOT_AWARE, cc2: CC2_NA, cc3: CC3_NA } };
                }
                // leaving the "not aware" option frees CC2/CC3 again
                return prev.cc.cc1 === CC_NOT_AWARE
                    ? { ...prev, cc: { cc1: optionValue, cc2: "", cc3: "" } }
                    : { ...prev, cc: { ...cc, cc1: optionValue } };
            }

            cc[questionId] = togglingOff ? "" : optionValue;
            return { ...prev, cc };
        });
    };

    /* ---- step 1: validate the few hard requirements, then ask to confirm ---- */
    const handleReview = () => {
        if (saving) return;

        if (!isSelectableOffice(form.office)) {
            setError("Select the office this paper form belongs to. This is the only required field.");
            topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }

        if (!hasAnyContent(form)) {
            setError("The form is empty. Fill in at least one rating, CC answer, commendation or suggestion.");
            return;
        }

        if (form.dateOfVisit && form.dateOfVisit > todayInput) {
            setError("Date of Visit cannot be in the future.");
            topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }

        setConfirmOpen(true);
    };

    /* ---- step 2: save to Firestore (works even when the form is incomplete) ---- */
    const handleSave = async () => {
        // Defence in depth: the page is already Super Admin only.
        if (!isSuperAdminUser(user) || saving) return;

        setSaving(true);
        setError("");

        try {
            const answers = {};
            Object.entries(form.answers).forEach(([key, value]) => {
                answers[String(key)] = Number(value);
            });

            // N/A (0) and unanswered questions are excluded from the average.
            const rated = Object.values(answers).filter((v) => v >= 1 && v <= 5);
            const averageRating = rated.length ? rated.reduce((sum, v) => sum + v, 0) / rated.length : 0;

            const officeName = form.office.trim();
            const officialOfficeName = selectedOffice?.officialName || officeName;
            // No date written on the paper form -> fall back to "now" for createdAt
            // (the feedback list is ordered by createdAt, so it must always exist).
            const hasVisitDate = Boolean(form.dateOfVisit);
            const visitDate = buildVisitDate(form.dateOfVisit, form.timeOfVisit);
            const missing = getMissingItems(form);
            const commendation = form.commendation.trim();
            const suggestion = form.suggestion.trim();

            const surveyDetails = {
                clientType: form.clientType || null,
                sex: form.sex || null,
                dateOfVisit: form.dateOfVisit || null,
                timeOfVisit: form.timeOfVisit || null,
                region: form.region || null,
                unitOfficeVisited: officeName,
                servicesAvailed: form.servicesAvailed.trim(),
                servicedBy: form.servicedBy.trim(),
                commendation,
                suggestion,
                citizensCharter: { ...form.cc },
            };

            const payload = {
                // same shape the visitor form saves, so every existing page keeps working
                visitId: null,
                name: "Anonymous",
                displayName: "Anonymous",
                answers,
                averageRating,
                commendation,
                suggestion,
                surveyDetails,
                office: officeName,
                unitOfficeVisited: officeName,
                officialOfficeName,

                // manual-encoding markers
                manualEntry: true,
                source: "admin-manual-encoding",
                isIncomplete: missing.length > 0,
                missingFields: missing,
                answeredRatings: Object.keys(answers).length,

                // paper form's visit date drives monthly reports; encodedAt is the audit time
                visitDateTime: hasVisitDate ? Timestamp.fromDate(visitDate) : null,
                visitDateMissing: !hasVisitDate,
                visitTimeMissing: !form.timeOfVisit,
                createdAt: Timestamp.fromDate(visitDate),
                encodedAt: serverTimestamp(),
                encodedBy: {
                    uid: user?.uid || user?.id || "",
                    name: user?.name || "",
                    email: user?.email || "",
                },
            };

            await addDoc(collection(db, "feedbacks"), payload);

            setConfirmOpen(false);
            setSaved({
                office: officialOfficeName,
                incomplete: missing.length > 0,
                missingCount: missing.length,
            });
            setSavedCount((count) => count + 1);
        } catch (err) {
            console.error("Manual feedback save failed:", err);
            setConfirmOpen(false);
            setError(`Failed to save feedback: ${err?.code || err?.message || "Unknown error"}`);
            topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        } finally {
            setSaving(false);
        }
    };

    const handleEncodeNext = () => {
        // keep the office + date so a stack of paper forms can be typed in quickly
        setForm((prev) => makeBlankForm(prev.office, prev.dateOfVisit, ""));
        setSaved(null);
        setError("");
        topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const handleClear = () => {
        if (!window.confirm("Clear everything on this form?")) return;
        setForm((prev) => makeBlankForm(prev.office, prev.dateOfVisit, ""));
        setError("");
    };

    /* ---------------------------------------------------------------------- */

    return (
        <div className="mx-auto max-w-5xl pb-10" ref={topRef}>
            {/* Banner */}
            <div className="mb-4 rounded-xl border border-[#7400EA] bg-white p-4 dark:bg-gray-900">
                <div className="flex items-start gap-3">
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#7400EA]" />
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            Manual Feedback Encoding
                        </h2>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                            Super Admin only. Type in paper feedback forms here. Unlike the public form, you can save a
                            form even if some fields were left blank by the visitor. Only the <strong>office</strong> is
                            required. Entries are saved as Anonymous and flagged as incomplete when something is blank.
                        </p>
                        {savedCount > 0 && (
                            <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                {savedCount} form{savedCount !== 1 ? "s" : ""} saved this session.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Progress */}
            <div className="sticky top-0 z-30 mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-xs font-medium text-purple-900 shadow-sm dark:border-purple-900 dark:bg-purple-950 dark:text-purple-100 sm:text-sm">
                <span>
                    Ratings: {answeredCount}/{RATING_QUESTIONS.length}
                </span>
                <span>CC: {ccCount}/3</span>
                <span
                    className={
                        missingItems.length
                            ? "text-amber-700 dark:text-amber-300"
                            : "text-emerald-700 dark:text-emerald-300"
                    }
                >
                    {missingItems.length ? `${missingItems.length} blank item(s)` : "Form is complete"}
                </span>
                <span className="truncate">Office: {form.office || "not selected"}</span>
            </div>

            {/* Paper form */}
            <div className="rounded-2xl border border-white/80 bg-white p-4 text-[#1f1f1f] shadow-xl sm:p-6 md:p-7">
                {/* Header: follows the selected office */}
                <div className="bg-white px-2 py-3 sm:px-5 sm:py-4">
                    <div className="grid grid-cols-[48px_minmax(0,1fr)_94px] items-center gap-2 text-left sm:grid-cols-[80px_minmax(0,1fr)_148px] sm:gap-3 md:grid-cols-[96px_minmax(0,1fr)_176px] md:gap-4">
                        <img
                            src={bisuLogo}
                            alt="BISU logo"
                            className="h-12 w-12 object-contain sm:h-20 sm:w-20 md:h-24 md:w-24"
                        />
                        <div className="min-w-0 leading-tight text-[#202020]">
                            <p className="text-[8px] sm:text-xs md:text-sm">Republic of the Philippines</p>
                            <p className="text-[10px] font-extrabold uppercase leading-snug sm:text-base md:text-lg">
                                Bohol Island State University
                            </p>
                            <p className="text-[8px] sm:text-xs md:text-sm">
                                Magsija, Balilihan 6342, Bohol, Philippines
                            </p>
                            <p className="text-[8px] font-semibold sm:text-xs md:text-sm">{headerOfficeName}</p>
                            <p className="font-serif text-[8px] italic sm:text-xs md:text-sm">
                                Balance | Integrity | Stewardship | Uprightness
                            </p>
                        </div>
                        <div className="flex items-center justify-end gap-1 sm:gap-2">
                            <img
                                src={bagongPilipinasLogo}
                                alt="Bagong Pilipinas"
                                className="h-9 w-9 object-contain sm:h-14 sm:w-14 md:h-16 md:w-16"
                            />
                            <img
                                src={tuvIsoLogo}
                                alt="TUV ISO"
                                className="h-9 w-14 object-contain sm:h-14 sm:w-24 md:h-16 md:w-28"
                            />
                        </div>
                    </div>
                    <h1 className="mt-4 border-t border-[#d8d8d8] px-1 pt-4 text-center text-sm font-extrabold uppercase tracking-wide text-[#111] sm:text-lg lg:text-xl">
                        Customer Satisfaction Feedback Form
                    </h1>
                </div>

                {/* Date / time (both optional: tick "None" when the visitor left it blank) */}
                <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                        <div className="flex items-center justify-between">
                            <span className={labelClass}>Date of Visit (Petsa sa Pagbisita) :</span>
                            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-[#5f5f5f]">
                                <input
                                    type="checkbox"
                                    checked={!form.dateOfVisit}
                                    onChange={(e) => setField("dateOfVisit", e.target.checked ? "" : todayInput)}
                                    className="h-3.5 w-3.5 rounded-[3px] border-[#808080]"
                                />
                                None
                            </label>
                        </div>
                        <input
                            type="date"
                            value={form.dateOfVisit}
                            max={todayInput}
                            onChange={(e) => setField("dateOfVisit", e.target.value)}
                            className={fieldClass}
                        />
                    </div>

                    <div>
                        <div className="flex items-center justify-between">
                            <span className={labelClass}>Time of Visit (Oras sa Pagbisita) :</span>
                            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-[#5f5f5f]">
                                <input
                                    type="checkbox"
                                    checked={!form.timeOfVisit}
                                    onChange={(e) =>
                                        setField("timeOfVisit", e.target.checked ? "" : toTimeInput(new Date()))
                                    }
                                    className="h-3.5 w-3.5 rounded-[3px] border-[#808080]"
                                />
                                None
                            </label>
                        </div>
                        <input
                            type="time"
                            value={form.timeOfVisit}
                            onChange={(e) => setField("timeOfVisit", e.target.value)}
                            className={fieldClass}
                        />
                    </div>
                </div>

                {/* Client type / sex */}
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md px-2 py-1 text-sm text-[#2f2f2f]">
                        <span className={labelClass}>Client Type:</span>
                        {["Citizen", "Business", "Government"].map((option) => (
                            <label
                                key={option}
                                className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap leading-none"
                            >
                                <input
                                    type="checkbox"
                                    checked={form.clientType === option}
                                    onChange={() => setField("clientType", form.clientType === option ? "" : option)}
                                    className="h-3.5 w-3.5 shrink-0 rounded-[3px] border-[#808080]"
                                />
                                <span>{option}</span>
                            </label>
                        ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 rounded-md px-2 py-1 text-sm text-[#2f2f2f]">
                        <span className={labelClass}>Sex:</span>
                        {["Male", "Female"].map((option) => (
                            <label
                                key={option}
                                className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap leading-none"
                            >
                                <input
                                    type="checkbox"
                                    checked={form.sex === option}
                                    onChange={() => setField("sex", form.sex === option ? "" : option)}
                                    className="h-3.5 w-3.5 shrink-0 rounded-[3px] border-[#808080]"
                                />
                                <span>{option}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Region / office */}
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="relative">
                        <label
                            htmlFor="mf-region"
                            className="absolute -top-2 left-3 z-10 bg-white px-1.5 text-[11px] font-semibold leading-none text-[#5f5f5f] sm:text-xs"
                        >
                            Region of Residence
                        </label>
                        <select
                            id="mf-region"
                            value={form.region}
                            onChange={(e) => setField("region", e.target.value)}
                            className="w-full appearance-none rounded-md border border-[#575757] bg-transparent px-3 py-2.5 pr-10 text-sm text-[#1f1f1f] outline-none focus:border-[#4b4b4b] sm:text-base"
                        >
                            {REGION_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                        </select>
                        <IoChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-black" />
                    </div>

                    <div className="relative">
                        <label
                            htmlFor="mf-office"
                            className="absolute -top-2 left-3 z-10 bg-white px-1.5 text-[11px] font-semibold leading-none text-[#5f5f5f] sm:text-xs"
                        >
                            Unit / Office Visited (Gibisita nga opisina) *
                        </label>
                        <select
                            id="mf-office"
                            value={form.office}
                            onChange={(e) => setField("office", e.target.value)}
                            className={`w-full appearance-none rounded-md border bg-transparent px-3 py-2.5 pr-10 text-sm text-[#1f1f1f] outline-none sm:text-base ${error && !isSelectableOffice(form.office)
                                ? "border-red-500"
                                : "border-[#575757] focus:border-[#4b4b4b]"
                                }`}
                        >
                            <option value="">Select an office</option>
                            {offices.map((o) => (
                                <option key={o.id} value={o.name}>
                                    {o.name}
                                </option>
                            ))}
                        </select>
                        <IoChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-black" />
                    </div>
                </div>

                {/* Services / serviced by */}
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className={labelClass}>
                        Services Availed (Mga serbisyo nga nadawat) :
                        <input
                            type="text"
                            value={form.servicesAvailed}
                            onChange={(e) => setField("servicesAvailed", e.target.value)}
                            placeholder="Type here..."
                            className={fieldClass}
                        />
                    </label>
                    <label className={labelClass}>
                        Serviced by (Tawo nga naghatag sa serbisyo) :
                        <input
                            type="text"
                            value={form.servicedBy}
                            onChange={(e) => setField("servicedBy", e.target.value)}
                            placeholder="Type here..."
                            className={fieldClass}
                        />
                    </label>
                </div>

                <div className="my-4 border-t-4 border-[#6f4aa7]" />

                <p className="mb-4 text-xs leading-relaxed text-[#2f2f2f] sm:text-sm">
                    Instructions: Tap you answer to the Citizen&apos;s Charter (CC) questions. The Citizen&apos;s
                    Charter is an official document that reflects the services of a government agency/office including
                    its requirements, fees, and processing time among others.
                </p>

                {/* CC questions */}
                <div className="space-y-5">
                    {CC_QUESTIONS.map((question) => (
                        <section key={question.id} className="rounded-md px-2 py-1">
                            <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                                <span className="text-sm font-semibold leading-none text-[#1f1f1f] sm:pt-0.5 sm:text-base">
                                    {question.title}
                                </span>
                                <p className="text-sm leading-snug text-[#1f1f1f] sm:text-base">{question.text}</p>
                            </div>
                            <div className={question.gridClass}>
                                {question.options.map((option) => {
                                    const selected = form.cc[question.id] === option.value;
                                    const lockedByCc1 =
                                        form.cc.cc1 === CC_NOT_AWARE &&
                                        (question.id === "cc2" || question.id === "cc3");

                                    return (
                                        <label
                                            key={option.value}
                                            className={`inline-flex items-start gap-2 text-xs leading-snug sm:text-sm ${lockedByCc1
                                                ? "cursor-not-allowed text-[#737373]"
                                                : "cursor-pointer text-[#2f2f2f]"
                                                }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selected}
                                                disabled={lockedByCc1}
                                                onChange={() => toggleCc(question.id, option.value)}
                                                className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border-[#707070] disabled:cursor-not-allowed"
                                            />
                                            <span>
                                                {option.label}
                                                {option.note && <span className="italic"> {option.note}</span>}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>

                <div className="my-5 border-t-4 border-[#6f4aa7]" />

                <h2 className="mb-3 text-lg font-bold text-[#1f1f1f] sm:text-xl">Tap your rate.</h2>

                <div>
                    {RATING_QUESTIONS.map((text, index) => (
                        <div
                            key={text}
                            className={index !== RATING_QUESTIONS.length - 1 ? "border-b border-[#d7d7d7]" : ""}
                        >
                            <div className="mb-4 rounded-lg px-1 sm:mb-5 sm:px-2">
                                <p className="mb-3 font-semibold leading-relaxed text-[#1f1f1f]">
                                    <span className="mr-1.5 text-sm font-medium text-[#2c2c2c]">{index + 1}.</span>
                                    {text}
                                </p>
                                <RatingInput
                                    value={form.answers[index + 1]}
                                    onChange={(value) => setAnswer(index + 1, value)}
                                />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Comments */}
                <div className="mt-5 space-y-5">
                    <div>
                        <label className="mb-2 block text-sm font-semibold text-[#1f1f1f] sm:text-base">
                            Commendations (Mga Pagdayeg)
                        </label>
                        <textarea
                            value={form.commendation}
                            onChange={(e) => setField("commendation", e.target.value)}
                            maxLength={500}
                            rows={4}
                            placeholder="Write the commendations here..."
                            className="min-h-[110px] w-full resize-none rounded-2xl border-[3px] border-[#595959] bg-white px-5 py-4 text-sm text-[#2b2b2b] outline-none placeholder:text-[#6f6f6f] focus:border-[#4b4b4b] sm:min-h-[130px] sm:text-base"
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-sm font-semibold text-[#1f1f1f] sm:text-base">
                            Suggestions (Mga Sugyot)
                        </label>
                        <textarea
                            value={form.suggestion}
                            onChange={(e) => setField("suggestion", e.target.value)}
                            maxLength={500}
                            rows={4}
                            placeholder="Write the suggestions here..."
                            className="min-h-[110px] w-full resize-none rounded-2xl border-[3px] border-[#595959] bg-white px-5 py-4 text-sm text-[#2b2b2b] outline-none placeholder:text-[#6f6f6f] focus:border-[#4b4b4b] sm:min-h-[130px] sm:text-base"
                        />
                    </div>
                </div>

                <div className="mt-5 flex items-center gap-4 px-2 sm:px-8">
                    <div className="h-0.5 flex-1 bg-[#1f1f1f]" />
                    <p className="whitespace-nowrap text-center text-sm font-semibold italic text-[#2a2a2a] sm:text-base">
                        &ldquo;Salamat sa imong Feedback&rdquo;
                    </p>
                    <div className="h-0.5 flex-1 bg-[#1f1f1f]" />
                </div>

                {error && (
                    <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {error}
                    </div>
                )}

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <button
                        type="button"
                        onClick={handleClear}
                        disabled={saving}
                        className="rounded-lg border border-[#552b98] px-5 py-3 font-semibold text-[#552b98] transition hover:bg-purple-50 disabled:opacity-60"
                    >
                        Clear Form
                    </button>
                    <button
                        type="button"
                        onClick={handleReview}
                        disabled={saving}
                        className="flex-1 rounded-lg bg-[#552b98] py-3 font-bold tracking-wide text-white transition hover:bg-[#45207e] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {saving ? "Saving..." : "REVIEW & SAVE FEEDBACK"}
                    </button>
                </div>

                <p className="pt-4 text-left text-[9px] font-bold leading-none text-black sm:text-[10px]">
                    {FORM_FOOTER}
                </p>
            </div>

            {/* Confirm modal */}
            {confirmOpen && (
                <ModalShell>
                    {missingItems.length > 0 ? (
                        <>
                            <div className="mb-3 flex items-center gap-3">
                                <AlertTriangle className="h-7 w-7 shrink-0 text-amber-500" />
                                <h3 className="text-lg font-bold">This form is incomplete</h3>
                            </div>
                            <p className="mb-3 text-sm text-gray-600">
                                {missingItems.length} item(s) are blank. As Super Admin you can still save it. It will
                                be stored for <strong>{headerOfficeName}</strong> and flagged as incomplete.
                            </p>
                            <div className="mb-4 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg bg-amber-50 p-2">
                                {missingItems.map((item) => (
                                    <span
                                        key={item}
                                        className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                                    >
                                        {item}
                                    </span>
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="mb-3 flex items-center gap-3">
                                <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-500" />
                                <h3 className="text-lg font-bold">Save this feedback?</h3>
                            </div>
                            <p className="mb-4 text-sm text-gray-600">
                                The form is complete and will be saved for <strong>{headerOfficeName}</strong>.
                            </p>
                        </>
                    )}

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => setConfirmOpen(false)}
                            disabled={saving}
                            className="flex-1 rounded-lg border border-gray-300 py-2.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                        >
                            {missingItems.length > 0 ? "Go back" : "Cancel"}
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="flex-1 rounded-lg bg-[#552b98] py-2.5 font-semibold text-white hover:bg-[#45207e] disabled:opacity-60"
                        >
                            {saving ? "Saving..." : missingItems.length > 0 ? "Save anyway" : "Save"}
                        </button>
                    </div>
                </ModalShell>
            )}

            {/* Success modal */}
            {saved && (
                <ModalShell>
                    <div className="text-center">
                        <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
                        <h3 className="text-xl font-bold">Feedback saved</h3>
                        <p className="mt-2 text-sm text-gray-600">
                            Saved for <strong>{saved.office}</strong>
                            {saved.incomplete
                                ? ` as an incomplete form (${saved.missingCount} blank item${saved.missingCount !== 1 ? "s" : ""}).`
                                : "."}
                        </p>
                        <div className="mt-5 flex gap-3">
                            <button
                                type="button"
                                onClick={() => setSaved(null)}
                                className="flex-1 rounded-lg border border-gray-300 py-2.5 font-semibold text-gray-700 hover:bg-gray-50"
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={handleEncodeNext}
                                className="flex-1 rounded-lg bg-[#552b98] py-2.5 font-semibold text-white hover:bg-[#45207e]"
                            >
                                Encode next form
                            </button>
                        </div>
                    </div>
                </ModalShell>
            )}
        </div>
    );
};

/* -------------------------------------------------------------------------- */
/*  Page wrapper: hard Super Admin gate                                       */
/* -------------------------------------------------------------------------- */

const ManualFeedback = ({ user }) => {
    if (!isSuperAdminUser(user)) {
        return (
            <div className="mx-auto mt-10 max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950/30">
                <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-red-500" />
                <h2 className="text-lg font-semibold text-red-700 dark:text-red-300">Access denied</h2>
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    Only the Super Admin can encode manual feedback.
                </p>
            </div>
        );
    }

    return <ManualFeedbackForm user={user} />;
};

export default ManualFeedback;