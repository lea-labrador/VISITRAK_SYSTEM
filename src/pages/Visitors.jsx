import React, { useState, useMemo, useEffect } from "react";
import FilterBar from "../components/FilterBar";
import VisitorTable from "../components/VisitorTable";
import VisitorInfoModal from "../components/VisitorInfoModal";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { Printer } from "lucide-react";
import { db } from "../lib/firebase";
import bisuLogo from "../assets/bisulogo.png";
import bagongPilipinasLogo from "../assets/bagong_pilipinas_logo.png";
import tuvISOLogo from "../assets/tuvISO_logo.png";

const getNumericRating = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeQuestionRatings = (answers) => {
  if (!answers) return [];

  if (Array.isArray(answers)) {
    return answers.map((answer, index) => {
      if (answer && typeof answer === "object") {
        return {
          question:
            answer.question ||
            answer.label ||
            answer.text ||
            answer.title ||
            answer.prompt ||
            answer.item ||
            `Question ${index + 1}`,
          rating: getNumericRating(
            answer.rating ??
              answer.score ??
              answer.value ??
              answer.answer ??
              answer.selected
          ),
        };
      }

      return {
        question: `Question ${index + 1}`,
        rating: getNumericRating(answer),
      };
    });
  }

  if (typeof answers === "object") {
    return Object.entries(answers).map(([question, rating], index) => ({
      question: question || `Question ${index + 1}`,
      rating: getNumericRating(rating),
    }));
  }

  return [];
};

const formatPrintFooterDate = () => "09/09/25";

const formatPrintTableDate = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${month}-${day}-${year}`;
};

const getVisitorSortTime = (visitor) => {
  const sourceDate = visitor?.rawDate || visitor?.checkInTime || null;
  const parsed =
    sourceDate instanceof Date ? sourceDate : new Date(sourceDate || 0);
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
};

const getVisitorContactLines = (visitor) => {
  const contactNumber = String(visitor?.contactNumber || "").trim();
  const email = String(visitor?.email || "").trim();

  return [contactNumber, email].filter(
    (value, index, values) => value && values.indexOf(value) === index
  );
};

const getDefaultMonthDateRange = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const monthValue = `${year}-${String(month).padStart(2, "0")}`;
  const lastDay = new Date(year, month, 0).getDate();

  return {
    start: `${monthValue}-01`,
    end: `${monthValue}-${String(lastDay).padStart(2, "0")}`,
  };
};

const DEFAULT_PRINT_DOCUMENT_CODE = "F-AQA-CSF-002";
const DEFAULT_PRINT_REVISION_NUMBER = "Rev. 3";
const PRINT_PAGE_WIDTH_IN = 13;
const PRINT_PAGE_HEIGHT_IN = 8.5;
const PRINT_PAGE_MARGIN_TOP_CM = 0.5;
const PRINT_PAGE_MARGIN_RIGHT_CM = 0.5;
const PRINT_PAGE_MARGIN_BOTTOM_CM = 1.9;
const PRINT_PAGE_MARGIN_LEFT_CM = 0.5;
const PRINT_ROWS_PER_PAGE = 18;
const PRINT_HEADER_ROW_HEIGHT_IN = 0.42;
const PRINT_BODY_ROW_HEIGHT_IN = 0.29;
const PRINT_CONTACT_FONT_SIZE_PX = 11;

const Visitors = ({ user = { type: "SuperAdmin", office: null } }) => {
  const defaultMonthDateRange = useMemo(() => getDefaultMonthDateRange(), []);
  const [search, setSearch] = useState("");
  const [officeFilter, setOfficeFilter] = useState("All Offices");
  const [startDateFilter, setStartDateFilter] = useState(
    defaultMonthDateRange.start
  );
  const [endDateFilter, setEndDateFilter] = useState(defaultMonthDateRange.end);
  const [visits, setVisits] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offices, setOffices] = useState([]); 
  const [selectedVisitor, setSelectedVisitor] = useState(null);
  const [showPrintFooterModal, setShowPrintFooterModal] = useState(false);
  const [printFooterFields, setPrintFooterFields] = useState({
    documentCode: DEFAULT_PRINT_DOCUMENT_CODE,
    revisionNumber: DEFAULT_PRINT_REVISION_NUMBER,
  });
  const [printFooterSnapshot, setPrintFooterSnapshot] = useState(() => ({
    printedDate: formatPrintFooterDate(new Date()),
  }));

  // Fetch visits from Firestore
  useEffect(() => {
    const q = query(collection(db, "visits"), orderBy("checkInTime", "desc"));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => {
          const d = doc.data();
          const checkInTime = d.checkInTime?.toDate() || new Date();
          const checkOutTime = d.checkOutTime?.toDate() || null;

          return {
            id: doc.id,
            visitorId: d.visitorId,
            name: d.visitorName || d.name || "Unknown Visitor",
            email: d.email || "",
            phone: d.phone || "",
            contactNumber: d.contactNumber || d.phone || d.email || "",
            office: d.office || "Unknown Office",
            purpose: d.purpose || "",
            checkInTime: checkInTime,
            checkOutTime: checkOutTime,
            status: d.status || (checkOutTime ? "checked-out" : "checked-in"),
            // Format for display
            date: checkInTime.toLocaleDateString("en-US", {
              month: "short",
              day: "2-digit",
              year: "numeric",
            }),
            timeIn: checkInTime.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            }),
            timeOut: checkOutTime
              ? checkOutTime.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })
              : "-",
            // For filtering by exact date
            rawDate: checkInTime,
          };
        });

        setVisits(data);
      },
      (error) => {
        console.warn("Unable to load visitor records.", error);
      }
    );

    return () => {
      unsub();
    };
  }, []);

  // Fetch feedbacks from Firestore
  useEffect(() => {
    const q = query(collection(db, "feedbacks"), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => {
          const d = doc.data();
          const rawAnswers = d.answers ?? d.questionRatings ?? d.ratings ?? [];
          return {
            id: doc.id,
            visitId: d.visitId,
            averageRating: d.averageRating || 0,
            createdAt: d.createdAt?.toDate() || new Date(),
            questionRatings: normalizeQuestionRatings(rawAnswers),
          };
        });

        setFeedbacks(data);
        setLoading(false);
      },
      (error) => {
        console.warn("Unable to load visitor feedback ratings.", error);
        setLoading(false);
      }
    );

    return () => {
      unsub();
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
            role: d.role || "",
            email: d.email || "",
          };
        });

        setOffices(data);
      },
      (error) => {
        console.warn("Unable to load offices.", error);
      }
    );

    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    const handleBeforePrint = () => {
      setPrintFooterSnapshot({
        printedDate: formatPrintFooterDate(new Date()),
      });
    };

    window.addEventListener("beforeprint", handleBeforePrint);

    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint);
    };
  }, []);

  const handlePrintFooterFieldChange = (field, value) => {
    setPrintFooterFields((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  // Combine visits with feedback question ratings for visitor details
  const visitsWithRatings = useMemo(() => {
    return visits.map(visit => {
      const feedback = feedbacks.find(f => f.visitId === visit.id);
      
      return {
        ...visit,
        questionRatings: feedback?.questionRatings || [],
      };
    });
  }, [visits, feedbacks]);
  // Export to PDF function
  const exportPDF = () => {
    setShowPrintFooterModal(true);
  };

  const handleConfirmPrint = () => {
    setShowPrintFooterModal(false);

    try {
      setPrintFooterSnapshot({
        printedDate: formatPrintFooterDate(new Date()),
      });

      setTimeout(() => {
        window.print();
      }, 0);
    } catch  {
      alert('Failed to print. Please try again.');
    }
  };

  const handleViewVisitorDetails = (visitor) => {
    setSelectedVisitor(visitor || null);
  };

  // Get unique offices from visits for the filter dropdown
  const uniqueOffices = useMemo(() => {
    const offices = visitsWithRatings
      .map(v => v.office)
      .filter((office, index, self) => 
        office && office.trim() !== "" && self.indexOf(office) === index
      )
      .sort();
    
    return ["All Offices", ...offices];
  }, [visitsWithRatings]);

  // Filter visits based on user office (if OfficeAdmin)
  const officeFiltered = useMemo(() => {
    if (user.type === "OfficeAdmin" && user.office) {
      return visitsWithRatings.filter((v) => v.office === user.office);
    }
    return visitsWithRatings;
  }, [visitsWithRatings, user]);

  // Apply search, office dropdown (if SuperAdmin), and date range filters
  const filteredVisitors = useMemo(() => {
    return officeFiltered.filter((v) => {
      const matchSearch = 
        v.name.toLowerCase().includes(search.toLowerCase()) ||
        (v.email && v.email.toLowerCase().includes(search.toLowerCase())) ||
        (v.phone && v.phone.includes(search));
      
      const matchOffice =
        user.type === "SuperAdmin"
          ? officeFilter === "All Offices" || v.office === officeFilter
          : true;
      
      const visitorDate = v.rawDate ? new Date(v.rawDate) : new Date();
      let matchesStart = true;
      let matchesEnd = true;

      if (startDateFilter) {
        const startDate = new Date(startDateFilter);
        startDate.setHours(0, 0, 0, 0);
        matchesStart = visitorDate >= startDate;
      }

      if (endDateFilter) {
        const endDate = new Date(endDateFilter);
        endDate.setHours(23, 59, 59, 999);
        matchesEnd = visitorDate <= endDate;
      }

      return matchSearch && matchOffice && matchesStart && matchesEnd;
    });
  }, [officeFiltered, search, officeFilter, startDateFilter, endDateFilter, user.type]);

  // Print view should list oldest records first.
  const printVisitors = useMemo(() => {
    return [...filteredVisitors].sort((a, b) => {
      const timeDiff = getVisitorSortTime(a) - getVisitorSortTime(b);
      if (timeDiff !== 0) return timeDiff;
      return String(a?.id || "").localeCompare(String(b?.id || ""));
    });
  }, [filteredVisitors]);

  const printPages = useMemo(() => {
    const pages = [];

    if (printVisitors.length === 0) {
      return [{ rows: [], emptyRowCount: PRINT_ROWS_PER_PAGE }];
    }

    for (let startIndex = 0; startIndex < printVisitors.length; startIndex += PRINT_ROWS_PER_PAGE) {
      const rows = printVisitors
        .slice(startIndex, startIndex + PRINT_ROWS_PER_PAGE)
        .map((visitor) => ({
          ...visitor,
          _printContactLines: getVisitorContactLines(visitor),
        }));

      pages.push({
        rows,
        emptyRowCount: PRINT_ROWS_PER_PAGE - rows.length,
      });
    }

    return pages.filter((page) => page.rows.length > 0);
  }, [printVisitors]);

  const currentOfficeRecord = useMemo(() => {
    if (!user || offices.length === 0) return null;

    if (user.id) {
      const byId = offices.find(o => o.id === user.id);
      if (byId) return byId;
    }

    const userEmail = user.email ? user.email.toLowerCase().trim() : "";
    if (userEmail) {
      const byEmail = offices.find(o => (o.email || "").toLowerCase().trim() === userEmail);
      if (byEmail) return byEmail;
    }

    if (user.office) {
      const byOfficeName = offices.find(o => o.name === user.office);
      if (byOfficeName) return byOfficeName;
    }

    if (user.type === "SuperAdmin") {
      return offices.find(o => o.role === "super") || null;
    }

    return null;
  }, [user, offices]);

  // Get the official office name for print header
  const printOfficeName = useMemo(() => {
    const fallbackOfficeName = "Office of the College of Computing and Information Sciences";

    if (user.type === "OfficeAdmin" && user.office) {
      const office = offices.find(o => o.name === user.office);
      return office?.officialName || user.office;
    }

    if (user.type === "SuperAdmin" && officeFilter === "All Offices") {
      return (
        currentOfficeRecord?.officialName ||
        currentOfficeRecord?.name ||
        user.office ||
        fallbackOfficeName
      );
    }

    if (officeFilter !== "All Offices") {
      const office = offices.find(o => o.name === officeFilter);
      return office?.officialName || officeFilter;
    }

    return fallbackOfficeName;
  }, [user, officeFilter, offices, currentOfficeRecord]);

  const documentCodeForPrint =
    String(printFooterFields.documentCode || "").trim() ||
    DEFAULT_PRINT_DOCUMENT_CODE;
  const revisionNumberForPrint =
    String(printFooterFields.revisionNumber || "").trim() ||
    DEFAULT_PRINT_REVISION_NUMBER;
  const printedDateForPrint =
    printFooterSnapshot.printedDate || formatPrintFooterDate(new Date());
  const printFooterContentPrefix = `${documentCodeForPrint} | ${revisionNumberForPrint} | ${printedDateForPrint} | Page `;
  const printFooterPrefixCSS = JSON.stringify(printFooterContentPrefix);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7400EA] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading visitor records...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="visitors-page">
      {/* Screen View - Original Design */}
      <div className="print:hidden px-6 md:px-10 pt-2 pb-6 space-y-4 font-sans">
        <FilterBar
          user={user}
          search={search}
          setSearch={setSearch}
          officeFilter={officeFilter}
          setOfficeFilter={setOfficeFilter}
          startDateFilter={startDateFilter}
          setStartDateFilter={setStartDateFilter}
          endDateFilter={endDateFilter}
          setEndDateFilter={setEndDateFilter}
          exportPDF={exportPDF}
          uniqueOffices={uniqueOffices}
        />

        <VisitorTable
          visitors={filteredVisitors}
          onViewDetails={handleViewVisitorDetails}
          canDeleteVisitors={user.type === "SuperAdmin"}
        />
      </div>

      <VisitorInfoModal
        isOpen={!!selectedVisitor}
        onClose={() => setSelectedVisitor(null)}
        visitorData={selectedVisitor}
        ratingsOnly
      />

      {showPrintFooterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
              <h2 className="text-xl font-semibold text-slate-900">
                Print Footer Settings
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Update the footer details before printing the visitors log sheet.
              </p>
            </div>

            <div className="max-h-[75vh] overflow-y-auto px-5 py-5 sm:px-6">
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
                          e.target.value
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
                          e.target.value
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
                      {formatPrintFooterDate(new Date())} | Page 1 of N
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
              <button
                type="button"
                onClick={() => setShowPrintFooterModal(false)}
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

      {/* Print View Only - BISU Format */}
      <div className="hidden print:block bg-white print-only-section">
        {/* Split visitors into pages of 18 rows each */}
        {printPages.map((page, pageIndex) => {
          const shouldForcePageBreak = pageIndex < printPages.length - 1;
          const pageVisitors = page.rows;
          const emptyRowsNeeded = page.emptyRowCount;

          return (
            <div
              key={pageIndex}
              className={`page-break print-page px-2 py-1${
                shouldForcePageBreak ? " page-break-after" : ""
              }`}
            >
                 {/* Header */}
                 <div
                   className="flex items-start justify-between mb-1"
                   style={{ paddingInline: "18px" }}
                 >
                   <div
                     className="flex items-center"
                     style={{ marginLeft: "4px" }}
                   >
                     <div className="w-24 h-16 flex items-center justify-center">
                       <img 
                         src={bisuLogo} 
                         alt="BISU Logo" 
                         className="w-full h-full object-contain"
                       />
                     </div>
                     <div className="leading-tight text-left font-normal">
                       <p
                         className="text-[14.67px]"
                         style={{ fontFamily: "Arial, sans-serif" }}
                       >
                         Republic of the Philippines
                       </p>
                       <h1
                         className="text-[16px] font-bold tracking-wide leading-none"
                         style={{ fontFamily: "Arial, sans-serif" }}
                       >
                         BOHOL ISLAND STATE UNIVERSITY
                       </h1>
                       <p
                         className="text-[13.33px]"
                         style={{ fontFamily: "Arial, sans-serif" }}
                       >
                         Magsija, Balilihan 6342, Bohol, Philippines
                       </p>
                       <p
                         className="text-[13.33px]"
                         style={{ fontFamily: "Arial, sans-serif" }}
                       >
                         {printOfficeName}
                       </p>
                       <p
                         className="text-[13.33px] italic"
                         style={{ fontFamily: '"Times New Roman", Times, serif' }}
                       >
                         Balance | Integrity | Stewardship | Uprightness
                       </p>
                     </div>
                   </div>
                   
                   <div
                     className="flex gap-2"
                     style={{ marginRight: "8px" }}
                   >
                     <div className="w-20 h-24 flex items-center justify-center">
                       <img 
                         src={bagongPilipinasLogo} 
                         alt="Bagong Pilipinas Logo" 
                         className="w-full h-full object-contain"
                       />
                     </div>
                     <div className="w-36 h-24 flex items-center justify-center">
                       <img 
                         src={tuvISOLogo} 
                         alt="ISO 9001:2015 Certification" 
                         className="w-full h-full object-contain"
                       />
                    </div>
                  </div>
                </div>

                {/* Title */}
                <h2 className="text-center text-base font-bold mb-1 uppercase">Visitors' Log Sheet</h2>
                {/* Table */}
                <table className="print-page-table w-full table-fixed border-collapse border-1 border-black">
                  <thead>
                    <tr className="bg-white print-header-row">
                      <th className="print-header-cell border-2 border-black px-1 py-0 text-[13.33px] leading-tight font-bold text-center w-[15%]">
                        Date<br/>(MM-DD-YY)
                      </th>
                      <th className="print-header-cell border-2 border-black px-1 py-0 text-[13.33px] leading-tight font-bold text-center w-[12%]">
                        Time In
                      </th>
                      <th className="print-header-cell border-2 border-black px-1 py-0 text-[13.33px] leading-tight font-bold text-center w-[23%]">
                        Name
                      </th>
                      <th className="print-header-cell border-2 border-black px-1 py-0 text-[13.33px] leading-tight font-bold text-center w-[25%]">
                        Purpose
                      </th>
                      <th className="print-header-cell border-2 border-black px-1 py-0 text-[13.33px] leading-tight font-bold text-center w-[25%]">
                        Contact Number /<br/>email address
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageVisitors.map((visitor) => {
                      const dateObj = visitor.rawDate || new Date();
                      const formattedDate = formatPrintTableDate(dateObj);
                      
                      const contactLines = visitor._printContactLines || [];
                      return (
                        <tr key={visitor.id} className="print-body-row">
                          <td className="print-body-cell border-2 border-black px-1 py-0 text-[13.33px] leading-tight text-center">
                            <span className="print-cell-text">{formattedDate}</span>
                          </td>
                          <td className="print-body-cell border-2 border-black px-1 py-0 text-[13.33px] leading-tight text-center">
                            <span className="print-cell-text">{visitor.timeIn}</span>
                          </td>
                          <td className="print-body-cell border-2 border-black px-1 py-0 text-[13.33px] leading-tight text-center">
                            <span className="print-cell-text">{visitor.name}</span>
                          </td>
                          <td className="print-body-cell border-2 border-black px-1 py-0 text-[13.33px] leading-tight text-center">
                            <span className="print-cell-text">{visitor.purpose}</span>
                          </td>
                          <td
                            className="print-body-cell print-contact-cell border-2 border-black px-1 py-0 text-[13.33px] leading-tight text-center"
                          >
                            {contactLines.length > 0 ? (
                              <div className="print-contact-text">
                                {contactLines.map((detail, detailIndex) => (
                                  <div
                                    key={`${visitor.id}-contact-${detailIndex}`}
                                    className="print-contact-line"
                                  >
                                    {detail}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="print-cell-text">&nbsp;</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Add empty rows to complete 18 rows per page */}
                    {Array.from({ length: emptyRowsNeeded }).map((_, i) => (
                      <tr key={`empty-${i}`} className="print-body-row">
                        <td className="print-body-cell border-2 border-black px-1 py-0 text-[13.33px] leading-tight text-center">&nbsp;</td>
                        <td className="print-body-cell border-2 border-black px-1 py-0 text-[13.33px] leading-tight text-center">&nbsp;</td>
                        <td className="print-body-cell border-2 border-black px-1 py-0 text-[13.33px] leading-tight text-center">&nbsp;</td>
                        <td className="print-body-cell border-2 border-black px-1 py-0 text-[13.33px] leading-tight text-center">&nbsp;</td>
                        <td className="print-body-cell border-2 border-black px-1 py-0 text-[13.33px] leading-tight text-center">&nbsp;</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        })}
      </div>

      {/* Print-specific styles */}
      <style>{`
        @media print {
          aside {
            display: none !important;
          }

          footer {
            display: none !important;
          }

          main {
            padding: 0 !important;
            overflow: visible !important;
          }

          main > :not(.visitors-page) {
            display: none !important;
          }

          .visitors-page > :not(.print-only-section):not(style) {
            display: none !important;
          }

          .visitors-page {
            margin: 0 !important;
            padding: 0 !important;
          }

          .print-only-section {
            display: block !important;
            width: 100%;
          }
          
          @page {
            size: ${PRINT_PAGE_WIDTH_IN}in ${PRINT_PAGE_HEIGHT_IN}in;
            margin: ${PRINT_PAGE_MARGIN_TOP_CM}cm ${PRINT_PAGE_MARGIN_RIGHT_CM}cm ${PRINT_PAGE_MARGIN_BOTTOM_CM}cm ${PRINT_PAGE_MARGIN_LEFT_CM}cm;
            @bottom-left {
              content: ${printFooterPrefixCSS} counter(page) " of " counter(pages);
              font-family: Arial, sans-serif;
              font-size: 11px;
              font-weight: 400;
              text-align: left;
              vertical-align: top;
              padding-top: 0.15cm;
              padding-left: 0.25cm;
              white-space: nowrap;
            }
          }
          
          html {
            margin: 0;
          }
          
          body {
            margin: 0;
          }
          
          .page-break {
            break-inside: avoid-page;
            page-break-inside: avoid;
          }

          .page-break-after {
            break-after: page;
          }

          .print-page {
            box-sizing: border-box;
            max-height: calc(${PRINT_PAGE_HEIGHT_IN}in - ${PRINT_PAGE_MARGIN_TOP_CM}cm - ${PRINT_PAGE_MARGIN_BOTTOM_CM}cm);
            overflow: hidden;
          }

          .print-page-table {
            border-collapse: separate !important;
            border-spacing: 0 !important;
            table-layout: fixed;
          }

          .print-page-table th,
          .print-page-table td {
            position: relative;
            border: 0 !important;
            border-top: 0.5pt solid #000 !important;
            border-left: 0.5pt solid #000 !important;
            box-sizing: border-box;
          }

          .print-page-table th:last-child,
          .print-page-table td:last-child {
            border-right: 0.5pt solid #000 !important;
          }

          .print-page-table tbody tr:last-child td {
            border-bottom: 0.5pt solid #000 !important;
          }

          .print-header-row {
            height: ${PRINT_HEADER_ROW_HEIGHT_IN}in;
          }

          .print-header-cell {
            height: ${PRINT_HEADER_ROW_HEIGHT_IN}in;
            vertical-align: middle;
          }

          .print-body-row {
            height: ${PRINT_BODY_ROW_HEIGHT_IN}in;
          }

          .print-body-cell {
            height: ${PRINT_BODY_ROW_HEIGHT_IN}in;
            vertical-align: middle;
            white-space: nowrap;
            overflow: hidden;
          }

          .print-cell-text {
            display: block;
            width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .print-contact-cell {
            font-size: ${PRINT_CONTACT_FONT_SIZE_PX}px !important;
            line-height: 0.95;
            overflow: hidden;
            padding-top: 1px !important;
            padding-bottom: 1px !important;
          }

          .print-contact-text {
            display: flex;
            flex-direction: column;
            justify-content: center;
            width: 100%;
            max-height: calc(${PRINT_BODY_ROW_HEIGHT_IN}in - 1px);
            overflow: hidden;
            gap: 0;
          }

          .print-contact-line {
            display: block;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
};

export default Visitors;

