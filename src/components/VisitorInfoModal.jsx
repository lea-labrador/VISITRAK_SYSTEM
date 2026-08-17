import React from "react";

const formatRating = (value) => {
  const numeric = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)}/5` : "N/A";
};

const VisitorInfoModal = ({
  isOpen,
  onClose,
  visitorData,
  ratingsOnly = false,
  showRatings = true,
}) => {
  if (!isOpen || !visitorData) return null;

  const questionRatings = Array.isArray(visitorData.questionRatings)
    ? visitorData.questionRatings
    : [];
  const numberedRatings = questionRatings
    .map((item, index) => ({
      questionNumber: index + 1,
      rating: item && typeof item === "object" ? item.rating : item,
    }))
    .filter(({ rating }) =>
      Number.isFinite(typeof rating === "number" ? rating : parseFloat(rating))
    );

  const showRatingsSection = ratingsOnly || showRatings;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Blurred Backdrop */}
      <div 
        className="absolute inset-0 bg-white/0 dark:bg-gray-900/30 backdrop-blur-xs transition-all"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="bg-linear-to-r from-purple-600 to-purple-800 text-white p-6">
          <h2 className="text-2xl font-bold">{ratingsOnly ? "Visitor Ratings" : "Visitor Information"}</h2>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(85vh-180px)]">
          {!ratingsOnly && (
            <>
              {/* Name and Contact */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">
                    Name:
                  </label>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100 uppercase">
                    {visitorData.name || "N/A"}
                  </p>
                </div>

                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">
                    Contact Number:
                  </label>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {visitorData.contactNumber || "N/A"}
                  </p>
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">
                  Address:
                </label>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100 uppercase">
                  {visitorData.address || "N/A"}
                </p>
              </div>

              {/* Office and Purpose */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">
                    Office to Visit:
                  </label>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100 uppercase">
                    {visitorData.office || "N/A"}
                  </p>
                </div>

                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">
                    Purpose to Visit:
                  </label>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100 uppercase">
                    {visitorData.purpose || "N/A"}
                  </p>
                </div>
              </div>

              {/* Staff/Instructor */}
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">
                  Staff / Instructor to Visit:
                </label>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100 uppercase">
                  {visitorData.staffName || "N/A"}
                </p>
              </div>

              {/* Check-in Time and Date */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">
                    Check-in Date:
                  </label>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {visitorData.date || "N/A"}
                  </p>
                </div>

                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">
                    Check-in Time:
                  </label>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {visitorData.timeIn || "N/A"}
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              {visitorData.status && (
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">
                    Status:
                  </label>
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                    visitorData.status === 'checked-in' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : visitorData.status === 'checked-out'
                      ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                  }`}>
                    {visitorData.status.toUpperCase()}
                  </span>
                </div>
              )}
            </>
          )}

          {showRatingsSection && (
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400 mb-2 block">
                Ratings:
              </label>
              {numberedRatings.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {numberedRatings.map((item) => (
                    <span
                      key={`rating-${item.questionNumber}`}
                      className="inline-flex items-center px-3 py-1.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-semibold text-yellow-600 dark:text-yellow-400"
                    >
                      Q{item.questionNumber}: {formatRating(item.rating)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No ratings available for this visitor.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 flex justify-end border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-8 py-2.5 rounded-lg transition-colors shadow-md hover:shadow-lg"
          >
            OK
          </button>
        </div>
      </div>

      {/* Add animations */}
      <style jsx>{`
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
};

export default VisitorInfoModal;
