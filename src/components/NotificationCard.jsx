import React, { useState, useEffect } from "react";
import NotificationItem from "./NotificationItem";
import VisitorInfoModal from "./VisitorInfoModal";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  doc,
  getDoc,
  Timestamp 
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { getStoredUser } from "../lib/sessionStorage";
import { Bell, CheckCheck, Sparkles, Clock, Building2, User, Search, Filter } from "lucide-react";

const getNotificationStorageKeyBase = (user) =>
  user?.uid || user?.id || user?.email || "anonymous";

const notificationFeedCardClass =
  "flex flex-col h-[calc(100vh-14rem)] bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 p-6 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 mt-6";

const NotificationCard = ({ user = { type: "SuperAdmin", office: null } }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVisitor, setSelectedVisitor] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loadingVisitorDetails, setLoadingVisitorDetails] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'new', 'read'
  const [searchQuery, setSearchQuery] = useState('');
  
  // Get current user from prop or session storage
  const [currentUser, setCurrentUser] = useState(user);

  useEffect(() => {
    let userToUse = user;
    
    if (!userToUse || !userToUse.email) {
      const savedUser = getStoredUser();
      if (savedUser) {
        try {
          userToUse = JSON.parse(savedUser);
        } catch {
          //
        }
      }
    }
    
    setCurrentUser(userToUse);
  }, [user]);

  // User-specific last viewed time
  const [lastViewedTime, setLastViewedTime] = useState(() => {
    const userKey = getNotificationStorageKeyBase(currentUser);
    const saved = localStorage.getItem(`notificationLastViewedTime_${userKey}`);
    return saved ? new Date(saved) : null;
  });

  // User-specific marked as read notifications
  const [markedAsRead, setMarkedAsRead] = useState(() => {
    const userKey = getNotificationStorageKeyBase(currentUser);
    const saved = localStorage.getItem(`markedAsReadNotifications_${userKey}`);
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    if (!currentUser) return;

    let unsubscribe = null;

    const setupNotificationListener = () => {
      try {
        const notificationsRef = collection(db, "visits");
        
        const isOfficeAdmin = currentUser.type === "OfficeAdmin";
        const userOffice = currentUser.office?.trim();
        const hasOffice = userOffice && userOffice !== "";
        
        let q;
        
        if (isOfficeAdmin && hasOffice) {
          // Avoid composite-index dependency for office-filtered listener.
          q = query(
            notificationsRef,
            where("office", "==", userOffice)
          );
        } else {
          q = query(notificationsRef, orderBy("checkInTime", "desc"));
        }
        
        unsubscribe = onSnapshot(q, (snapshot) => {
          const newNotifications = [];
          const compareTime = lastViewedTime || new Date(Date.now() - (24 * 60 * 60 * 1000));
          
          snapshot.forEach((doc) => {
            const data = doc.data();
            
            if (isOfficeAdmin && hasOffice) {
              const docOffice = data.office?.trim();
              if (docOffice !== userOffice) {
                return;
              }
            }
            
            let checkInDate = new Date();
            if (data.checkInTime instanceof Timestamp) {
              checkInDate = data.checkInTime.toDate();
            } else if (data.checkInTime && data.checkInTime.toDate) {
              checkInDate = data.checkInTime.toDate();
            } else if (data.checkInTime) {
              checkInDate = new Date(data.checkInTime);
            }
            
            const formattedDate = checkInDate.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            });
            
            const formattedTime = checkInDate.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            });
            
            const checkInTimeMs = Number.isNaN(checkInDate.getTime())
              ? 0
              : checkInDate.getTime();
            const isMarkedAsRead = markedAsRead.includes(doc.id);
            const isNew = checkInDate > compareTime && !isMarkedAsRead;
            
            newNotifications.push({
              id: doc.id,
              name: data.visitorName || data.name || "Unknown Visitor",
              office: data.office || "Unknown Office",
              date: formattedDate,
              timeIn: formattedTime,
              isNew: isNew,
              status: data.status || "checked-in",
              contactNumber: data.contactNumber || data.phone,
              address: data.address,
              purpose: data.purpose,
              staffName: data.staffName || data.personToVisit,
              timestamp: checkInTimeMs
            });
          });
          
          const limitedNotifications = newNotifications
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 50);
          
          setNotifications(limitedNotifications);
          setLoading(false);
          
        // eslint-disable-next-line no-unused-vars
        }, (error) => {
          setLoading(false);
        });
        
      } catch  {
        setLoading(false);
      }
    };

    setupNotificationListener();
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [currentUser, lastViewedTime, markedAsRead]);

  const handleNotificationClick = async (notification) => {
    setLoadingVisitorDetails(true);
    
    try {
      const docRef = doc(db, "visits", notification.id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const fullData = docSnap.data();
        
        const visitorData = {
          name: fullData.visitorName || fullData.name || notification.name,
          contactNumber: fullData.contactNumber || fullData.phone || notification.contactNumber,
          address: fullData.address || notification.address,
          office: fullData.office || notification.office,
          purpose: fullData.purpose || notification.purpose,
          staffName: fullData.staffName || fullData.personToVisit || notification.staffName,
          date: notification.date,
          timeIn: notification.timeIn,
          status: fullData.status || notification.status
        };
        
        setSelectedVisitor(visitorData);
        setIsModalOpen(true);
        markNotificationAsRead(notification.id);
      } else {
        setSelectedVisitor(notification);
        setIsModalOpen(true);
        markNotificationAsRead(notification.id);
      }
    } catch  {
      setSelectedVisitor(notification);
      setIsModalOpen(true);
      markNotificationAsRead(notification.id);
    } finally {
      setLoadingVisitorDetails(false);
    }
  };

  const markNotificationAsRead = (notificationId) => {
    const userKey = getNotificationStorageKeyBase(currentUser);
    if (!userKey) return;
    
    if (!markedAsRead.includes(notificationId)) {
      const updatedMarkedAsRead = [...markedAsRead, notificationId];
      setMarkedAsRead(updatedMarkedAsRead);
      
      localStorage.setItem(
        `markedAsReadNotifications_${userKey}`, 
        JSON.stringify(updatedMarkedAsRead)
      );
      
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notificationId 
            ? { ...notif, isNew: false }
            : notif
        )
      );
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedVisitor(null);
  };

  const markAllRead = () => {
    const now = new Date();
    const userKey = getNotificationStorageKeyBase(currentUser);
    
    if (!userKey) return;
    
    setLastViewedTime(now);
    localStorage.setItem(`notificationLastViewedTime_${userKey}`, now.toISOString());
    
    const allNotificationIds = notifications.map(n => n.id);
    const updatedMarkedAsRead = [...new Set([...markedAsRead, ...allNotificationIds])];
    setMarkedAsRead(updatedMarkedAsRead);
    localStorage.setItem(
      `markedAsReadNotifications_${userKey}`, 
      JSON.stringify(updatedMarkedAsRead)
    );
    
    setNotifications((prev) =>
      prev.map((notif) => ({ ...notif, isNew: false }))
    );
  };

  useEffect(() => {
    const userKey = getNotificationStorageKeyBase(currentUser);
    if (!userKey) return;

    const storageKey = `notificationLastViewedTime_${userKey}`;
    const markedAsReadKey = `markedAsReadNotifications_${userKey}`;
    
    const handleStorageChange = () => {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setLastViewedTime(new Date(saved));
      }
      
      const savedMarked = localStorage.getItem(markedAsReadKey);
      if (savedMarked) {
        setMarkedAsRead(JSON.parse(savedMarked));
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    const interval = setInterval(() => {
      const saved = localStorage.getItem(storageKey);
      const savedDate = saved ? new Date(saved) : null;
      
      if (savedDate && (!lastViewedTime || savedDate.getTime() !== lastViewedTime.getTime())) {
        setLastViewedTime(savedDate);
      }
      
      const savedMarked = localStorage.getItem(markedAsReadKey);
      const savedMarkedArray = savedMarked ? JSON.parse(savedMarked) : [];
      if (JSON.stringify(savedMarkedArray) !== JSON.stringify(markedAsRead)) {
        setMarkedAsRead(savedMarkedArray);
      }
    }, 500);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [lastViewedTime, markedAsRead, currentUser.email, currentUser.uid, currentUser.id, currentUser]);

  // Filter and search notifications
  const filteredNotifications = notifications.filter(notif => {
    // Filter by status
    if (filterStatus === 'new' && !notif.isNew) return false;
    if (filterStatus === 'read' && notif.isNew) return false;
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        notif.name.toLowerCase().includes(query) ||
        notif.office.toLowerCase().includes(query) ||
        notif.purpose?.toLowerCase().includes(query)
      );
    }
    
    return true;
  });

  const newNotificationCount = notifications.filter(n => n.isNew).length;

  if (loading) {
    return (
      <section className={notificationFeedCardClass}>
        <div className="flex justify-between items-center border-b pb-4 mb-4 border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">
              Notification Feed
            </h3>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-purple-600 mx-auto"></div>
              <Bell className="w-6 h-6 text-purple-600 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
            </div>
            <p className="mt-4 text-gray-600 dark:text-gray-400 font-medium">Loading notifications...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className={notificationFeedCardClass}>
        {/* Enhanced Header */}
        <div className="border-b pb-4 mb-4 border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-linear-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
                  <Bell className="w-5 h-5 text-white" />
                </div>
                {newNotificationCount > 0 && (
                  <span className="absolute -top-1 -right-1">
                    <span className="relative flex">
                      <span className="animate-ping absolute inline-flex h-4 w-4 rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold">
                        {newNotificationCount > 9 ? '9+' : newNotificationCount}
                      </span>
                    </span>
                  </span>
                )}
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                  Notification Feed
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {currentUser?.type === "OfficeAdmin" && currentUser?.office
                    ? `${currentUser.office} Office`
                    : "All Offices"}
                </p>
              </div>
            </div>
            <button
              onClick={markAllRead}
              disabled={newNotificationCount === 0}
              className={`group flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all duration-300 ${
                newNotificationCount > 0
                  ? "bg-linear-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white shadow-lg hover:shadow-xl hover:scale-105"
                  : "bg-gray-100 text-gray-400 dark:bg-gray-800 cursor-not-allowed"
              }`}
            >
              <CheckCheck className={`w-4 h-4 ${newNotificationCount > 0 ? 'group-hover:scale-110 transition-transform' : ''}`} />
              Mark all read
            </button>
          </div>

          {/* Search and Filter Bar */}
          <div className="flex gap-3 flex-wrap">
            {/* Search Input */}
            <div className="flex-1 min-w-[200px] relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search visitors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-4 py-2 rounded-xl font-medium text-sm transition-all duration-300 ${
                  filterStatus === 'all'
                    ? 'bg-purple-500 text-white shadow-lg'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                All ({notifications.length})
              </button>
              <button
                onClick={() => setFilterStatus('new')}
                className={`px-4 py-2 rounded-xl font-medium text-sm transition-all duration-300 flex items-center gap-2 ${
                  filterStatus === 'new'
                    ? 'bg-purple-500 text-white shadow-lg'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                New ({newNotificationCount})
              </button>
              <button
                onClick={() => setFilterStatus('read')}
                className={`px-4 py-2 rounded-xl font-medium text-sm transition-all duration-300 ${
                  filterStatus === 'read'
                    ? 'bg-purple-500 text-white shadow-lg'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                Read ({notifications.length - newNotificationCount})
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Notifications List */}
        <ul className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
          {filteredNotifications.length > 0 ? (
            filteredNotifications.map((notif) => (
              <li 
                key={notif.id} 
                onClick={() => handleNotificationClick(notif)}
                className={`group cursor-pointer p-4 rounded-xl transition-all duration-300 hover:scale-[1.02] border ${
                  notif.isNew 
                    ? 'bg-linear-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border-purple-200 dark:border-purple-800 hover:shadow-lg'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 hover:shadow-md'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center shadow-md ${
                    notif.isNew
                      ? 'bg-linear-to-br from-purple-500 to-blue-500'
                      : 'bg-linear-to-br from-gray-400 to-gray-500'
                  }`}>
                    <User className="w-6 h-6 text-white" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <h4 className="font-bold text-gray-900 dark:text-white text-base group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors uppercase">
                          {notif.name}
                        </h4>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                            <Building2 className="w-3.5 h-3.5" />
                            <span className="uppercase font-medium">{notif.office}</span>
                          </div>
                          {notif.purpose && (
                            <>
                              <span className="text-gray-300 dark:text-gray-600">•</span>
                              <span className="text-sm text-gray-500 dark:text-gray-400 capitalize">
                                {notif.purpose}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {notif.isNew && (
                        <div className="shrink-0">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-linear-to-r from-purple-500 to-blue-500 text-white text-xs font-bold shadow-lg">
                            <Sparkles className="w-3 h-3" />
                            NEW
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Time Info */}
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{notif.date} at {notif.timeIn}</span>
                    </div>
                  </div>
                </div>
              </li>
            ))
          ) : (
            <li className="text-center py-16">
              <div className="flex flex-col items-center gap-4">
                <div className="w-20 h-20 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <Bell className="w-10 h-10 text-gray-400" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-600 dark:text-gray-300 mb-1">
                    {searchQuery ? 'No matching notifications' : 'No notifications available'}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {searchQuery 
                      ? 'Try adjusting your search or filters'
                      : currentUser?.type === "OfficeAdmin" && currentUser?.office
                      ? `No recent visitor check-ins for ${currentUser.office}`
                      : "No recent visitor check-ins"}
                  </p>
                </div>
              </div>
            </li>
          )}
        </ul>

        {/* Footer Stats */}
        {filteredNotifications.length > 0 && (
          <div className="shrink-0 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <span>
                Showing {filteredNotifications.length} of {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
              </span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium"
                >
                  Clear search
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Visitor Information Modal */}
      <VisitorInfoModal 
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        visitorData={selectedVisitor}
        showRatings={false}
      />

      {/* Enhanced Loading overlay */}
      {loadingVisitorDetails && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-2xl max-w-sm mx-4">
            <div className="relative mb-4">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-purple-600 mx-auto"></div>
              <User className="w-6 h-6 text-purple-600 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
            </div>
            <p className="text-center text-gray-700 dark:text-gray-300 font-semibold">
              Loading visitor details...
            </p>
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-1">
              Please wait a moment
            </p>
          </div>
        </div>
      )}

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(to bottom, #a855f7, #3b82f6);
          border-radius: 5px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(to bottom, #9333ea, #2563eb);
        }
      `}</style>
    </>
  ); 
};

export default NotificationCard;
