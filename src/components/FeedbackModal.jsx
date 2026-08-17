import React from "react";
import { Printer, X } from "lucide-react";
import bisuLogo from "../assets/bisulogo.png";
import bagongPilipinasLogo from "../assets/bagong_pilipinas_logo.png";
import tuvISOLogo from "../assets/tuvISO_logo.png";

const SATISFACTION_DIMENSIONS = [
  "Responsiveness (Pag abi-abi).",
  "Reliability (Quality) (Kasaligan sa serbisyo).",
  "Access & Facilities (Sayon tuoron ang opisina, komportable ug maayo ang mga pasilidad).",
  "Communication (Pamagi sa pagpasabot).",
  "Costs (kantidad sa bayrunon).",
  "Integrity (Matinud-anun, makiangayon, ug patas).",
  "Assurance (Kapaniguruan sa serbisyo).",
  "Outcome (Naangkon ang husto nga serbisyo).",
];

const PRINT_OFFICE_HEADER = "Office of the Human Resource Management";

const isPlaceholderText = (value = "") => {
  const text = String(value || "").trim().toLowerCase();
  return (
    !text ||
    text === "no commendation provided." ||
    text === "no suggestion provided." ||
    text === "no feedback provided."
  );
};

const toTrimmedText = (value) =>
  typeof value === "string" ? value.trim() : "";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatRating = (value) => {
  const numeric = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)}/5` : "N/A";
};

const getDateObject = (value) => {
  if (!value) return null;

  if (value?.toDate && typeof value.toDate === "function") {
    const converted = value.toDate();
    return Number.isNaN(converted?.getTime?.()) ? null : converted;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const converted = new Date(value);
  return Number.isNaN(converted.getTime()) ? null : converted;
};

const formatVisitDate = (value) => {
  const date = getDateObject(value);
  if (!date) return "N/A";

  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
};

const formatVisitTime = (value) => {
  const date = getDateObject(value);
  if (!date) return "N/A";

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
};

const normalizeSex = (value) => {
  const text = toTrimmedText(value).toLowerCase();
  if (!text) return "";
  if (
    text === "m" ||
    text === "male" ||
    text.startsWith("male") ||
    text === "man" ||
    text === "boy"
  ) {
    return "male";
  }
  if (
    text === "f" ||
    text === "female" ||
    text.startsWith("female") ||
    text === "woman" ||
    text === "girl"
  ) {
    return "female";
  }
  return "";
};

const normalizeClientType = (value) => {
  const text = toTrimmedText(value).toLowerCase();
  if (!text) return "";
  if (
    text.includes("citizen") ||
    text.includes("individual") ||
    text.includes("resident") ||
    text.includes("student") ||
    text.includes("faculty") ||
    text.includes("employee") ||
    text.includes("parent") ||
    text.includes("alumni")
  ) {
    return "citizens";
  }
  if (
    text.includes("business") ||
    text.includes("company") ||
    text.includes("corporate") ||
    text.includes("enterprise")
  ) {
    return "business";
  }
  if (
    text.includes("government") ||
    text.includes("govt") ||
    text.includes("gov") ||
    text.includes("agency") ||
    text.includes("public")
  ) {
    return "government";
  }
  return "";
};

const normalizeCharterChoice = (value, maxOption) => {
  const numeric = typeof value === "number" ? value : parseFloat(value);
  if (Number.isFinite(numeric)) {
    const rounded = Math.round(numeric);
    if (rounded >= 1 && rounded <= maxOption) {
      return rounded;
    }
  }

  const text = toTrimmedText(value).toLowerCase();
  if (text === "n/a" || text === "na" || text === "not applicable") {
    return maxOption;
  }

  return null;
};

const normalizeSatisfactionColumn = (value) => {
  const text = toTrimmedText(value).toLowerCase();
  if (text === "n/a" || text === "na" || text === "not applicable") {
    return "na";
  }

  const numeric = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(numeric)) return null;

  const rounded = Math.round(numeric);
  if (rounded === 0 || rounded === 6) {
    return "na";
  }

  return Math.max(1, Math.min(5, rounded));
};

const getFieldValue = (value, fallback = "N/A") => {
  const text = toTrimmedText(value);
  return text || fallback;
};

const getNarrativeValue = (value) =>
  isPlaceholderText(value) ? "N/A" : getFieldValue(value);

const getFeedbackDisplayName = (visitor = {}) => {
  if (!visitor || typeof visitor !== "object") {
    return "Anonymous";
  }

  if (typeof visitor.displayName === "boolean") {
    if (visitor.displayName) {
      return "Anonymous";
    }

    return (
      toTrimmedText(visitor.name) ||
      toTrimmedText(visitor.alias) ||
      "Anonymous"
    );
  }

  const storedDisplayName = toTrimmedText(visitor.displayName);
  if (storedDisplayName) {
    const normalizedDisplayName = storedDisplayName.toLowerCase();

    if (normalizedDisplayName === "anonymous" || normalizedDisplayName === "anon") {
      return "Anonymous";
    }

    if (
      normalizedDisplayName === "name" ||
      normalizedDisplayName === "show name" ||
      normalizedDisplayName === "display name"
    ) {
      return (
        toTrimmedText(visitor.name) ||
        toTrimmedText(visitor.alias) ||
        "Anonymous"
      );
    }

    return storedDisplayName;
  }

  return toTrimmedText(visitor.name) || toTrimmedText(visitor.alias) || "Anonymous";
};

const renderChoiceOptions = (options, selectedValue) =>
  options
    .map(
      (option) => `
        <span class="choice">
          <span class="choice-box">${selectedValue === option.value ? "&#10003;" : ""}</span>
          <span class="choice-label">${escapeHtml(option.label)}</span>
        </span>
      `,
    )
    .join("");

const renderSatisfactionRows = (questionRatings = []) =>
  SATISFACTION_DIMENSIONS.map((label, index) => {
    const selectedColumn = normalizeSatisfactionColumn(
      questionRatings?.[index]?.rating,
    );

    const ratingCells = [5, 4, 3, 2, 1, "na"]
      .map(
        (value) => `
          <td class="score-check-cell">${selectedColumn === value ? "&#10003;" : ""
          }</td>
        `,
      )
      .join("");

    return `
      <tr>
        <td class="score-number">${index + 1}</td>
        <td class="score-label">${escapeHtml(label)}</td>
        ${ratingCells}
      </tr>
    `;
  }).join("");

const buildPrintableFeedbackHtml = (visitor) => {
  const visitMoment = visitor.visitDateTime || visitor.createdAt;
  const visitDate = formatVisitDate(visitMoment);
  const visitTime = formatVisitTime(visitMoment);
  const sexValue = normalizeSex(visitor.sex);
  const clientTypeValue = normalizeClientType(visitor.clientType);
  const cc1Value = normalizeCharterChoice(visitor.cc1Rating, 4);
  const cc2Value = normalizeCharterChoice(visitor.cc2Rating, 5);
  const cc3Value = normalizeCharterChoice(visitor.cc3Rating, 4);
  const ratedBy = getFeedbackDisplayName(visitor);
  const headerOfficeName = PRINT_OFFICE_HEADER;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Customer Satisfaction Feedback Form</title>
    <style>
      :root {
        --print-scale: 1;
        --font-scale: 1.2;
      }

      @page {
        size: letter portrait;
        margin: 0.22in;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        font-family: Arial, Helvetica, sans-serif;
        color: #111827;
        background: #ffffff;
        font-kerning: normal;
        font-feature-settings: "kern" 1;
        text-rendering: geometricPrecision;
      }

      body {
        padding: 0.08in;
      }

      .page-shell {
        width: 100%;
        overflow: hidden;
      }

      .page-frame {
        width: calc(100% / var(--print-scale));
        transform: scale(var(--print-scale));
        transform-origin: top left;
      }

      .sheet {
        width: 100%;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 10px;
      }

      .header-left {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        flex: 1;
        min-width: 0;
      }

      .header-right {
        display: flex;
        gap: 8px;
        align-items: flex-start;
      }

      .seal {
        width: 65px;
        height: 65px;
        object-fit: contain;
      }

      .mark {
        width: 75px;
        height: 70px;
        object-fit: contain;
      }

      .iso {
        width: 110px;
        height: 75px;
        object-fit: contain;
      }

      .header-copy {
        font-size: calc(9.5px * var(--font-scale));
        line-height: 1.16;
      }

      .header-copy h2 {
        margin: 1px 0;
        font-size: calc(12px * var(--font-scale));
        font-weight: 700;
      }

      .header-copy p {
        margin: 1px 0;
      }

      .header-copy .tagline {
        font-style: italic;
      }

      .title {
        margin: 8px 0 7px;
        text-align: center;
        font-size: calc(15px * var(--font-scale));
        font-weight: 700;
        letter-spacing: 0.01em;
      }

      .form-box {
        border: 1px solid #4b5563;
      }

      .field-grid {
        padding: 7px 9px 5px;
        border-bottom: 1px solid #4b5563;
      }

      .field-row {
        display: flex;
        gap: 10px;
        align-items: flex-end;
        margin-bottom: 4px;
      }

      .field-row:last-child {
        margin-bottom: 0;
      }

      .field {
        display: flex;
        align-items: flex-end;
        gap: 4px;
        min-width: 0;
      }

      .field.grow {
        flex: 1;
      }

      .field.compact {
        flex: 0 0 auto;
      }

      .field.client-type {
        flex: 1 1 0;
      }

      .field-label {
        font-size: calc(10.6px * var(--font-scale));
        font-weight: 700;
        white-space: nowrap;
      }

      .field-sub {
        font-size: calc(8.5px * var(--font-scale));
        color: #4b5563;
        white-space: nowrap;
      }

      .field-value {
        flex: 1;
        min-width: 58px;
        border-bottom: 1px solid #4b5563;
        padding: 0 3px 1px;
        font-size: calc(10.2px * var(--font-scale));
        min-height: 15px;
      }

      .choice-group {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
      }

      .choice {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: calc(9.2px * var(--font-scale));
      }

      .choice-label {
        letter-spacing: 0;
        word-spacing: 0;
        font-kerning: normal;
        font-feature-settings: "kern" 1;
        text-rendering: geometricPrecision;
      }

      .choice-box {
        width: 12px;
        height: 12px;
        border: 1px solid #111827;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: calc(9.5px * var(--font-scale));
        line-height: 1;
        font-weight: 700;
      }

      .instruction-block {
        padding: 6px 9px;
        border-bottom: 1px solid #4b5563;
      }

      .instruction-text {
        margin: 0 0 3px;
        font-size: calc(9.2px * var(--font-scale));
        line-height: 1.18;
      }

      .cc-section {
        margin-top: 5px;
        font-size: calc(9.2px * var(--font-scale));
        line-height: 1.16;
      }

      .cc-title {
        font-weight: 700;
        margin-right: 4px;
      }

      .cc-options {
        margin-top: 3px;
        padding-left: 14px;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 2px 8px;
      }

      .score-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }

      .score-no-col {
        width: 6%;
      }

      .score-dimension-col {
        width: 32%;
      }

      .score-rating-col {
        width: 10.33%;
      }

      .score-table th,
      .score-table td {
        border: 1px solid #4b5563;
        padding: 3px 4px;
        vertical-align: middle;
      }

      .score-table thead th {
        text-align: center;
        font-size: calc(8.6px * var(--font-scale));
        line-height: 1.1;
        font-weight: 700;
      }

      .score-header {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
      }

      .score-header-emoji {
        font-size: calc(12px * var(--font-scale));
        line-height: 1;
      }

      .score-number {
        width: 6%;
        text-align: center;
        font-size: calc(9px * var(--font-scale));
      }

      .score-label {
        width: 32%;
        font-size: calc(9px * var(--font-scale));
        line-height: 1.12;
      }

      .score-check-cell {
        text-align: center;
        font-size: calc(11.6px * var(--font-scale));
        font-weight: 700;
        width: 10.33%;
      }

      .feedback-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        border-top: 0;
      }

      .feedback-box {
        min-height: 60px;
        border-left: 1px solid #4b5563;
        border-right: 1px solid #4b5563;
        border-bottom: 1px solid #4b5563;
        padding: 5px 7px;
      }

      .feedback-box:first-child {
        border-right: 0;
      }

      .feedback-title {
        margin: 0 0 3px;
        font-size: calc(9.2px * var(--font-scale));
        font-weight: 700;
      }

      .feedback-value {
        font-size: calc(9px * var(--font-scale));
        line-height: 1.2;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .closing-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        width: 100%;
        margin: 0;
        border-left: 1px solid #4b5563;
        border-right: 1px solid #4b5563;
        border-bottom: 1px solid #4b5563;
        background: #ffffff;
      }

      .rated-by {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        padding: 8px 10px;
        border-right: 1px solid #4b5563;
      }

      .rated-by-label {
        flex: 0 0 auto;
        font-size: calc(10px * var(--font-scale));
        font-weight: 700;
        white-space: nowrap;
      }

      .rated-by-value {
        flex: 1;
        min-width: 70px;
        min-height: 15px;
        padding: 0 3px 1px;
        border-bottom: 1px solid #4b5563;
        font-size: calc(9.8px * var(--font-scale));
      }

      .closing-note {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px 10px;
        text-align: center;
        font-size: calc(11px * var(--font-scale));
        font-weight: 600;
      }

      .ref-line {
        margin: 3px 0 0;
        text-align: left;
        font-size: calc(8.4px * var(--font-scale));
        color: #111827;
      }

      @media print {
        body {
          padding: 0.04in;
        }
      }
    </style>
  </head>
  <body>
    <div class="page-shell">
      <div class="page-frame">
        <div class="sheet">
      <div class="header">
        <div class="header-left">
          <img class="seal" src="${bisuLogo}" alt="BISU logo" />
          <div class="header-copy">
            <p>Republic of the Philippines</p>
            <h2>BOHOL ISLAND STATE UNIVERSITY</h2>
            <p>Magsija, Balilihan 6342, Bohol, Philippines</p>
            <p>${escapeHtml(headerOfficeName)}</p>
            <p class="tagline">Balance | Integrity | Stewardship | Uprightness</p>
          </div>
        </div>
        <div class="header-right">
          <img class="mark" src="${bagongPilipinasLogo}" alt="Bagong Pilipinas logo" />
          <img class="iso" src="${tuvISOLogo}" alt="ISO certification logo" />
        </div>
      </div>

      <div class="title">CUSTOMER SATISFACTION FEEDBACK FORM</div>

      <div class="form-box">
        <div class="field-grid">
          <div class="field-row">
            <div class="field grow">
              <span class="field-label">Date of Visit</span>
              <span class="field-sub">(Petsa sa Pagbisita):</span>
              <span class="field-value">${escapeHtml(visitDate)}</span>
            </div>
            <div class="field grow">
              <span class="field-label">Time of Visit</span>
              <span class="field-sub">(Oras sa Pagbisita):</span>
              <span class="field-value">${escapeHtml(visitTime)}</span>
            </div>
          </div>

          <div class="field-row">
            <div class="field grow">
              <span class="field-label">Unit / Office Visited</span>
              <span class="field-sub">(Gibisita nga opisina):</span>
              <span class="field-value">${escapeHtml(
    getFieldValue(visitor.office || visitor.unitOfficeVisited),
  )}</span>
            </div>
          </div>

          <div class="field-row">
            <div class="field client-type">
              <span class="field-label">Client Type</span>
              <span class="field-sub">(Klase sa Bisita):</span>
              <span class="choice-group">
                ${renderChoiceOptions(
    [
      { value: "citizens", label: "Citizens" },
      { value: "business", label: "Business" },
      { value: "government", label: "Government" },
    ],
    clientTypeValue,
  )}
              </span>
            </div>
            <div class="field compact">
              <span class="field-label">Sex:</span>
              <span class="choice-group">
                ${renderChoiceOptions(
    [
      { value: "male", label: "Male" },
      { value: "female", label: "Female" },
    ],
    sexValue,
  )}
              </span>
            </div>
          </div>

          <div class="field-row">
            <div class="field grow">
              <span class="field-label">Region of Residence:</span>
              <span class="field-value">${escapeHtml(
    getFieldValue(visitor.regionOfResidence),
  )}</span>
            </div>
          </div>

          <div class="field-row">
            <div class="field grow">
              <span class="field-label">Services Availed</span>
              <span class="field-sub">(Mga serbisyo nga nadawat):</span>
              <span class="field-value">${escapeHtml(
    getFieldValue(visitor.serviceAvailed),
  )}</span>
            </div>
          </div>

          <div class="field-row">
            <div class="field grow">
              <span class="field-label">Serviced by</span>
              <span class="field-sub">(Tawo nga naghatag sa serbisyo):</span>
              <span class="field-value">${escapeHtml(
    getFieldValue(visitor.servicedBy),
  )}</span>
            </div>
          </div>
        </div>

        <div class="instruction-block">
          <p class="instruction-text">
            Instruction: Check mark (/) your answer to the Citizen&apos;s Charter (CC)
            questions. The Citizen&apos;s Charter is an official document that reflects
            the services of a government agency/office including its requirements,
            fees, and processing time among others.
          </p>

          <div class="cc-section">
            <span class="cc-title">CC1</span>
            <span>Which of the following best describes your awareness of a CC?</span>
            <div class="cc-options">
              ${renderChoiceOptions(
    [
      { value: 1, label: "I know what is CC and I saw this office's CC." },
      { value: 2, label: "I know what is CC but I did not see this office's CC." },
      { value: 3, label: "I learned of the CC only when I saw this office's CC." },
      { value: 4, label: "I do not know what a CC is and I did not see one." },
    ],
    cc1Value,
  )}
            </div>
          </div>

          <div class="cc-section">
            <span class="cc-title">CC2</span>
            <span>
              If aware of CC, would you say that the CC of this office was...
            </span>
            <div class="cc-options">
              ${renderChoiceOptions(
    [
      { value: 1, label: "Easy to see" },
      { value: 2, label: "Somewhat easy to see" },
      { value: 3, label: "Difficult to see" },
      { value: 4, label: "Not visible at all" },
      { value: 5, label: "N/A" },
    ],
    cc2Value,
  )}
            </div>
          </div>

          <div class="cc-section">
            <span class="cc-title">CC3</span>
            <span>
              If aware of CC, did the CC help you in your transaction?
            </span>
            <div class="cc-options">
              ${renderChoiceOptions(
    [
      { value: 1, label: "Helped very much" },
      { value: 2, label: "Somewhat helped" },
      { value: 3, label: "Did not help" },
      { value: 4, label: "N/A" },
    ],
    cc3Value,
  )}
            </div>
          </div>
        </div>

        <div class="instruction-block" style="padding-bottom:0;">
          <p class="instruction-text">
            Instruction: For items 1-8 please put a check mark (/) on the column
            that best corresponds to your answer.
          </p>
        </div>

        <table class="score-table">
          <colgroup>
            <col class="score-no-col" />
            <col class="score-dimension-col" />
            <col class="score-rating-col" />
            <col class="score-rating-col" />
            <col class="score-rating-col" />
            <col class="score-rating-col" />
            <col class="score-rating-col" />
            <col class="score-rating-col" />
          </colgroup>
          <thead>
            <tr>
              <th>No.</th>
              <th>Dimensions/Level of Satisfaction</th>
              <th>
                <div class="score-header">
                  <span>Very Satisfied (Nakontento pag-ayo)</span>
                  <span class="score-header-emoji">&#128515;</span>
                </div>
              </th>
              <th>
                <div class="score-header">
                  <span>Satisfied (Nakontento)</span>
                  <span class="score-header-emoji">&#128578;</span>
                </div>
              </th>
              <th>
                <div class="score-header">
                  <span>Neither Satisfied nor Dissatisfied (Neutral)</span>
                  <span class="score-header-emoji">&#128528;</span>
                </div>
              </th>
              <th>
                <div class="score-header">
                  <span>Dissatisfied (Wala nakontento)</span>
                  <span class="score-header-emoji">&#128577;</span>
                </div>
              </th>
              <th>
                <div class="score-header">
                  <span>Very Dissatisfied (Wala gayod nakontento)</span>
                  <span class="score-header-emoji">&#128542;</span>
                </div>
              </th>
              <th>
                <div class="score-header">
                  <span>Not Applicable (Walay Mabutang)</span>
                  <span class="score-header-emoji">&#128683;</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            ${renderSatisfactionRows(visitor.questionRatings)}
          </tbody>
        </table>

        <div class="feedback-grid">
          <div class="feedback-box">
            <p class="feedback-title">Commendation (Mga Padayeg)</p>
            <div class="feedback-value">${escapeHtml(
    getNarrativeValue(visitor.commendation),
  )}</div>
          </div>
          <div class="feedback-box">
            <p class="feedback-title">Suggestions (Mga Suhestyon)</p>
            <div class="feedback-value">${escapeHtml(
    getNarrativeValue(visitor.suggestion),
  )}</div>
          </div>
        </div>
      </div>

      <div class="closing-row">
        <div class="rated-by">
          <span class="rated-by-label">Rated by:</span>
          <span class="rated-by-value">${escapeHtml(ratedBy)}</span>
        </div>
        <div class="closing-note">&quot;Salamat sa imong Feedback&quot;</div>
      </div>
      <p class="ref-line">F-AQA-CSF-003 | Rev 3 | 07/01/24 | Page 1 of 1</p>
        </div>
      </div>
    </div>
    <script>
      (() => {
        const PAGE_HEIGHT_IN = 11;
        const PAGE_MARGIN_IN = 0.22 * 2;
        const BODY_PADDING_IN = 0.08 * 2;
        const MAX_CONTENT_HEIGHT_PX =
          (PAGE_HEIGHT_IN - PAGE_MARGIN_IN - BODY_PADDING_IN) * 96;

        const applyFit = () => {
          const root = document.documentElement;
          const sheet = document.querySelector(".sheet");

          if (!root || !sheet) return;

          root.style.setProperty("--print-scale", "1");

          window.requestAnimationFrame(() => {
            const naturalHeight = sheet.scrollHeight;
            if (!naturalHeight) return;

            const nextScale = Math.min(1, MAX_CONTENT_HEIGHT_PX / naturalHeight);
            root.style.setProperty("--print-scale", String(nextScale));
          });
        };

        window.addEventListener("load", applyFit);
        window.addEventListener("resize", applyFit);
        setTimeout(applyFit, 0);
        setTimeout(applyFit, 120);
      })();
    </script>
  </body>
</html>`;
};

const FeedbackModal = ({ isOpen, onClose, visitor }) => {
  if (!isOpen || !visitor) return null;

  const questionRatings = Array.isArray(visitor.questionRatings)
    ? visitor.questionRatings
    : [];
  const displayName = getFeedbackDisplayName(visitor);

  const handlePrintForm = () => {
    const printWindow = window.open("", "_blank", "width=980,height=1200");

    if (!printWindow) {
      window.alert("Please allow pop-ups so the printable feedback form can open.");
      return;
    }

    const html = buildPrintableFeedbackHtml(visitor);
    let hasTriggeredPrint = false;

    const triggerPrint = () => {
      if (hasTriggeredPrint) return;
      hasTriggeredPrint = true;

      printWindow.focus();
      printWindow.setTimeout(() => {
        printWindow.print();
      }, 350);
    };

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = triggerPrint;
    printWindow.setTimeout(triggerPrint, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-lg relative flex flex-col max-h-[82vh]">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
          aria-label="Close feedback details"
        >
          <X size={20} />
        </button>

        <div className="px-6 pt-6 pb-4 border-b border-gray-200">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 wrap-break-word">
                Feedback Details{" "}
                <span className="text-sm text-gray-500">
                  ({visitor.office || "Unspecified"})
                </span>
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Displayed as:{" "}
                <span className="font-medium text-gray-700">{displayName}</span>
              </p>
              <p className="text-sm text-gray-500 mt-1">{visitor.date}</p>
              <p className="text-sm font-medium text-yellow-600 mt-2">
                Overall Rating: {formatRating(visitor.satisfaction)}
              </p>
            </div>

            <button
              type="button"
              onClick={handlePrintForm}
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-100"
            >
              <Printer size={16} />
              Print Form
            </button>
          </div>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
          <section className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                Visit Info
              </h4>
              <p className="mt-2 text-sm text-gray-700">
                Date/Time:{" "}
                <span className="font-medium text-gray-800">
                  {formatVisitDate(visitor.visitDateTime || visitor.createdAt)} |{" "}
                  {formatVisitTime(visitor.visitDateTime || visitor.createdAt)}
                </span>
              </p>
              <p className="mt-1 text-sm text-gray-700">
                Office:{" "}
                <span className="font-medium text-gray-800">
                  {getFieldValue(visitor.office)}
                </span>
              </p>
              <p className="mt-1 text-sm text-gray-700">
                Service Availed:{" "}
                <span className="font-medium text-gray-800">
                  {getFieldValue(visitor.serviceAvailed)}
                </span>
              </p>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                Form Fields
              </h4>
              <p className="mt-2 text-sm text-gray-700">
                Client Type:{" "}
                <span className="font-medium text-gray-800">
                  {getFieldValue(visitor.clientType)}
                </span>
              </p>
              <p className="mt-1 text-sm text-gray-700">
                Sex:{" "}
                <span className="font-medium text-gray-800">
                  {getFieldValue(visitor.sex)}
                </span>
              </p>
              <p className="mt-1 text-sm text-gray-700">
                Region:{" "}
                <span className="font-medium text-gray-800">
                  {getFieldValue(visitor.regionOfResidence)}
                </span>
              </p>
              <p className="mt-1 text-sm text-gray-700">
                Serviced By:{" "}
                <span className="font-medium text-gray-800">
                  {getFieldValue(visitor.servicedBy)}
                </span>
              </p>
            </div>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Commendation</h4>
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg wrap-break-word">
              <p className="text-gray-700 whitespace-pre-line">
                {visitor.commendation || "No commendation provided."}
              </p>
            </div>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Suggestion</h4>
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg wrap-break-word">
              <p className="text-gray-700 whitespace-pre-line">
                {visitor.suggestion || "No suggestion provided."}
              </p>
            </div>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              Rating Per Question
            </h4>
            {questionRatings.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50">
                <table className="min-w-full table-fixed border-collapse">
                  <colgroup>
                    <col style={{ width: "78%" }} />
                    <col style={{ width: "22%" }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border-b border-gray-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-gray-600">
                        Question
                      </th>
                      <th className="border-b border-gray-200 px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-gray-600">
                        Rating
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {questionRatings.map((item, index) => (
                      <tr
                        key={`${item.question || "question"}-${index}`}
                        className="align-top"
                      >
                        <td className="border-b border-gray-200 px-4 py-3 text-sm text-gray-700 wrap-break-word">
                          {item.question || `Question ${index + 1}`}
                        </td>
                        <td className="border-b border-gray-200 px-4 py-3 text-right text-sm font-semibold text-yellow-600 whitespace-nowrap">
                          {formatRating(item.rating)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-500">
                  Question-level ratings are not available for this feedback.
                </p>
              </div>
            )}
          </section>
        </div>

        {/* <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Close
          </button>
          
        </div> */}
      </div>
    </div>
  );
};

export default FeedbackModal;
