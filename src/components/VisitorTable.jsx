import React, { useState } from "react";
import { auth } from "../lib/firebase";

const VisitorTable = ({
  visitors = [],
  onViewDetails,
  canDeleteVisitors = false,
}) => {
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedVisitor, setSelectedVisitor] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState(null);

  // Format status for display
  const formatStatus = (status) => {
    if (status === 'checked-out') return 'Check Out';
    if (status === 'checked-in') return 'Check In';
    return status;
  };

  // Get status color
  const getStatusColor = (status) => {
    if (status === 'checked-out') {
      return "bg-green-100 text-green-700 border border-green-300";
    }
    return "bg-yellow-100 text-yellow-700 border border-yellow-300";
  };

  // Handle delete button click
  const handleDeleteClick = (visitor) => {
    setSelectedVisitor(visitor);
    setDeleteModalOpen(true);
    setError(null); // Clear any previous errors
  };

  // Handle confirm delete from Firebase
  const handleConfirmDelete = async () => {
    if (!selectedVisitor || !selectedVisitor.id) {
      setError("Cannot delete: No visitor ID found");
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const currentAuthUser = auth.currentUser;
      if (!currentAuthUser) {
        throw new Error("You are not logged in.");
      }

      const idToken = await currentAuthUser.getIdToken();
      const response = await fetch("/api/delete-visitor", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ id: selectedVisitor.id }),
      });

      let payload = {};
      try {
        payload = await response.json();
      } catch {
        // Ignore parse errors; use fallback message below.
      }

      if (!response.ok || payload.success === false) {
        throw new Error(payload.message || "Failed to delete visitor.");
      }
      
      // Close modal on success
      setDeleteModalOpen(false);
      setSelectedVisitor(null);
      
    } catch (error) {
      setError(error?.message || "Failed to delete visitor. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle cancel delete
  const handleCancelDelete = () => {
    if (!isDeleting) {
      setDeleteModalOpen(false);
      setSelectedVisitor(null);
      setError(null);
    }
  };

  if (visitors.length === 0) {
    return (
      <div className="border border-[#7400EA] dark:border-[#7400EA] rounded-xl shadow-sm bg-white p-8 dark:bg-gray-900 text-center">
        <div className="text-4xl mb-3">👤</div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">
          No visitor records found
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Try adjusting your search or filters
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="border border-[#7400EA] dark:border-[#7400EA] rounded-xl shadow-sm bg-white dark:bg-gray-900">
        <div className="p-5 pb-0">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">
            Visitor Records ({visitors.length})
          </h3>
        </div>

        <div className="px-5">
          <div className="relative overflow-hidden rounded-lg">
            {/* Scrollable table container */}
            <div className="overflow-x-auto">
              <div className="min-w-full inline-block align-middle">
                <div className="overflow-hidden">
                  <table className="min-w-full text-[13.33px] text-left">
                    <colgroup>
                      <col className="w-[150px]" />
                      <col className="w-[120px]" />
                      <col className="w-[100px]" />
                      <col className="w-[80px]" />
                      <col className="w-[80px]" />
                      <col className="w-[100px]" />
                      {canDeleteVisitors && <col className="w-[70px]" />}
                    </colgroup>
                    {/* Table header */}
                    <thead className="bg-white dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700">
                      <tr>
                        <th className="py-3 px-4 font-medium text-gray-700 dark:text-gray-300 text-left sticky left-0 bg-white dark:bg-gray-900 z-20">
                          Name
                        </th>
                        <th className="py-3 px-4 font-medium text-gray-700 dark:text-gray-300 text-left">
                          Office
                        </th>
                        <th className="py-3 px-4 font-medium text-gray-700 dark:text-gray-300 text-left">
                          Date
                        </th>
                        <th className="py-3 px-4 font-medium text-gray-700 dark:text-gray-300 text-left">
                          Time In
                        </th>
                        <th className="py-3 px-4 font-medium text-gray-700 dark:text-gray-300 text-left">
                          Time Out
                        </th>
                        <th className="py-3 px-4 font-medium text-gray-700 dark:text-gray-300 text-left">
                          Status
                        </th>
                        {canDeleteVisitors && (
                          <th className="py-3 px-4 font-medium text-gray-700 dark:text-gray-300 text-left">
                            Action
                          </th>
                        )}
                      </tr>
                    </thead>
                  </table>
                  
                  {/* Scrollable body */}
                  <div className="overflow-y-auto max-h-80">
                    <table className="min-w-full text-[13.33px] text-left">
                      <colgroup>
                        <col className="w-[150px]" />
                        <col className="w-[120px]" />
                        <col className="w-[100px]" />
                        <col className="w-[80px]" />
                        <col className="w-[80px]" />
                        <col className="w-[100px]" />
                        {canDeleteVisitors && <col className="w-[70px]" />}
                      </colgroup>
                      <tbody>
                        {visitors.map((v, index) => (
                          <tr
                            key={v.id || index}
                            onClick={() => onViewDetails?.(v)}
                            className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition cursor-pointer"
                          >
                            <td className="py-5 px-4 text-gray-800 dark:text-gray-100 font-medium sticky left-0 bg-white dark:bg-gray-900 z-10">
                              <div className="font-medium">{v.name}</div>
                              {v.purpose && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  {v.purpose}
                                </div>
                              )}
                            </td>
                            <td className="py-5 px-4 text-gray-700 dark:text-gray-300">
                              {v.office}
                            </td>
                            <td className="py-5 px-4 text-gray-700 dark:text-gray-300">
                              {v.date}
                            </td>
                            <td className="py-5 px-4 text-gray-700 dark:text-gray-300">
                              {v.timeIn}
                            </td>
                            <td className="py-5 px-4 text-gray-700 dark:text-gray-300">
                              {v.timeOut}
                            </td>
                            <td className="py-5 px-4">
                              <span
                                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(v.status)}`}
                              >
                                {formatStatus(v.status)}
                              </span>
                            </td>
                            {canDeleteVisitors && (
                              <td className="py-5 px-4">
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleDeleteClick(v);
                                  }}
                                  className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Delete visitor permanently"
                                >
                                  <svg
                                    className="w-5 h-5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                  </svg>
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* --- FOOTER WITH SUMMARY --- */}
        <div className="p-5 pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-sm text-gray-500 dark:text-gray-400 gap-2">
            <div>
              Showing {visitors.length} record{visitors.length !== 1 ? 's' : ''}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                <span>Currently In: {visitors.filter(v => v.status === 'checked-in').length}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-400"></div>
                <span>Checked Out: {visitors.filter(v => v.status === 'checked-out').length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && selectedVisitor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/70 bg-opacity-50 transition-opacity"
            onClick={handleCancelDelete}
          ></div>

          {/* Modal */}
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            {/* Modal Header */}
            <div className="flex items-start justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center">
                <div className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 mr-3">
                  <svg
                    className="h-5 w-5 text-red-600 dark:text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.232 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Delete Visitor Record
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    This action cannot be undone
                  </p>
                </div>
              </div>
              <button
                onClick={handleCancelDelete}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isDeleting}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Are you sure you want to delete this visitor record?
              </p>
              
              {/* Error display */}
              {error && (
                <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
                </div>
              )}
              
              <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 p-4 rounded-lg mb-6">
                <div className="font-semibold text-red-700 dark:text-red-400 text-lg mb-2 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.232 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  {selectedVisitor.name}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-gray-600 dark:text-gray-400">Date:</div>
                  <div className="font-medium dark:text-gray-200">{selectedVisitor.date}</div>
                  <div className="text-gray-600 dark:text-gray-400">Office:</div>
                  <div className="font-medium dark:text-gray-200">{selectedVisitor.office}</div>
                  <div className="text-gray-600 dark:text-gray-400">Time In:</div>
                  <div className="font-medium dark:text-gray-200">{selectedVisitor.timeIn}</div>
                  <div className="text-gray-600 dark:text-gray-400">Status:</div>
                  <div className="font-medium dark:text-gray-200">
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(selectedVisitor.status)}`}>
                      {formatStatus(selectedVisitor.status)}
                    </span>
                  </div>
                </div>
                
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={handleCancelDelete}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {isDeleting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Deleting...
                    </>
                  ) : (
                    "Delete Permanently"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default VisitorTable;
