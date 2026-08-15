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
import Footer from "../components/Footer";
import Profile from "../pages/Profile";
import useAdminVisitors from "../hooks/useAdminVisitors";
import useFeedbackRatings from "../hooks/useFeedbackRatings";
import { getOfficePasswordResetRequests } from "../lib/info.services";

const RESET_REQUEST_CHECK_INTERVAL_MS = 30000;

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
    } catch  {
    }
  }, [getResetAudioContext]);

  useEffect(() => {
    const unlockAudio = () => {
      const audioContext = getResetAudioContext();
      if (!audioContext) return;

      if (audioContext.state === "suspended") {
        void audioContext.resume().catch(() => {});
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
        void resetAudioContextRef.current?.close().catch(() => {});
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
      } catch  {
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
      feedback: ["feedback"],
    },
    OfficeAdmin: {
      overview: ["dashboard", "analytics", "notifications"],
      management: ["visitors"],
      feedback: ["feedback"],
    },
  };

  const menu = menuConfig[user.type] || menuConfig.OfficeAdmin;

  // 🏢 Filter visitors based on user office (for OfficeAdmin)
  const filteredVisitors = useMemo(() => {
    return user.type === "OfficeAdmin"
      ? visitors.filter((v) => v.office === user.office)
      : visitors;
  }, [visitors, user]);

  // 🧮 TODAY'S VISITORS (for Live Visitor Feed)
  const todaysVisitors = useMemo(() => {
    const today = new Date().toLocaleDateString();
    return filteredVisitors.filter((v) => v.date === today);
  }, [filteredVisitors]);

  // 📊 TODAY'S VISITORS COUNT (for CardStat)
  const visitorsToday = useMemo(() => todaysVisitors.length, [todaysVisitors]);

  // 📆 Helper for "this week" visitors
  const visitorsThisWeek = useMemo(() => {
    const today = new Date();
    return filteredVisitors.filter((v) => {
      const visitorDate = new Date(v.date);
      if (isNaN(visitorDate.getTime())) {
        const [month, day, year] = v.date.split("/");
        const parsedDate = new Date(year, month - 1, day);
        if (!isNaN(parsedDate.getTime())) {
          const diffDays = (today - parsedDate) / (1000 * 60 * 60 * 24);
          return diffDays <= 7 && diffDays >= 0;
        }
        return false;
      }
      const diffDays = (today - visitorDate) / (1000 * 60 * 60 * 24);
      return diffDays <= 7 && diffDays >= 0;
    }).length;
  }, [filteredVisitors]);

  // 🕒 Checked-in visitors
  const currentlyCheckedIn = useMemo(
    () => filteredVisitors.filter((v) => v.status === "Check In").length,
    [filteredVisitors]
  );

  // 🧮 Compute average satisfaction FROM FEEDBACKS averageRating field
  const avgSatisfaction = useMemo(() => {
    if (!feedbacks || feedbacks.length === 0) return "0.0";

    let relevantFeedbacks = feedbacks;

    // Filter feedbacks by office if needed
    if (user.type === "OfficeAdmin" && user.office) {
      // Since feedbacks might not have office field, let's try to match with visitors
      // Create a map of visitId to office from visitors
      const visitorOfficeMap = {};
      visitors.forEach((v) => {
        if (v.id) visitorOfficeMap[v.id] = v.office;
      });

      // Filter feedbacks where the corresponding visitor has the right office
      relevantFeedbacks = feedbacks.filter((f) => {
        const visitorOffice = visitorOfficeMap[f.visitId];
        return visitorOffice === user.office;
      });
    }

    if (relevantFeedbacks.length === 0) return "0.0";

    const totalRating = relevantFeedbacks.reduce(
      (sum, f) => sum + (f.averageRating || 0),
      0
    );
    const average = totalRating / relevantFeedbacks.length;

    return average.toFixed(1);
  }, [feedbacks, visitors, user.type, user.office]);

  // Format average satisfaction with /5 suffix
  const formattedAvgSatisfaction = useMemo(() => {
    if (feedbacksLoading) return "Loading...";
    return `${avgSatisfaction}/5`;
  }, [avgSatisfaction, feedbacksLoading]);

  return (
    <div
      className={`flex h-screen transition-colors ${
        darkMode ? "dark bg-[#1f1f1f] text-white" : "bg-white text-gray-900"
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

          {activeTab === "analytics" && (
            <Analytics
              visitors={filteredVisitors}
              feedbacks={feedbacks}
              setActiveTab={setActiveTab}
            />
          )}
          {activeTab === "visitors" && <Visitors user={user} />}
          {activeTab === "offices" && user.type === "SuperAdmin" && <Offices />}
          {activeTab === "feedback" && (
            <Feedback
              visitors={filteredVisitors}
              feedbacks={feedbacks}
              user={user}
            />
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
