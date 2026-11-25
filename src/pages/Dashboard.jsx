import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import CardStat from "../components/CardStat";
import LiveVisitorFeed from "../components/LiveVisitorFeed";
import NotificationCard from "../components/NotificationCard";
import ConfirmModal from "../components/ConfirmModal";
import Analytics from "../pages/Analytics";
import Visitors from "../pages/Visitors";
import Offices from "../pages/Offices";
import Feedback from "../pages/Feedback";
import ManualFeedback from "../pages/ManualFeedback";
import Footer from "../components/Footer";
import Profile from "../pages/Profile";
import useAdminVisitors from "../hooks/useAdminVisitors";
import useFeedbackRatings from "../hooks/useFeedbackRatings";
import { getOfficePasswordResetRequests } from "../lib/info.services";

const RESET_REQUEST_CHECK_INTERVAL_MS = 30000;

// ---------- Date helpers (shared by visitors + feedback) ----------

// Handles: JS Date, Firestore Timestamp (instance with .toDate(), or a
// plain { seconds, nanoseconds } object), epoch values, and date strings
// (including "M/D/YYYY").
const parseFlexibleDate = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  // Firestore Timestamp instance
  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return isNaN(d.getTime()) ? null : d;
  }

  // Plain object shaped like a Firestore Timestamp ({ seconds, nanoseconds })
  if (typeof value === "object" && typeof value.seconds === "number") {
    const d = new Date(value.seconds * 1000);
    return isNaN(d.getTime()) ? null : d;
  }

  const direct = new Date(value);
  if (!isNaN(direct.getTime())) return direct;

  if (typeof value === "string" && value.includes("/")) {
    const [month, day, year] = value.split("/");
    const parsed = new Date(year, month - 1, day);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return null;
};

const isSameDay = (dateValue, referenceDate) => {
  const parsed = parseFlexibleDate(dateValue);
  if (!parsed) return false;
  return parsed.toLocaleDateString() === referenceDate.toLocaleDateString();
};

const isWithinLastDays = (dateValue, referenceDate, days) => {
  const parsed = parseFlexibleDate(dateValue);
  if (!parsed) return false;
  const diffDays = (referenceDate - parsed) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= days;
};

// ---------- Name / field helpers ----------
const getVisitorName = (v) => v?.name || v?.visitorName || v?.fullName || "";

// useFeedbackRatings already normalizes this onto `name`.
const getFeedbackName = (f) => f?.name || "";

// Prefer the actual visit time, then fall back to when the feedback doc
// was created. Both can be Firestore Timestamps — parseFlexibleDate handles that.
const getFeedbackDate = (f) => f?.visitDateTime || f?.createdAt;

const normalizeName = (name) => (name || "").trim().toLowerCase();

/**
 * Counts unique "people" across a visitor list and a feedback list for the
 * same period, treating a visitor and a feedback entry as ONE person if
 * their (normalized) names match. Unnamed entries can't be matched, so
 * each is still counted individually rather than dropped.
 */
const countUniquePeople = (visitorList, feedbackList) => {
  const countedNames = new Set();
  let total = 0;

  visitorList.forEach((v) => {
    const name = normalizeName(getVisitorName(v));
    if (!name) {
      total += 1; // can't dedupe an unnamed record, still count it
      return;
    }
    if (!countedNames.has(name)) {
      countedNames.add(name);
      total += 1;
    }
  });

  feedbackList.forEach((f) => {
    const name = normalizeName(getFeedbackName(f));
    if (!name) {
      total += 1;
      return;
    }
    if (!countedNames.has(name)) {
      countedNames.add(name);
      total += 1;
    }
  });

  return total;
};

// A feedback record can carry its own office (office / unitOfficeVisited,
// already resolved by useFeedbackRatings), or we fall back to looking up
// its visitId in the visitor office map.
const isFeedbackForOffice = (f, office, visitorOfficeMap) => {
  const directOffice = f?.office || f?.unitOfficeVisited;
  if (directOffice) return directOffice === office;
  return visitorOfficeMap[f?.visitId] === office;
};

const ResetRequestNotificationModal = ({ show, title, message, onOk }) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-amber-200 bg-amber-50 shadow-xl">
        <div className="p-5">
          <h4 className="text-lg font-semibold text-amber-800">
            {title || "Password Reset Request"}
          </h4>
          <p className="mt-2 text-sm text-amber-800 whitespace-pre-line break-words">
            {message}
          </p>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onOk}
              className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition bg-amber-600 hover:bg-amber-700"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Dashboard = ({
  user = { type: "SuperAdmin", office: null },
  onLogout,
}) => {
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("darkMode") === "true"
  );
  const [activeTab, setActiveTab] = useState(
    () => localStorage.getItem("activeTab") || "dashboard"
  );
  const [showConfirm, setShowConfirm] = useState(false);
  const [resetRequestModal, setResetRequestModal] = useState({
    show: false,
    title: "",
    message: "",
  });
  const hasInitializedResetRequests = useRef(false);
  const knownResetRequestIds = useRef(new Set());
  const resetAudioContextRef = useRef(null);

  useEffect(() => {
    const handleLogoutRequest = () => setShowConfirm(true);
    window.addEventListener("visitrak:logout-request", handleLogoutRequest);
    return () =>
      window.removeEventListener("visitrak:logout-request", handleLogoutRequest);
  }, []);

  const getResetAudioContext = useCallback(() => {
    if (typeof window === "undefined") return null;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (
      !resetAudioContextRef.current ||
      resetAudioContextRef.current.state === "closed"
    ) {
      resetAudioContextRef.current = new AudioContextClass();
    }

    return resetAudioContextRef.current;
  }, []);

  const playResetRequestSound = useCallback(async () => {
    try {
      const audioContext = getResetAudioContext();
      if (!audioContext) return;

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      if (audioContext.state !== "running") return;

      const now = audioContext.currentTime;
      const notes = [
        { frequency: 988, start: now, duration: 0.08 },
        { frequency: 784, start: now + 0.1, duration: 0.08 },
        { frequency: 659, start: now + 0.2, duration: 0.12 },
      ];

      notes.forEach(({ frequency, start, duration }) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(frequency, start);
        gainNode.gain.setValueAtTime(0.0001, start);
        gainNode.gain.exponentialRampToValueAtTime(0.2, start + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.02);
      });
    } catch (error) {
      console.warn("Unable to play password reset alert sound.", error);
    }
  }, [getResetAudioContext]);

  useEffect(() => {
    const unlockAudio = () => {
      const audioContext = getResetAudioContext();
      if (!audioContext) return;

      if (audioContext.state === "suspended") {
        void audioContext.resume().catch(() => { });
      }
    };

    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [getResetAudioContext]);

  useEffect(
    () => () => {
      if (resetAudioContextRef.current?.state !== "closed") {
        void resetAudioContextRef.current?.close().catch(() => { });
      }
    },
    []
  );

  const { visitors } = useAdminVisitors(user);
  const { feedbacks, loading: feedbacksLoading } = useFeedbackRatings();

  useEffect(() => localStorage.setItem("darkMode", darkMode), [darkMode]);
  useEffect(() => localStorage.setItem("activeTab", activeTab), [activeTab]);

  useEffect(() => {
    if (user?.type !== "SuperAdmin" || activeTab === "offices") return undefined;

    let disposed = false;

    const checkPendingResetRequests = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }

      try {
        const pendingRequests = await getOfficePasswordResetRequests("pending");
        if (disposed) return;

        const requests = Array.isArray(pendingRequests) ? pendingRequests : [];
        const latestIds = new Set(requests.map((request) => request?.id).filter(Boolean));
        const newRequests = requests.filter(
          (request) => request?.id && !knownResetRequestIds.current.has(request.id)
        );

        if (!hasInitializedResetRequests.current) {
          hasInitializedResetRequests.current = true;

          if (requests.length > 0) {
            void playResetRequestSound();
            setResetRequestModal({
              show: true,
              title: "Pending Password Reset Requests",
              message:
                `${requests.length} pending password reset request${requests.length !== 1 ? "s" : ""} ` +
                "need your approval.\nPress OK to open Offices.",
            });
          }
        } else if (newRequests.length > 0) {
          const latestOwner =
            newRequests[0]?.officeName || newRequests[0]?.username || "an office account";
          void playResetRequestSound();
          setResetRequestModal({
            show: true,
            title: "New Password Reset Request",
            message:
              (newRequests.length === 1
                ? `A new password reset request was submitted by ${latestOwner}.`
                : `${newRequests.length} new password reset requests were submitted.`) +
              "\nPress OK to open Offices.",
          });
        }

        knownResetRequestIds.current = latestIds;
      } catch (error) {
        console.warn("Unable to check password reset requests.", error);
      }
    };

    checkPendingResetRequests();
    const intervalId = setInterval(checkPendingResetRequests, RESET_REQUEST_CHECK_INTERVAL_MS);

    return () => {
      disposed = true;
      clearInterval(intervalId);
    };
  }, [activeTab, playResetRequestSound, user?.type]);

  const handleResetRequestModalOk = () => {
    setResetRequestModal({
      show: false,
      title: "",
      message: "",
    });
    setActiveTab("offices");
  };

  // 🧭 MENU CONFIG
  const menuConfig = {
    SuperAdmin: {
      overview: ["dashboard", "analytics", "notifications"],
      management: ["visitors", "offices"],
      feedback: ["feedback", "manual-feedback"],
    },
    OfficeAdmin: {
      overview: ["dashboard", "notifications"],
      management: ["visitors"],
      feedback: [],
    },
  };

  const menu = menuConfig[user.type] || menuConfig.OfficeAdmin;
  const allowedTabs = useMemo(
    () => new Set([...Object.values(menu).flat(), "profile"]),
    [menu]
  );

  useEffect(() => {
    if (!allowedTabs.has(activeTab)) {
      setActiveTab("dashboard");
    }
  }, [activeTab, allowedTabs]);

  const filteredVisitors = useMemo(() => {
    return user.type === "OfficeAdmin"
      ? visitors.filter((v) => v.office === user.office)
      : visitors;
  }, [visitors, user]);

  // Map visitId -> office, used as a fallback to attribute a feedback entry
  // to an office when the feedback record itself has no office field.
  const visitorOfficeMap = useMemo(() => {
    const map = {};
    visitors.forEach((v) => {
      if (v.id) map[v.id] = v.office;
    });
    return map;
  }, [visitors]);

  // Feedback scoped to the current admin's office (or all, for SuperAdmin).
  const filteredFeedbacks = useMemo(() => {
    if (!feedbacks) return [];
    if (user.type === "OfficeAdmin" && user.office) {
      return feedbacks.filter((f) =>
        isFeedbackForOffice(f, user.office, visitorOfficeMap)
      );
    }
    return feedbacks;
  }, [feedbacks, visitorOfficeMap, user.type, user.office]);

  const todaysVisitors = useMemo(() => {
    const today = new Date().toLocaleDateString();
    return filteredVisitors.filter((v) => v.date === today);
  }, [filteredVisitors]);

  const todaysFeedbacks = useMemo(() => {
    const now = new Date();
    return filteredFeedbacks.filter((f) => isSameDay(getFeedbackDate(f), now));
  }, [filteredFeedbacks]);

  // Visitors today + feedback today, de-duplicated by name so someone who
  // both visited and left feedback today is only counted once.
  const visitorsToday = useMemo(
    () => countUniquePeople(todaysVisitors, todaysFeedbacks),
    [todaysVisitors, todaysFeedbacks]
  );

  const visitorsThisWeekList = useMemo(() => {
    const today = new Date();
    return filteredVisitors.filter((v) => isWithinLastDays(v.date, today, 7));
  }, [filteredVisitors]);

  const feedbacksThisWeek = useMemo(() => {
    const today = new Date();
    return filteredFeedbacks.filter((f) =>
      isWithinLastDays(getFeedbackDate(f), today, 7)
    );
  }, [filteredFeedbacks]);

  // Same de-duplication for the weekly count.
  const visitorsThisWeek = useMemo(
    () => countUniquePeople(visitorsThisWeekList, feedbacksThisWeek),
    [visitorsThisWeekList, feedbacksThisWeek]
  );

  const currentlyCheckedIn = useMemo(
    () => filteredVisitors.filter((v) => v.status === "Check In").length,
    [filteredVisitors]
  );

  const avgSatisfaction = useMemo(() => {
    if (!filteredFeedbacks || filteredFeedbacks.length === 0) return "0.0";

    // Manually encoded forms may have no ratings at all (averageRating = 0).
    // Leave those out so they don't pull the satisfaction average down.
    const ratedFeedbacks = filteredFeedbacks.filter(
      (f) => Number(f.averageRating) > 0
    );
    if (ratedFeedbacks.length === 0) return "0.0";

    const totalRating = ratedFeedbacks.reduce(
      (sum, f) => sum + Number(f.averageRating),
      0
    );
    const average = totalRating / ratedFeedbacks.length;

    return average.toFixed(1);
  }, [filteredFeedbacks]);

  // Format average satisfaction with /5 suffix
  const formattedAvgSatisfaction = useMemo(() => {
    if (feedbacksLoading) return "Loading...";
    return `${avgSatisfaction}/5`;
  }, [avgSatisfaction, feedbacksLoading]);

  return (
    <div
      className={`flex h-screen transition-colors ${darkMode ? "dark bg-[#1f1f1f] text-white" : "bg-white text-gray-900"
        }`}
    >
      <Sidebar
        menu={menu}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        darkMode={darkMode}
        setShowConfirm={setShowConfirm}
      />

      <div className="flex flex-col flex-1 min-h-screen">
        <main className="flex-1 p-6 overflow-y-auto">
          <Topbar
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            setActiveTab={setActiveTab}
            user={user}
          />

          {activeTab === "dashboard" && (
            <>
              {/* 📊 Statistics Section */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <CardStat title="Visitor Today" value={visitorsToday} />
                <CardStat title="Visitor This Week" value={visitorsThisWeek} />
                <CardStat
                  title="Currently Checked-in"
                  value={currentlyCheckedIn}
                />
                <CardStat
                  title="Avg. Satisfaction"
                  value={formattedAvgSatisfaction}
                />
              </div>

              {/* 🧍 Live Visitor Feed - Now showing only today's visitors */}
              <LiveVisitorFeed visitors={todaysVisitors} />
            </>
          )}

          {activeTab === "analytics" && user.type === "SuperAdmin" && (
            <Analytics
              visitors={filteredVisitors}
              feedbacks={filteredFeedbacks}
              setActiveTab={setActiveTab}
            />
          )}
          {activeTab === "visitors" && <Visitors user={user} />}
          {activeTab === "offices" && user.type === "SuperAdmin" && <Offices />}
          {activeTab === "feedback" && user.type === "SuperAdmin" && (
            <Feedback
              visitors={filteredVisitors}
              feedbacks={filteredFeedbacks}
              user={user}
            />
          )}
          {activeTab === "manual-feedback" && user.type === "SuperAdmin" && (
            <ManualFeedback user={user} />
          )}
          {activeTab === "notifications" && <NotificationCard user={user} />}
          {activeTab === "profile" && (
            <Profile user={user} onLogout={onLogout} />
          )}

          {/* 🔒 Logout Confirmation Modal */}
          {showConfirm && (
            <ConfirmModal
              onConfirm={() => {
                onLogout?.();
                setShowConfirm(false);
              }}
              onCancel={() => setShowConfirm(false)}
            />
          )}

          <ResetRequestNotificationModal
            show={resetRequestModal.show}
            title={resetRequestModal.title}
            message={resetRequestModal.message}
            onOk={handleResetRequestModalOk}
          />
        </main>

        <Footer />
      </div>
    </div>
  );
};

export default Dashboard;