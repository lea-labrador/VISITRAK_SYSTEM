// pages/Offices.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { Pencil, Trash2, Plus, X, AlertTriangle, UserPlus, Target, Mail, Calendar, Users, Hash, Key, Building, User, Check, Shield, Lock, Eye, EyeOff } from "lucide-react";
import {
  fetchOffices,
  addOffice,
  updateOffice,
  deleteOffice,
  adminResetOfficePassword,
  getOfficePasswordResetRequests,
  resolveOfficePasswordResetRequest,
} from "../lib/info.services";

const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidUsername = (username) =>
  /^[a-z0-9][a-z0-9._-]{2,30}[a-z0-9]$/.test((username || "").trim().toLowerCase());
const normalizeUsername = (username = "") => username.trim().toLowerCase();
const normalizeStaffName = (name = "") =>
  String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
const normalizeOfficeName = (name = "") =>
  String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
const getStaffNameKey = (staff) =>
  normalizeStaffName(typeof staff === "string" ? staff : staff?.name);
const asList = (items = []) => {
  if (Array.isArray(items)) return items;
  if (typeof items === "string") {
    const name = items.trim();
    return name ? [{ id: `legacy_${name}`, name }] : [];
  }
  if (items && typeof items === "object") {
    return Object.values(items).filter(Boolean);
  }
  return [];
};
const normalizeEditList = (items = []) =>
  asList(items).map((item) =>
    String(typeof item === "string" ? item : item?.name || "").trim()
  );
const isSuperOffice = (office = {}) =>
  String(office?.role || "").trim().toLowerCase() === "super";
const getOfficeSortLabel = (office = {}) =>
  String(
    office?.name ||
      office?.officialName ||
      office?.username ||
      office?.email ||
      ""
  )
    .trim()
    .toLowerCase();
const getOfficeDisplayName = (office = {}) => {
  const label = String(
    office?.name ||
      office?.officialName ||
      office?.username ||
      office?.email ||
      ""
  ).trim();
  return label || "another office";
};
const findDuplicateStaffName = (staffList = []) => {
  const seen = new Set();
  for (const staff of staffList || []) {
    const key = getStaffNameKey(staff);
    if (!key) continue;
    if (seen.has(key)) {
      return key;
    }
    seen.add(key);
  }
  return "";
};
const prioritizeSuperAdmins = (officeList = []) => {
  const offices = Array.isArray(officeList) ? [...officeList] : [];
  return offices.sort((a, b) => {
    const aIsSuper = isSuperOffice(a);
    const bIsSuper = isSuperOffice(b);
    if (aIsSuper !== bIsSuper) return aIsSuper ? -1 : 1;

    const aLabel = getOfficeSortLabel(a);
    const bLabel = getOfficeSortLabel(b);
    if (!aLabel && !bLabel) return 0;
    if (!aLabel) return 1;
    if (!bLabel) return -1;

    const byLabel = aLabel.localeCompare(bLabel, "en", {
      sensitivity: "base",
      numeric: true,
    });
    if (byLabel !== 0) return byLabel;

    const aId = String(a?.id || "").trim().toLowerCase();
    const bId = String(b?.id || "").trim().toLowerCase();
    if (!aId && !bId) return 0;
    if (!aId) return 1;
    if (!bId) return -1;
    return aId.localeCompare(bId, "en", { sensitivity: "base", numeric: true });
  });
};
const createEditSnapshot = (data = {}) => ({
  name: String(data.name || "").trim(),
  officialName: String(data.officialName || "").trim(),
  username: normalizeUsername(data.username || ""),
  email: String(data.email || "").trim().toLowerCase(),
  role: String(data.role || "office"),
  purposes: normalizeEditList(data.purposes),
  staffToVisit: normalizeEditList(data.staffToVisit),
});
const RESET_REQUEST_POLL_INTERVAL_MS = 30000;

// ==================== MEMOIZED COMPONENTS ====================

const EmailDisplay = memo(({ email, onNotify }) => {
  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-2 bg-blue-50 rounded-lg">
          <Mail className="w-4 h-4 text-blue-600" />
        </div>
        <div>
          <div className="text-sm font-medium text-gray-700">Auto-generated Email</div>
          <div className="text-xs text-gray-500">Based on office name</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 font-mono text-sm">
          {email || "office.name@gmail.com"}
        </div>
        {email && (
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(email);
                onNotify?.("Email copied to clipboard!", {
                  title: "Copied",
                  tone: "success",
                });
              } catch {
                onNotify?.("Failed to copy email to clipboard.", {
                  title: "Copy Failed",
                  tone: "error",
                });
              }
            }}
            className="px-4 py-3 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all flex items-center gap-2"
            title="Copy email"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy
          </button>
        )}
      </div>
    </div>
  );
});
EmailDisplay.displayName = 'EmailDisplay';

const StatItem = memo(({ icon, label, value, color = "gray" }) => {
  const IconComponent = icon;
  const colorClasses = {
    gray: "bg-gray-50 text-gray-600",
    purple: "bg-purple-50 text-purple-600",
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    orange: "bg-orange-50 text-orange-600"
  };

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className={`p-1.5 rounded-md shrink-0 ${colorClasses[color]}`}>
        <IconComponent size={14} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p
          className="text-sm font-medium truncate"
          title={value === null || value === undefined ? "" : String(value)}
        >
          {value}
        </p>
      </div>
    </div>
  );
});
StatItem.displayName = 'StatItem';

const OfficeCard = memo(({ office, index, onEdit, onDelete }) => {
  const purposes = asList(office.purposes);
  const staffToVisit = asList(office.staffToVisit);

  // Smart date formatter
  const formatDate = useCallback((timestamp) => {
    if (!timestamp) return "Just now";
    
    try {
      let date;
      
      if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
      } else if (timestamp.seconds && typeof timestamp.seconds === 'number') {
        date = new Date(timestamp.seconds * 1000);
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else {
        date = new Date(timestamp);
      }
      
      if (!date || isNaN(date.getTime())) {
        return "Just now";
      }
      
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return "Just now";
    }
  }, []);

  // Role badge styling
  const getRoleBadge = useCallback((role) => {
    const isSuper = role === "super";
    return (
      <span className={`text-[10px] font-medium tracking-wider px-2 py-1 rounded-full border ${
        isSuper 
          ? "bg-gradient-to-r from-purple-50 to-purple-100 text-purple-700 border-purple-200" 
          : "bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border-blue-200"
      }`}>
        {isSuper ? "SUPER ADMIN" : "OFFICE ADMIN"}
      </span>
    );
  }, []);

  return (
    <div className={`bg-white rounded-2xl border p-6 transition-all duration-300 hover:shadow-xl group flex flex-col dark:bg-gray-800 ${
      office.role === "super" 
        ? "border-purple-300 hover:border-purple-400 dark:border-purple-600" 
        : "border-gray-200 hover:border-[#7400EA]/20 dark:border-gray-700"
    }`}>
      {/* Card Header with Role Badge */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center dark:bg-white ${
              office.role === "super" 
                ? "bg-gradient-to-br from-purple-500/20 to-purple-700/20" 
                : "bg-gradient-to-br from-[#7400EA]/20 to-[#5B2D8B]/20"
            }`}>
              {office.role === "super" ? (
                <Shield className="w-5 h-5 text-purple-600" />
              ) : (
                <span className="text-lg font-bold text-[#7400EA]">
                  {office.name?.charAt(0).toUpperCase() || "O"}
                </span>
              )}
            </div>
            {getRoleBadge(office.role)}
            {office.role === "super" && (
              <span className="text-[8px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white">
                PROTECTED
              </span>
            )}
          </div>
          <h4 className={`text-xl font-bold group-hover:text-[#7400EA] transition-colors dark:text-gray-100 ${
            office.role === "super" ? "text-purple-700 group-hover:text-purple-600" : "text-gray-800"
          }`}>
            {office.name}
            {office.role === "super" && (
              <Lock className="inline ml-2 w-4 h-4 text-purple-500" />
            )}
          </h4>
          {office.officialName && (
            <p className="text-sm text-gray-600 mt-1 line-clamp-2 dark:text-gray-500">
              {office.officialName}
            </p>
          )}
        </div>
        
        {/* Action Buttons - Hide edit/delete for super admin */}
        <div className="flex gap-1">
          {office.role !== "super" && (
            <>
              <button
                onClick={() => onEdit(index)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-[#7400EA]"
                title="Edit"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => onDelete(index)}
                className="p-2 hover:bg-red-50 rounded-lg transition-colors text-gray-500 hover:text-red-600"
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>
      
      {/* Office Info Stats - Minimal Grid */}
      <div className="grid grid-cols-2 gap-4 mb-6 dark:text-white">
        <StatItem 
          icon={office.role === "super" ? Mail : Hash} 
          label={office.role === "super" ? "Email" : "Username"} 
          value={office.role === "super" ? (office.email || "N/A") : (office.username || "N/A")} 
          color={office.role === "super" ? "purple" : "purple"}
        />
        <StatItem 
          icon={Calendar} 
          label="Created" 
          value={formatDate(office.createdAt)} 
          color={office.role === "super" ? "purple" : "blue"}
        />
        {purposes.length > 0 && (
          <StatItem 
            icon={Target} 
            label="Purposes" 
            value={purposes.length} 
            color={office.role === "super" ? "purple" : "green"}
          />
        )}
        {staffToVisit.length > 0 && (
          <StatItem 
            icon={Users} 
            label="Staff" 
            value={staffToVisit.length} 
            color={office.role === "super" ? "purple" : "orange"}
          />
        )}
      </div>
    </div>
  );
});
OfficeCard.displayName = 'OfficeCard';

// ==================== MODAL COMPONENTS ====================

const AddOfficeModal = memo(({ 
  show, 
  onClose, 
  onSave, 
  data, 
  onDataChange, 
  onNameChange,
  onUsernameChange,
  suggestedUsername,
  onUseSuggestedUsername,
  newPurpose, 
  onNewPurposeChange,
  newStaff,
  onNewStaffChange,
  existingStaffLookup,
  onDuplicateStaff,
  error,
  loading
}) => {
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    if (!show || !error || !scrollContainerRef.current) return;
    scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
  }, [error, show]);

  if (!show) return null;

  const toUppercase = (text) => text ? text.toUpperCase() : "";


  const addPurposeToList = () => {
    if (newPurpose.trim() === "") return;
    
    onDataChange({
      ...data,
      purposes: [...data.purposes, { 
        id: Date.now().toString(), 
        name: toUppercase(newPurpose.trim())
      }]
    });
    onNewPurposeChange("");
  };

  const removePurposeFromList = (id) => {
    onDataChange({
      ...data,
      purposes: data.purposes.filter(purpose => purpose.id !== id)
    });
  };

  const addStaffToList = () => {
    const normalizedName = normalizeStaffName(newStaff);
    if (!normalizedName) return;

    const duplicateInOffice = data.staffToVisit.some(
      (staff) => getStaffNameKey(staff) === normalizedName
    );
    if (duplicateInOffice) {
      onDuplicateStaff?.(normalizedName, "this office");
      return;
    }

    const assignedOffice = existingStaffLookup?.get?.(normalizedName);
    if (assignedOffice) {
      onDuplicateStaff?.(normalizedName, assignedOffice);
      return;
    }
    
    onDataChange((prev) => {
      const alreadyAdded = prev.staffToVisit.some(
        (staff) => getStaffNameKey(staff) === normalizedName
      );
      if (alreadyAdded) {
        return prev;
      }
      return {
        ...prev,
        staffToVisit: [
          ...prev.staffToVisit,
          {
            id: Date.now().toString(),
            name: normalizedName,
          },
        ],
      };
    });
    onNewStaffChange("");
  };

  const removeStaffFromList = (id) => {
    onDataChange({
      ...data,
      staffToVisit: data.staffToVisit.filter(staff => staff.id !== id)
    });
  };

  const renderList = (items, onRemove, type = "purpose") => {
    const isPurpose = type === "purpose";
    
    if (items.length === 0) {
      return (
        <div className="text-center py-4 border border-dashed border-gray-300 rounded-xl">
          {isPurpose ? (
            <>
              <Target className="w-6 h-6 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No purposes added yet</p>
            </>
          ) : (
            <>
              <UserPlus className="w-6 h-6 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No staff/instructors added yet</p>
            </>
          )}
        </div>
      );
    }
    
    return (
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <div 
            key={item.id} 
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all hover:scale-[1.02] bg-gradient-to-r from-purple-50 to-purple-100 text-purple-700"
          >
            {isPurpose ? <Target size={14} /> : <UserPlus size={14} />}
            <span className="font-medium">{item.name}</span>
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="ml-1 text-purple-400 hover:text-purple-600 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="sticky top-0 bg-gradient-to-r from-[#7400EA] to-[#5B2D8B] text-white px-8 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                <Building size={24} />
              </div>
              <div>
                <h3 className="text-2xl font-bold">Create New Office</h3>
                <p className="text-white/80 text-sm mt-1">Add a new office account with custom settings</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-all">
              <X className="text-white" size={24} />
            </button>
          </div>
        </div>
        
          <div ref={scrollContainerRef} className="p-8 overflow-y-auto max-h-[calc(90vh-120px)]">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg">
              <div className="flex items-center gap-3">
                <AlertTriangle className="text-red-500" size={20} />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            </div>
          )}
          <div className="space-y-8">
            {/* Basic Information */}
            <div className="bg-gray-50 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Building className="w-5 h-5 text-purple-600" />
                </div>
                <h4 className="text-lg font-semibold text-gray-800">Office Details</h4>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-3">
                    Office Name (e,g: SDS, Registrar, etc.)
                  </label>
                  <div className="relative">
                    <input
                      value={data.name}
                      onChange={(e) => onNameChange(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl focus:border-[#7400EA] focus:ring-2 focus:ring-[#7400EA]/20 transition-all uppercase"
                      placeholder="Enter office name"
                      disabled={loading}
                      style={{ textTransform: 'uppercase' }}
                    />
                    
                  </div>
                  <div className="mt-4">
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      Username <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={data.username || ""}
                      onChange={(e) => onUsernameChange(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                      placeholder="office.username"
                      disabled={loading}
                    />
                    <p className="mt-2 text-xs text-gray-500">
                      Login identifier for this office admin.
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      Login uses username only. No email is required for office admins.
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2">
                      <p className="text-xs text-purple-700">
                        Suggested username:{" "}
                        <span className="font-mono font-semibold">{suggestedUsername}</span>
                      </p>
                      <button
                        type="button"
                        onClick={onUseSuggestedUsername}
                        disabled={
                          loading ||
                          normalizeUsername(data.username || "") === normalizeUsername(suggestedUsername)
                        }
                        className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-purple-600 text-white hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Use Suggested
                      </button>
                    </div>
                  </div>

                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-3">
                    Official Office Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      value={data.officialName}
                      onChange={(e) => onDataChange({ ...data, officialName: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl focus:border-[#7400EA] focus:ring-2 focus:ring-[#7400EA]/20 transition-all"
                      placeholder="e.g., Office of the Registrar"
                      disabled={loading}
                    />
                    <div className="absolute right-3 top-3">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Full Name</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* User Role - Only Office Admin for new offices */}
            <div className="bg-gray-50 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Key className="w-5 h-5 text-purple-600" />
                </div>
                <h4 className="text-lg font-semibold text-gray-800">Access Level</h4>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  {/* Only Office Admin Option - Auto-selected */}
                  <label className="relative overflow-hidden rounded-xl border-2 border-purple-500 bg-purple-50 cursor-not-allowed">
                    <input
                      type="radio"
                      checked={true}
                      className="sr-only"
                      disabled
                    />
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-purple-100">
                            <Building className="w-4 h-4 text-purple-600" />
                          </div>
                          <span className="font-semibold text-gray-800">Office Admin</span>
                        </div>
                        <div className="w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Initial Password:</span>
                          <code className="font-mono bg-gray-100 px-2 py-1 rounded text-gray-700">officeadmin2025</code>
                        </div>
                        <p className="text-xs text-gray-500">Limited to specific office functions and data</p>
                        <p className="text-xs text-purple-500 font-medium mt-2">
                          â„¹ï¸ All new offices are created as Office Admins.
                        </p>
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Purposes of Visit */}
            <div className="bg-gray-50 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Target className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-gray-800">Visit Purposes</h4>
                    <p className="text-sm text-gray-500">What visitors can select when visiting</p>
                  </div>
                </div>
                <span className="text-sm font-medium bg-purple-100 text-purple-600 px-3 py-1 rounded-full">
                  {data.purposes.length} added
                </span>
              </div>
              
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={newPurpose}
                      onChange={(e) => onNewPurposeChange(toUppercase(e.target.value))}
                      onKeyPress={(e) => e.key === 'Enter' && addPurposeToList()}
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all uppercase"
                      placeholder="Add a purpose (e.g., MEETING, CONSULTATION)"
                      disabled={loading}
                      style={{ textTransform: 'uppercase' }}
                    />
                    <div className="absolute right-3 top-3">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">UPPERCASE</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={addPurposeToList}
                    disabled={loading || !newPurpose.trim()}
                    className="px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
                  >
                    <Plus size={18} />
                    Add
                  </button>
                </div>
                
                {renderList(data.purposes, removePurposeFromList, "purpose")}
              </div>
            </div>

            {/* Staff/Instructors to Visit */}
            <div className="bg-gray-50 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <UserPlus className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-gray-800">Staff & Instructors</h4>
                    <p className="text-sm text-gray-500">Who visitors can request to meet</p>
                  </div>
                </div>
                <span className="text-sm font-medium bg-purple-100 text-purple-600 px-3 py-1 rounded-full">
                  {data.staffToVisit.length} added
                </span>
              </div>
              
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={newStaff}
                      onChange={(e) => onNewStaffChange(toUppercase(e.target.value))}
                      onKeyPress={(e) => e.key === 'Enter' && addStaffToList()}
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all uppercase"
                      placeholder="Add staff/instructor name"
                      disabled={loading}
                      style={{ textTransform: 'uppercase' }}
                    />
                    <div className="absolute right-3 top-3">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">UPPERCASE</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={addStaffToList}
                    disabled={loading || !newStaff.trim()}
                    className="px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
                  >
                    <Plus size={18} />
                    Add
                  </button>
                </div>
                
                {renderList(data.staffToVisit, removeStaffFromList, "staff")}
              </div>
            </div>

            {/* Action Button */}
            <div className="pt-6 border-t border-gray-200">
              <button 
                onClick={onSave} 
                disabled={loading}
                className="w-full bg-gradient-to-r from-[#7400EA] to-[#5B2D8B] hover:from-[#5B2D8B] hover:to-[#4a2470] text-white py-4 rounded-xl transition-all duration-300 font-semibold text-lg shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-3">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>
                    Creating Office Account...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-3">
                    <Plus size={20} />
                    CREATE OFFICE ACCOUNT
                    <svg className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
AddOfficeModal.displayName = 'AddOfficeModal';

const NotificationModal = memo(({ show, title, message, tone = "info", onClose }) => {
  if (!show) return null;

  const toneStyles = {
    success: {
      border: "border-green-200",
      bg: "bg-green-50",
      text: "text-green-800",
      button: "bg-green-600 hover:bg-green-700",
    },
    warning: {
      border: "border-amber-200",
      bg: "bg-amber-50",
      text: "text-amber-800",
      button: "bg-amber-600 hover:bg-amber-700",
    },
    error: {
      border: "border-red-200",
      bg: "bg-red-50",
      text: "text-red-800",
      button: "bg-red-600 hover:bg-red-700",
    },
    info: {
      border: "border-blue-200",
      bg: "bg-blue-50",
      text: "text-blue-800",
      button: "bg-blue-600 hover:bg-blue-700",
    },
  };

  const selectedTone = toneStyles[tone] || toneStyles.info;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
      <div className={`w-full max-w-md rounded-xl border ${selectedTone.border} ${selectedTone.bg} shadow-xl`}>
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className={`text-lg font-semibold ${selectedTone.text}`}>{title || "Notice"}</h4>
              <p className={`mt-2 text-sm whitespace-pre-line break-words ${selectedTone.text}`}>
                {message}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition"
              aria-label="Close notification"
            >
              <X size={18} />
            </button>
          </div>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 text-sm font-semibold text-white rounded-lg transition ${selectedTone.button}`}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
NotificationModal.displayName = "NotificationModal";

const DuplicateStaffModal = memo(({ show, staffName, officeName, onClose }) => {
  if (!show) return null;

  const displayStaff = staffName || "Unknown Staff";
  const displayOffice =
    officeName === "this office" ? "This Office" : officeName || "Another Office";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[75] p-4">
      <div className="w-full max-w-lg rounded-2xl border border-amber-200 bg-amber-50 shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <AlertTriangle size={22} />
            </div>
            <div>
              <h4 className="text-xl font-bold">Duplicate Staff Detected</h4>
              <p className="text-sm text-white/90">
                This staff/instructor is already assigned.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-xl border border-amber-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-amber-600 font-semibold">
              Staff / Instructor
            </p>
            <p className="mt-1 text-lg font-semibold text-gray-800">
              {displayStaff}
            </p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-amber-600 font-semibold">
              Assigned Office
            </p>
            <p className="mt-1 text-lg font-semibold text-gray-800">
              {displayOffice}
            </p>
          </div>

          <p className="text-sm text-amber-800">
            Please remove this staff from the existing office if you want to
            reassign them.
          </p>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-amber-600 hover:bg-amber-700 transition"
            >
              OK, Got It
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
DuplicateStaffModal.displayName = "DuplicateStaffModal";

const ConfirmationModal = memo(
  ({
    show,
    title,
    message,
    tone = "warning",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    loading = false,
    onConfirm,
    onCancel,
  }) => {
    if (!show) return null;

    const toneStyles = {
      warning: {
        border: "border-amber-200",
        bg: "bg-amber-50",
        text: "text-amber-800",
        confirmButton: "bg-amber-600 hover:bg-amber-700",
      },
      danger: {
        border: "border-red-200",
        bg: "bg-red-50",
        text: "text-red-800",
        confirmButton: "bg-red-600 hover:bg-red-700",
      },
      info: {
        border: "border-blue-200",
        bg: "bg-blue-50",
        text: "text-blue-800",
        confirmButton: "bg-blue-600 hover:bg-blue-700",
      },
    };

    const selectedTone = toneStyles[tone] || toneStyles.warning;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4">
        <div className={`w-full max-w-md rounded-xl border ${selectedTone.border} ${selectedTone.bg} shadow-xl`}>
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className={`text-lg font-semibold ${selectedTone.text}`}>{title || "Please Confirm"}</h4>
                <p className={`mt-2 text-sm whitespace-pre-line break-words ${selectedTone.text}`}>
                  {message}
                </p>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="text-gray-500 hover:text-gray-700 transition"
                aria-label="Close confirmation"
                disabled={loading}
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition disabled:opacity-50"
                disabled={loading}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`px-4 py-2 text-sm font-semibold text-white rounded-lg transition ${selectedTone.confirmButton} disabled:opacity-50`}
                disabled={loading}
              >
                {loading ? "Processing..." : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
ConfirmationModal.displayName = "ConfirmationModal";

// ==================== MAIN COMPONENT ====================

const Offices = () => {
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ðŸ”¹ Add Office Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addData, setAddData] = useState({ 
    name: "", 
    officialName: "", 
    username: "",
    email: "",
    role: "office", // Always "office" for new offices
    purposes: [],
    staffToVisit: []
  });
  const [newPurpose, setNewPurpose] = useState("");
  const [newStaff, setNewStaff] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  const [addUsernameManuallyEdited, setAddUsernameManuallyEdited] = useState(false);

  // ðŸ”¹ Edit Modal
  const [editIndex, setEditIndex] = useState(null);
  const [editData, setEditData] = useState({ 
    id: "", 
    name: "", 
    officialName: "", 
    username: "",
    email: "", 
    role: "office",
    purposes: [],
    staffToVisit: []
  });
  const [editNewPurpose, setEditNewPurpose] = useState("");
  const [editNewStaff, setEditNewStaff] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const editModalScrollRef = useRef(null);
  const [editBaseline, setEditBaseline] = useState(null);
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [showResetPasswordFields, setShowResetPasswordFields] = useState(false);
  const [resetPasswordForm, setResetPasswordForm] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [resetPasswordVisibility, setResetPasswordVisibility] = useState({
    newPassword: false,
    confirmPassword: false,
  });
  const [resetPasswordError, setResetPasswordError] = useState("");
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState(null);
  const [resetRequests, setResetRequests] = useState([]);
  const [resetRequestsLoading, setResetRequestsLoading] = useState(false);
  const [resetRequestActionId, setResetRequestActionId] = useState("");
  const [resetRequestConfirmation, setResetRequestConfirmation] = useState({
    show: false,
    requestId: "",
    action: "",
  });
  const [notificationModal, setNotificationModal] = useState({
    show: false,
    title: "",
    message: "",
    tone: "info",
  });
  const [duplicateStaffModal, setDuplicateStaffModal] = useState({
    show: false,
    staffName: "",
    officeName: "",
  });

  // ðŸ”¹ Delete Modal
  const [deleteIndex, setDeleteIndex] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);

  useEffect(() => {
    if (editIndex === null || !editError || !editModalScrollRef.current) return;
    editModalScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
  }, [editError, editIndex]);

  // ðŸ”¹ Helper functions with useCallback
  const toUppercase = useCallback((text) => text ? text.toUpperCase() : "", []);

  const buildSuggestedUsername = useCallback((officeName = "") => {
    const existingUsernames = new Set(
      offices
        .map((office) => normalizeUsername(office?.username || ""))
        .filter(Boolean)
    );

    let base = String(officeName || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "");

    if (!base) {
      base = "office.admin";
    }

    if (base.length < 4) {
      base = `${base}.admin`;
    }

    base = base.slice(0, 32).replace(/[^a-z0-9]+$/g, "");
    if (!isValidUsername(base)) {
      base = "office.admin";
    }

    if (!existingUsernames.has(base)) {
      return base;
    }

    for (let count = 1; count <= 999; count += 1) {
      const suffix = `.${count}`;
      const maxBaseLength = 32 - suffix.length;
      const trimmedBase =
        (base.slice(0, maxBaseLength).replace(/[^a-z0-9]+$/g, "") || "office").slice(0, maxBaseLength);
      const candidate = `${trimmedBase}${suffix}`;

      if (isValidUsername(candidate) && !existingUsernames.has(candidate)) {
        return candidate;
      }
    }

    return "office.admin";
  }, [offices]);

  const suggestedAddUsername = useMemo(
    () => buildSuggestedUsername(addData.name),
    [addData.name, buildSuggestedUsername]
  );
  const existingStaffLookup = useMemo(() => {
    const lookup = new Map();
    offices.forEach((office) => {
      const officeLabel = getOfficeDisplayName(office);
      asList(office.staffToVisit).forEach((staff) => {
        const key = getStaffNameKey(staff);
        if (key && !lookup.has(key)) {
          lookup.set(key, officeLabel);
        }
      });
    });
    return lookup;
  }, [offices]);

  const findStaffConflictInOtherOffices = useCallback(
    (staffList = [], options = {}) => {
      const excludeIndex =
        typeof options.excludeIndex === "number" ? options.excludeIndex : null;
      for (const staff of staffList || []) {
        const key = getStaffNameKey(staff);
        if (!key) continue;
        const conflict = offices.find(
          (office, index) =>
            (excludeIndex === null || index !== excludeIndex) &&
            asList(office.staffToVisit).some(
              (officeStaff) => getStaffNameKey(officeStaff) === key
            )
        );
        if (conflict) {
          return { nameKey: key, officeLabel: getOfficeDisplayName(conflict) };
        }
      }
      return null;
    },
    [offices]
  );

  const handleAddOfficeNameChange = useCallback((value) => {
    const uppercaseName = toUppercase(value);
    const suggested = buildSuggestedUsername(uppercaseName);

    setAddData((prev) => ({
      ...prev,
      name: uppercaseName,
      username:
        !addUsernameManuallyEdited || !String(prev.username || "").trim()
          ? suggested
          : prev.username,
    }));
  }, [addUsernameManuallyEdited, buildSuggestedUsername, toUppercase]);

  const handleAddUsernameChange = useCallback((value) => {
    setAddUsernameManuallyEdited(true);
    setAddData((prev) => ({
      ...prev,
      username: normalizeUsername(value),
    }));
  }, []);

  const handleUseSuggestedAddUsername = useCallback(() => {
    const suggested = buildSuggestedUsername(addData.name);
    setAddData((prev) => ({
      ...prev,
      username: suggested,
    }));
    setAddUsernameManuallyEdited(false);
  }, [addData.name, buildSuggestedUsername]);

  const showNotification = useCallback((message, options = {}) => {
    setNotificationModal({
      show: true,
      title: options.title || "Notice",
      message: String(message || ""),
      tone: options.tone || "info",
    });
  }, []);

  const closeNotification = useCallback(() => {
    setNotificationModal((prev) => ({
      ...prev,
      show: false,
    }));
  }, []);

  const openDuplicateStaffModal = useCallback((staffName, officeName) => {
    setDuplicateStaffModal({
      show: true,
      staffName: normalizeStaffName(staffName),
      officeName: String(officeName || "").trim(),
    });
  }, []);

  const closeDuplicateStaffModal = useCallback(() => {
    setDuplicateStaffModal((prev) => ({
      ...prev,
      show: false,
    }));
  }, []);

  const requestResetRequestConfirmation = useCallback((requestId, action) => {
    if (!requestId) return;
    setResetRequestConfirmation({
      show: true,
      requestId,
      action,
    });
  }, []);

  const closeResetRequestConfirmation = useCallback(() => {
    setResetRequestConfirmation({
      show: false,
      requestId: "",
      action: "",
    });
  }, []);

  const loadPendingResetRequests = useCallback(async (options = {}) => {
    const showLoader = options?.showLoader === true;
    try {
      if (showLoader) {
        setResetRequestsLoading(true);
      }
      const pendingRequests = await getOfficePasswordResetRequests("pending");
      setResetRequests(Array.isArray(pendingRequests) ? pendingRequests : []);
    } catch  {
    } finally {
      if (showLoader) {
        setResetRequestsLoading(false);
      }
    }
  }, []);
  // Load offices first; reset requests are best-effort so they never block page load.
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      setError(null);
      try {
        const officeData = await fetchOffices();
        setOffices(prioritizeSuperAdmins(officeData));

        await loadPendingResetRequests({ showLoader: true });
      } catch (err) {
        setError(`Failed to load offices: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    loadInitialData();
  }, [loadPendingResetRequests]);

  // Keep reset requests list fresh without manual page refresh.
  useEffect(() => {
    let isPolling = false;

    const pollResetRequests = async () => {
      if (document.visibilityState === "hidden") return;
      if (resetRequestActionId || isPolling) return;

      try {
        isPolling = true;
        await loadPendingResetRequests();
      } finally {
        isPolling = false;
      }
    };

    const intervalId = setInterval(
      pollResetRequests,
      RESET_REQUEST_POLL_INTERVAL_MS
    );

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        pollResetRequests();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadPendingResetRequests, resetRequestActionId]);

  // ðŸ”¹ Reset delete confirmation when modal closes
  useEffect(() => {
    if (deleteIndex === null) {
      setDeleteConfirmed(false);
    }
  }, [deleteIndex]);

  // ðŸ”¹ Handle add purpose input
  const handleAddPurposeInput = useCallback((value) => {
    setNewPurpose(toUppercase(value));
  }, [toUppercase]);

  // ðŸ”¹ Handle add staff input
  const handleAddStaffInput = useCallback((value) => {
    setNewStaff(toUppercase(value));
  }, [toUppercase]);

  const closeEditModal = useCallback(() => {
    setEditIndex(null);
    setEditBaseline(null);
    setShowResetPasswordFields(false);
    setResetPasswordForm({
      newPassword: "",
      confirmPassword: "",
    });
    setResetPasswordVisibility({
      newPassword: false,
      confirmPassword: false,
    });
    setResetPasswordError("");
    setResetPasswordSuccess(null);
  }, []);

  const hasEditChanges = useMemo(() => {
    if (editIndex === null || !editBaseline) return false;
    const currentSnapshot = createEditSnapshot(editData);
    return JSON.stringify(currentSnapshot) !== JSON.stringify(editBaseline);
  }, [editBaseline, editData, editIndex]);

  // ðŸ”¹ OPTIMIZED: Add Office - Update local state immediately
  const saveAddOffice = useCallback(async () => {
    if (!addData.name.trim()) {
      setAddError("Office name is required");
      return;
    }
    
    if (!addData.officialName.trim()) {
      setAddError("Official office name is required");
      return;
    }

    const nameKey = normalizeOfficeName(addData.name);
    const officialKey = normalizeOfficeName(addData.officialName);
    const existingOffice = offices.find((office) => {
      const officeNameKey = normalizeOfficeName(office?.name);
      const officeOfficialKey = normalizeOfficeName(office?.officialName);
      return (
        (nameKey &&
          (nameKey === officeNameKey || nameKey === officeOfficialKey)) ||
        (officialKey &&
          (officialKey === officeNameKey || officialKey === officeOfficialKey))
      );
    });

    if (existingOffice) {
      setAddError("An office with this name already exists");
      return;
    }

    const duplicateStaffName = findDuplicateStaffName(addData.staffToVisit);
    if (duplicateStaffName) {
      openDuplicateStaffModal(duplicateStaffName, "this office");
      return;
    }

    const staffConflict = findStaffConflictInOtherOffices(addData.staffToVisit);
    if (staffConflict) {
      openDuplicateStaffModal(staffConflict.nameKey, staffConflict.officeLabel);
      return;
    }

    const normalizedUsername = normalizeUsername(addData.username || "");
    if (!isValidUsername(normalizedUsername)) {
      setAddError("Invalid username format");
      return;
    }
    
    const usernameExists = offices.some(office =>
      office.username && office.username.toLowerCase() === normalizedUsername
    );
    
    if (usernameExists) {
      setAddError("An office with this username already exists");
      return;
    }
    
    setAddLoading(true);
    setAddError("");
    
    try {
      const newOffice = await addOffice({
        ...addData,
        username: normalizedUsername,
        role: "office",
      });

      setOffices((prev) =>
        prioritizeSuperAdmins([
          ...prev,
          { ...newOffice, createdAt: newOffice.createdAt || new Date() },
        ])
      );
      setShowAddModal(false);
      
      // Reset form
      setAddData({ 
        name: "", 
        officialName: "",
        username: "",
        email: "", 
        role: "office",
        purposes: [],
        staffToVisit: []
      });
      setAddUsernameManuallyEdited(false);
      setNewPurpose("");
      setNewStaff("");
      
      showNotification(`Office "${addData.name}" added successfully!`, {
        title: "Office Added",
        tone: "success",
      });
    } catch (err) {
      setAddError(`Failed to add office: ${err.message}`);
      showNotification(`Failed to add office: ${err.message}`, {
        title: "Add Office Failed",
        tone: "warning",
      });
    } finally {
      setAddLoading(false);
    }
  }, [addData, findStaffConflictInOtherOffices, offices, openDuplicateStaffModal, showNotification]);

  // ðŸ”¹ Open edit modal
  const openEditModal = useCallback((index) => {
    if (index >= 0 && index < offices.length) {
      const office = offices[index];
      setEditIndex(index);
      const nextEditData = {
        id: office.id,
        name: office.name || "",
        officialName: office.officialName || "",
        username: office.username || "",
        email: office.email || "",
        role: office.role || "office", // Preserve original role
        passwordChanged: office.passwordChanged === true,
        passwordChangedAt: office.passwordChangedAt || null,
        purposes: asList(office.purposes),
        staffToVisit: asList(office.staffToVisit)
      };
      setEditData(nextEditData);
      setEditBaseline(createEditSnapshot(nextEditData));
      setEditNewPurpose("");
      setEditNewStaff("");
      setEditError("");
      setShowResetPasswordFields(false);
      setResetPasswordForm({
        newPassword: "",
        confirmPassword: "",
      });
      setResetPasswordVisibility({
        newPassword: false,
        confirmPassword: false,
      });
      setResetPasswordError("");
      setResetPasswordSuccess(null);
    }
  }, [offices]);

  // ðŸ”¹ Handle edit office name change
  const handleEditNameChange = useCallback((value) => {
    const uppercaseName = toUppercase(value);

    setEditData(prev => ({
      ...prev,
      name: uppercaseName
    }));
  }, [toUppercase]);

  // ðŸ”¹ Handle edit purpose input
  const handleEditPurposeInput = useCallback((value) => {
    setEditNewPurpose(toUppercase(value));
  }, [toUppercase]);

  // ðŸ”¹ Handle edit staff input
  const handleEditStaffInput = useCallback((value) => {
    setEditNewStaff(toUppercase(value));
  }, [toUppercase]);

  const generateTemporaryPassword = useCallback(() => {
    const token = Math.random().toString(36).slice(-8).toUpperCase();
    return `VisiTrak!${token}`;
  }, []);

  const handleOpenAdminPasswordReset = useCallback(() => {
    if (editData.role === "super") {
      setResetPasswordError("Super Admin passwords cannot be reset from this action.");
      return;
    }

    setShowResetPasswordFields(true);
    setResetPasswordError("");
    setResetPasswordSuccess(null);
  }, [editData.role]);

  const handleUseSuggestedPassword = useCallback(() => {
    const suggestedPassword = generateTemporaryPassword();
    setResetPasswordForm({
      newPassword: suggestedPassword,
      confirmPassword: suggestedPassword,
    });
    setResetPasswordError("");
    setResetPasswordSuccess(null);
  }, [generateTemporaryPassword]);

  const handleResetPasswordFieldChange = useCallback((field, value) => {
    setResetPasswordForm((prev) => ({
      ...prev,
      [field]: value,
    }));
    setResetPasswordError("");
    setResetPasswordSuccess(null);
  }, []);

  const toggleResetPasswordVisibility = useCallback((field) => {
    setResetPasswordVisibility((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  }, []);

  const handleAdminPasswordReset = useCallback(async () => {
    if (!editData?.id) return;

    if (editData.role === "super") {
      setResetPasswordError("Super Admin passwords cannot be reset from this action.");
      return;
    }

    const nextPassword = resetPasswordForm.newPassword.trim();
    const confirmPassword = resetPasswordForm.confirmPassword.trim();

    if (nextPassword.length < 8) {
      setResetPasswordError("Password must be at least 8 characters.");
      return;
    }

    if (nextPassword !== confirmPassword) {
      setResetPasswordError("New password and confirm password do not match.");
      return;
    }

    setResetPasswordLoading(true);
    setResetPasswordError("");
    setResetPasswordSuccess(null);

    try {
      const response = await adminResetOfficePassword(editData.id, nextPassword);

      setOffices((prev) =>
        prioritizeSuperAdmins(
          prev.map((office) =>
            office.id === editData.id
              ? {
                  ...office,
                  passwordChanged: false,
                  passwordChangedAt: null,
                }
              : office
          )
        )
      );

      setEditData((prev) => ({
        ...prev,
        passwordChanged: false,
        passwordChangedAt: null,
      }));

      const loginUsername = response?.data?.username || editData.username;
      setResetPasswordSuccess({
        officeName: editData.name || "Office",
        loginUsername: loginUsername || "N/A",
        newPassword: nextPassword,
      });
      setResetPasswordForm({
        newPassword: "",
        confirmPassword: "",
      });
    } catch (error) {
      const message = error?.message || "Failed to reset password.";
      setResetPasswordError(message);
    } finally {
      setResetPasswordLoading(false);
    }
  }, [editData, resetPasswordForm]);


  const handleResolveResetRequest = useCallback(
    async (requestId, action) => {
      if (!requestId) return;
      const isApprove = action === "approve";

      setResetRequestActionId(requestId);
      try {
        const response = await resolveOfficePasswordResetRequest(requestId, action);
        await loadPendingResetRequests();

        if (isApprove && response?.resetLink) {
          try {
            await navigator.clipboard.writeText(response.resetLink);
          } catch  {
          }
        }
      } catch (error) {
        await loadPendingResetRequests();
        showNotification(`Failed to resolve request: ${error.message}`, {
          title: "Action Failed",
          tone: "error",
        });
      } finally {
        setResetRequestActionId("");
      }
    },
    [loadPendingResetRequests, showNotification]
  );

  const confirmResolveResetRequest = useCallback(async () => {
    const requestId = resetRequestConfirmation.requestId;
    const action = resetRequestConfirmation.action;

    if (!requestId || !action) {
      closeResetRequestConfirmation();
      return;
    }

    closeResetRequestConfirmation();
    await handleResolveResetRequest(requestId, action);
  }, [closeResetRequestConfirmation, handleResolveResetRequest, resetRequestConfirmation]);

  // Add purpose to edit list
  const addPurposeToEditList = useCallback(() => {
    if (editNewPurpose.trim() === "") return;
    
    setEditData(prev => ({
      ...prev,
      purposes: [...prev.purposes, { 
        id: Date.now().toString(), 
        name: toUppercase(editNewPurpose.trim())
      }]
    }));
    setEditNewPurpose("");
  }, [editNewPurpose, toUppercase]);

  // ðŸ”¹ Remove purpose from edit list
  const removePurposeFromEditList = useCallback((id) => {
    setEditData(prev => ({
      ...prev,
      purposes: prev.purposes.filter(purpose => purpose.id !== id)
    }));
  }, []);

  // ðŸ”¹ Add staff to edit list
  const addStaffToEditList = useCallback(() => {
    const normalizedName = normalizeStaffName(editNewStaff);
    if (!normalizedName) return;

    const duplicateInOffice = editData.staffToVisit.some(
      (staff) => getStaffNameKey(staff) === normalizedName
    );
    if (duplicateInOffice) {
      openDuplicateStaffModal(normalizedName, "this office");
      return;
    }

    const conflictingOffice = offices.find(
      (office, index) =>
        index !== editIndex &&
        asList(office.staffToVisit).some(
          (staff) => getStaffNameKey(staff) === normalizedName
        )
    );
    if (conflictingOffice) {
      const officeLabel = getOfficeDisplayName(conflictingOffice);
      openDuplicateStaffModal(normalizedName, officeLabel);
      return;
    }
    
    setEditData((prev) => {
      const alreadyAdded = prev.staffToVisit.some(
        (staff) => getStaffNameKey(staff) === normalizedName
      );
      if (alreadyAdded) {
        return prev;
      }
      return {
        ...prev,
        staffToVisit: [
          ...prev.staffToVisit,
          {
            id: Date.now().toString(),
            name: normalizedName,
          },
        ],
      };
    });
    setEditNewStaff("");
    setEditError("");
  }, [editData.staffToVisit, editIndex, editNewStaff, offices, openDuplicateStaffModal]);

  // ðŸ”¹ Remove staff from edit list
  const removeStaffFromEditList = useCallback((id) => {
    setEditData(prev => ({
      ...prev,
      staffToVisit: prev.staffToVisit.filter(staff => staff.id !== id)
    }));
  }, []);

  // ðŸ”¹ OPTIMIZED: Save edit - Update local state immediately
  const saveEdit = useCallback(async () => {
    if (editIndex === null) return;

    if (!hasEditChanges) {
      showNotification("No changes detected. Update at least one field before saving.", {
        title: "No Changes",
        tone: "info",
      });
      return;
    }
    
    if (!editData.name.trim()) {
      setEditError("Office name is required");
      return;
    }

    if (!editData.officialName.trim()) {
      setEditError("Official office name is required");
      return;
    }

    const nameKey = normalizeOfficeName(editData.name);
    const officialKey = normalizeOfficeName(editData.officialName);
    const baselineNameKey = normalizeOfficeName(editBaseline?.name || "");
    const baselineOfficialKey = normalizeOfficeName(editBaseline?.officialName || "");
    const nameChanged =
      !editBaseline || nameKey !== baselineNameKey || officialKey !== baselineOfficialKey;

    if (nameChanged) {
      const currentOfficeId = editData.id;
      const existingOffice = offices.find((office, index) => {
        if (currentOfficeId && office?.id === currentOfficeId) return false;
        if (!currentOfficeId && index === editIndex) return false;
        const officeNameKey = normalizeOfficeName(office?.name);
        const officeOfficialKey = normalizeOfficeName(office?.officialName);
        return (
          (nameKey &&
            (nameKey === officeNameKey || nameKey === officeOfficialKey)) ||
          (officialKey &&
            (officialKey === officeNameKey || officialKey === officeOfficialKey))
        );
      });

      if (existingOffice) {
        setEditError("An office with this name already exists");
        return;
      }
    }

    const duplicateStaffName = findDuplicateStaffName(editData.staffToVisit);
    if (duplicateStaffName) {
      openDuplicateStaffModal(duplicateStaffName, "this office");
      return;
    }

    const staffConflict = findStaffConflictInOtherOffices(editData.staffToVisit, {
      excludeIndex: editIndex,
    });
    if (staffConflict) {
      openDuplicateStaffModal(staffConflict.nameKey, staffConflict.officeLabel);
      return;
    }

    const normalizedUsername = normalizeUsername(editData.username || "");
    if (editData.role === "super") {
      if (!isValidEmail(editData.email)) {
        setEditError("Invalid email address");
        return;
      }

      const emailExists = offices.some((office, index) =>
        index !== editIndex &&
        office.email &&
        office.email.toLowerCase() === editData.email.toLowerCase()
      );

      if (emailExists) {
        setEditError("An office with this email already exists");
        return;
      }
    } else {
      if (!isValidUsername(normalizedUsername)) {
        setEditError("Invalid username format");
        return;
      }

      const usernameExists = offices.some((office, index) =>
        index !== editIndex &&
        office.username &&
        office.username.toLowerCase() === normalizedUsername
      );

      if (usernameExists) {
        setEditError("An office with this username already exists");
        return;
      }
    }
    
    setEditLoading(true);
    setEditError("");
    
    try {
      const originalOffice = offices[editIndex];
      const updatedOffice = {
        id: editData.id,
        name: editData.name,
        officialName: editData.officialName,
        username: editData.role === "super" ? "" : normalizedUsername,
        email:
          editData.role === "super"
            ? editData.email
            : "",
        role: editData.role, // Keep original role (super or office)
        passwordChanged: editData.passwordChanged === true,
        passwordChangedAt: editData.passwordChangedAt || null,
        purposes: editData.purposes,
        staffToVisit: editData.staffToVisit,
        createdAt: originalOffice.createdAt
      };
      
      // Update local state immediately
      const updatedOffices = [...offices];
      updatedOffices[editIndex] = updatedOffice;
      setOffices(prioritizeSuperAdmins(updatedOffices));
      closeEditModal();
      
      showNotification(`Office "${editData.name}" updated successfully!`, {
        title: "Office Updated",
        tone: "success",
      });
      
      // Save to Firestore in background
      setTimeout(async () => {
        try {
          await updateOffice(updatedOffice);
        } catch (err) {
          const revertedOffices = [...offices];
          revertedOffices[editIndex] = originalOffice;
          setOffices(prioritizeSuperAdmins(revertedOffices));
          showNotification(
            `Warning: Changes to "${editData.name}" were reverted due to database error: ${err.message}`,
            {
              title: "Background Update Failed",
              tone: "warning",
            }
          );
        } finally {
          setEditLoading(false);
        }
      }, 0);
      
    } catch (err) {
      setEditError(`Failed to update office: ${err.message}`);
      setEditLoading(false);
    }
  }, [
    closeEditModal,
    editIndex,
    editData,
    editBaseline,
    findStaffConflictInOtherOffices,
    hasEditChanges,
    openDuplicateStaffModal,
    offices,
    showNotification,
  ]);

  // ðŸ”¹ OPTIMIZED: Confirm delete - Update local state immediately
  const confirmDelete = useCallback(async () => {
    if (deleteIndex === null || !deleteConfirmed) return;
    
    const officeToDelete = offices[deleteIndex];
    if (!officeToDelete || !officeToDelete.id) return;
    
    // ðŸ”¹ PREVENT deleting super admin
    if (officeToDelete.role === "super") {
      showNotification("Super Admin accounts cannot be deleted. This account is protected.", {
        title: "Protected Account",
        tone: "warning",
      });
      setDeleteIndex(null);
      setDeleteConfirmed(false);
      return;
    }
    
    const originalOffice = officeToDelete;
    setDeleteLoading(true);
    
    try {
      // Update local state immediately
      const updatedOffices = offices.filter((_, i) => i !== deleteIndex);
      setOffices(prioritizeSuperAdmins(updatedOffices));
      setDeleteIndex(null);
      setDeleteConfirmed(false);
      
      showNotification(`Office "${officeToDelete.name}" deleted successfully!`, {
        title: "Office Deleted",
        tone: "success",
      });
      
      // Delete from Firestore in background
      setTimeout(async () => {
        try {
          await deleteOffice(officeToDelete.id);
        } catch (err) {
          setOffices((prev) => prioritizeSuperAdmins([...prev, originalOffice]));
          showNotification(
            `Warning: "${officeToDelete.name}" was restored due to database error: ${err.message}`,
            {
              title: "Background Delete Failed",
              tone: "warning",
            }
          );
        } finally {
          setDeleteLoading(false);
        }
      }, 0);
      
    } catch (err) {
      showNotification(`Failed to delete office: ${err.message}`, {
        title: "Delete Failed",
        tone: "error",
      });
      setDeleteLoading(false);
    }
  }, [deleteIndex, deleteConfirmed, offices, showNotification]);

  const formatResetRequestTime = useCallback((value) => {
    if (!value) return "Unknown time";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "Unknown time";
    return parsed.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="rounded-xl p-6 bg-white text-black border border-[#5B2D8B] dark:border-purple-600 dark:bg-gray-800 dark:text-gray-200">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <h3 className="text-2xl font-bold mb-2">Office Accounts</h3>
            <p className="text-black/80 dark:text-gray-400">
              {loading ? "Loading..." : `${offices.length} office${offices.length !== 1 ? 's' : ''} registered`}
              {offices.some(o => o.role === "super") && " (Super Admin protected)"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-purple-800 text-white hover:bg-purple-700 px-5 py-2.5 rounded-lg flex items-center gap-2 transition-all duration-200 font-medium shadow-lg hover:shadow-xl"
              disabled={loading}
            >
              <Plus size={18} />
              Add Office
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl p-6 bg-white text-black border border-[#5B2D8B] dark:border-purple-600 dark:bg-gray-800 dark:text-gray-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-xl font-bold">Pending Password Reset Requests</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Office admins submit username-based requests here for super admin approval. Unapproved
              requests auto-expire after 15 minutes and are archived from active notifications.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadPendingResetRequests({ showLoader: true })}
            className="px-3 py-2 rounded-lg bg-purple-100 text-purple-800 hover:bg-purple-200 text-sm font-semibold transition"
            disabled={resetRequestsLoading}
          >
            {resetRequestsLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {resetRequestsLoading ? (
            <p className="text-sm text-gray-500">Loading reset requests...</p>
          ) : resetRequests.length === 0 ? (
            <p className="text-sm text-gray-500">No pending reset requests.</p>
          ) : (
            resetRequests.map((request) => (
              <div
                key={request.id}
                className="p-4 rounded-xl border border-gray-200 bg-gray-50 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div>
                  <p className="font-semibold text-gray-800">
                    {request.officeName || "Office"} ({request.username || "N/A"})
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    Requested: {formatResetRequestTime(request.requestedAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => requestResetRequestConfirmation(request.id, "reject")}
                    disabled={resetRequestActionId === request.id}
                    className="px-4 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-100 text-sm font-semibold disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => requestResetRequestConfirmation(request.id, "approve")}
                    disabled={resetRequestActionId === request.id}
                    className="px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {resetRequestActionId === request.id ? "Processing..." : "Approve & Generate Link"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="text-red-500 mr-3" size={20} />
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-[#7400EA] border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading offices...</p>
        </div>
      ) : offices.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50">
          <div className="w-16 h-16 bg-gradient-to-r from-[#7400EA]/10 to-[#5B2D8B]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Hash className="text-[#7400EA]" size={28} />
          </div>
          <h4 className="text-lg font-medium text-gray-700 mb-2">No offices found</h4>
          <p className="text-gray-500 mb-6">Add your first office account to get started</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-[#7400EA] to-[#5B2D8B] hover:from-[#5B2D8B] hover:to-[#4a2470] text-white px-5 py-2.5 rounded-lg transition-all duration-200 font-medium shadow-md hover:shadow-lg"
          >
            <Plus size={18} />
            Add Office
          </button>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {offices.map((office, index) => (
            <OfficeCard 
              key={office.id}
              office={office}
              index={index}
              onEdit={openEditModal}
              onDelete={setDeleteIndex}
            />
          ))}
        </div>
      )}

      {/* ðŸ”¹ ADD MODAL */}
      <AddOfficeModal 
        show={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={saveAddOffice}
        data={addData}
        onDataChange={setAddData}
        onNameChange={handleAddOfficeNameChange}
        onUsernameChange={handleAddUsernameChange}
        suggestedUsername={suggestedAddUsername}
        onUseSuggestedUsername={handleUseSuggestedAddUsername}
        newPurpose={newPurpose}
        onNewPurposeChange={handleAddPurposeInput}
        newStaff={newStaff}
        onNewStaffChange={handleAddStaffInput}
        existingStaffLookup={existingStaffLookup}
        onDuplicateStaff={openDuplicateStaffModal}
        error={addError}
        loading={addLoading}
      />

      {/* ðŸ”¹ EDIT MODAL */}
      {editIndex !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className={`sticky top-0 bg-gradient-to-r text-white px-8 py-6 ${
              editData.role === "super" 
                ? "from-purple-600 to-purple-700" 
                : "from-purple-600 to-purple-700"
            }`}>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                    {editData.role === "super" ? (
                      <Shield size={24} />
                    ) : (
                      <Pencil size={24} />
                    )}
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">
                      {editData.role === "super" ? "Edit Super Admin" : "Edit Office"}
                    </h3>
                    <p className="text-white/80 text-sm mt-1">
                      {editData.role === "super" 
                        ? "Update Super Admin account details" 
                        : "Update office details and preferences"}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={closeEditModal}
                  className="p-2 hover:bg-white/10 rounded-xl transition-all"
                >
                  <X className="text-white" size={24} />
                </button>
              </div>
            </div>
            
            <div ref={editModalScrollRef} className="p-8 overflow-y-auto max-h-[calc(90vh-120px)]">
              {editError && (
                <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="text-red-500" size={20} />
                    <p className="text-red-700 text-sm">{editError}</p>
                  </div>
                </div>
              )}
              
              {/* Super Admin Warning */}
              {editData.role === "super" && (
                <div className="mb-6 p-4 bg-purple-50 border-l-4 border-purple-500 rounded-r-lg">
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-purple-800 mb-1">
                        Super Admin Account (Protected)
                      </p>
                      <p className="text-sm text-purple-700">
                        This is a protected Super Admin account. You can edit its details but cannot delete it or change its role.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="space-y-8">
                {/* Basic Information */}
                <div className={`rounded-2xl p-6 ${
                  editData.role === "super" ? "bg-purple-50" : "bg-purple-50"
                }`}>
                  <div className="flex items-center gap-3 mb-6">
                    <div className={`p-2 rounded-lg ${
                      editData.role === "super" ? "bg-purple-100" : "bg-purple-100"
                    }`}>
                      {editData.role === "super" ? (
                        <Shield className="w-5 h-5 text-purple-600" />
                      ) : (
                        <Building className="w-5 h-5 text-purple-600" />
                      )}
                    </div>
                    <h4 className="text-lg font-semibold text-gray-800">
                      {editData.role === "super" ? "Super Admin Details" : "Office Details"}
                    </h4>
                  </div>
                  
                  <div className="space-y-6">
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-3">
                        {editData.role === "super" ? "Super Admin Name" : "Office Name (e,g: SDS, Registrar, etc.)"}
                      </label>
                      <div className="relative">
                        <input
                          value={editData.name || ""}
                          onChange={(e) => handleEditNameChange(e.target.value)}
                          className={`w-full px-4 py-3 bg-white border rounded-xl focus:ring-2 transition-all uppercase ${
                            editData.role === "super" 
                              ? "border-purple-300 focus:border-purple-500 focus:ring-purple-500/20" 
                              : "border-purple-300 focus:border-purple-500 focus:ring-purple-500/20"
                          }`}
                          disabled={editLoading}
                          style={{ textTransform: 'uppercase' }}
                        />
                        <div className="absolute right-3 top-3">
                          <span className={`text-xs px-2 py-1 rounded ${
                            editData.role === "super" 
                              ? "bg-purple-100 text-purple-600" 
                              : "bg-purple-100 text-purple-600"
                          }`}>
                            UPPERCASE
                          </span>
                        </div>
                      </div>
                      <div className="mt-4">
                        {editData.role === "super" ? (
                          <>
                            <label className="text-sm font-medium text-gray-700 block mb-2">
                              Email <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="email"
                              value={editData.email}
                              onChange={(e) =>
                                setEditData((prev) => ({ ...prev, email: e.target.value.toLowerCase() }))
                              }
                              className="w-full px-4 py-3 border rounded-xl border-purple-300 focus:border-purple-500"
                              disabled={editLoading}
                            />
                          </>
                        ) : (
                          <>
                            <label className="text-sm font-medium text-gray-700 block mb-2">
                              Username <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={editData.username || ""}
                              onChange={(e) =>
                                setEditData((prev) => ({
                                  ...prev,
                                  username: normalizeUsername(e.target.value),
                                }))
                              }
                              className="w-full px-4 py-3 border rounded-xl border-purple-300 focus:border-purple-500"
                              disabled={editLoading}
                            />
                            <p className="mt-1 text-xs text-gray-500">
                              Login uses username only. No email is required for office admins.
                            </p>
                          </>
                        )}
                      </div>

                      {editData.role !== "super" && (
                        <div className="mt-4 p-4 rounded-xl border border-amber-200 bg-amber-50">
                          <p className="text-sm font-medium text-amber-900">
                            Password Recovery
                          </p>
                          <p className="text-xs text-amber-800 mt-1">
                            If this office admin forgot the password, Super Admin can set a new password directly.
                          </p>
                          <button
                            type="button"
                            onClick={handleOpenAdminPasswordReset}
                            disabled={editLoading || resetPasswordLoading}
                            className="mt-3 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Change Password
                          </button>

                          {showResetPasswordFields && (
                            <div className="mt-3 p-3 rounded-lg border border-amber-300 bg-white">
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                New Password
                              </label>
                              <div className="relative">
                                <input
                                  type={resetPasswordVisibility.newPassword ? "text" : "password"}
                                  value={resetPasswordForm.newPassword}
                                  onChange={(e) =>
                                    handleResetPasswordFieldChange("newPassword", e.target.value)
                                  }
                                  className="w-full px-3 py-2 pr-10 border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                                  placeholder="Enter new password (min 8 chars)"
                                  disabled={editLoading || resetPasswordLoading}
                                />
                                <button
                                  type="button"
                                  onClick={() => toggleResetPasswordVisibility("newPassword")}
                                  disabled={editLoading || resetPasswordLoading}
                                  className="absolute inset-y-0 right-2 flex items-center text-amber-700 hover:text-amber-900 disabled:opacity-50"
                                  aria-label={
                                    resetPasswordVisibility.newPassword
                                      ? "Hide new password"
                                      : "Show new password"
                                  }
                                >
                                  {resetPasswordVisibility.newPassword ? (
                                    <EyeOff size={16} />
                                  ) : (
                                    <Eye size={16} />
                                  )}
                                </button>
                              </div>

                              <label className="block text-xs font-medium text-gray-700 mt-3 mb-1">
                                Confirm New Password
                              </label>
                              <div className="relative">
                                <input
                                  type={resetPasswordVisibility.confirmPassword ? "text" : "password"}
                                  value={resetPasswordForm.confirmPassword}
                                  onChange={(e) =>
                                    handleResetPasswordFieldChange("confirmPassword", e.target.value)
                                  }
                                  className="w-full px-3 py-2 pr-10 border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                                  placeholder="Re-enter new password"
                                  disabled={editLoading || resetPasswordLoading}
                                />
                                <button
                                  type="button"
                                  onClick={() => toggleResetPasswordVisibility("confirmPassword")}
                                  disabled={editLoading || resetPasswordLoading}
                                  className="absolute inset-y-0 right-2 flex items-center text-amber-700 hover:text-amber-900 disabled:opacity-50"
                                  aria-label={
                                    resetPasswordVisibility.confirmPassword
                                      ? "Hide confirm password"
                                      : "Show confirm password"
                                  }
                                >
                                  {resetPasswordVisibility.confirmPassword ? (
                                    <EyeOff size={16} />
                                  ) : (
                                    <Eye size={16} />
                                  )}
                                </button>
                              </div>

                              {resetPasswordError && (
                                <p className="mt-2 text-xs text-red-600">{resetPasswordError}</p>
                              )}

                              {resetPasswordSuccess && (
                                <div className="mt-2 p-2 rounded-md border border-green-300 bg-green-50">
                                  <p className="text-xs font-semibold text-green-700">
                                    Password updated successfully.
                                  </p>
                                  <p className="mt-1 text-xs text-green-800">
                                    Office: {resetPasswordSuccess.officeName}
                                  </p>
                                  <p className="text-xs text-green-800">
                                    Login Username: {resetPasswordSuccess.loginUsername}
                                  </p>
                                  <p className="text-xs text-green-800">
                                    New Password:{" "}
                                    <span className="font-mono">{resetPasswordSuccess.newPassword}</span>
                                  </p>
                                </div>
                              )}

                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={handleUseSuggestedPassword}
                                  disabled={editLoading || resetPasswordLoading}
                                  className="px-3 py-2 text-xs font-medium text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Use Suggested Password
                                </button>
                                <button
                                  type="button"
                                  onClick={handleAdminPasswordReset}
                                  disabled={editLoading || resetPasswordLoading}
                                  className="px-3 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {resetPasswordLoading ? "Updating..." : "Update Password"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowResetPasswordFields(false);
                                    setResetPasswordForm({
                                      newPassword: "",
                                      confirmPassword: "",
                                    });
                                    setResetPasswordVisibility({
                                      newPassword: false,
                                      confirmPassword: false,
                                    });
                                    setResetPasswordError("");
                                    setResetPasswordSuccess(null);
                                  }}
                                  disabled={editLoading || resetPasswordLoading}
                                  className="px-3 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-3">
                        {editData.role === "super" ? "Full Name / Title" : "Official Office Name"} <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          value={editData.officialName || ""}
                          onChange={(e) => setEditData(prev => ({ ...prev, officialName: e.target.value }))}
                          className={`w-full px-4 py-3 bg-white border rounded-xl focus:ring-2 ${
                            editData.role === "super" 
                              ? "border-purple-300 focus:border-purple-500 focus:ring-purple-500/20" 
                              : "border-purple-300 focus:border-purple-500 focus:ring-purple-500/20"
                          }`}
                          placeholder={editData.role === "super" ? "Enter full name or title" : "Enter official office name"}
                          disabled={editLoading}
                        />
                        <div className="absolute right-3 top-3">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Full Name</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* User Role - Show current role but cannot change */}
                <div className={`rounded-2xl p-6 ${
                  editData.role === "super" ? "bg-purple-50" : "bg-purple-50"
                }`}>
                  <div className="flex items-center gap-3 mb-6">
                    <div className={`p-2 rounded-lg ${
                      editData.role === "super" ? "bg-purple-100" : "bg-purple-100"
                    }`}>
                      {editData.role === "super" ? (
                        <Shield className="w-5 h-5 text-purple-600" />
                      ) : (
                        <Key className="w-5 h-5 text-purple-600" />
                      )}
                    </div>
                    <h4 className="text-lg font-semibold text-gray-800">Access Level</h4>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                      {/* Display current role - cannot be changed */}
                      <label className={`relative overflow-hidden rounded-xl border-2 cursor-not-allowed ${
                        editData.role === "super" 
                          ? "border-purple-500 bg-gradient-to-r from-purple-50 to-purple-100" 
                          : "border-purple-500 bg-gradient-to-r from-purple-50 to-purple-100"
                      }`}>
                        <div className="p-5">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                editData.role === "super" ? "bg-purple-100" : "bg-purple-100"
                              }`}>
                                {editData.role === "super" ? (
                                  <Shield className="w-4 h-4 text-purple-600" />
                                ) : (
                                  <Building className="w-4 h-4 text-purple-600" />
                                )}
                              </div>
                              <div>
                                <span className="font-semibold text-gray-800">
                                  {editData.role === "super" ? "Super Admin" : "Office Admin"}
                                </span>
                                <p className="text-xs text-gray-500 mt-1">
                                  {editData.role === "super" 
                                    ? "Full system access and administration privileges" 
                                    : "Limited to specific office functions and data"}
                                </p>
                              </div>
                            </div>
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                              editData.role === "super" ? "bg-purple-500" : "bg-purple-500"
                            }`}>
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Purposes of Visit */}
                <div className={`rounded-2xl p-6 ${
                  editData.role === "super" ? "bg-purple-50" : "bg-purple-50"
                }`}>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        editData.role === "super" ? "bg-purple-100" : "bg-purple-100"
                      }`}>
                        <Target className={`w-5 h-5 ${
                          editData.role === "super" ? "text-purple-600" : "text-purple-600"
                        }`} />
                      </div>
                      <div>
                        <h4 className="text-lg font-semibold text-gray-800">Visit Purposes</h4>
                        <p className="text-sm text-gray-500">What visitors can select when visiting</p>
                      </div>
                    </div>
                    <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                      editData.role === "super" 
                        ? "bg-purple-100 text-purple-600" 
                        : "bg-purple-100 text-purple-600"
                    }`}>
                      {editData.purposes.length} added
                    </span>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={editNewPurpose}
                          onChange={(e) => handleEditPurposeInput(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && addPurposeToEditList()}
                          className={`w-full px-4 py-3 bg-white border rounded-xl focus:ring-2 transition-all uppercase ${
                            editData.role === "super" 
                              ? "border-purple-300 focus:border-purple-500 focus:ring-purple-500/20" 
                              : "border-purple-300 focus:border-purple-500 focus:ring-purple-500/20"
                          }`}
                          placeholder="Add a purpose"
                          disabled={editLoading}
                          style={{ textTransform: 'uppercase' }}
                        />
                        <div className="absolute right-3 top-3">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">UPPERCASE</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={addPurposeToEditList}
                        disabled={editLoading || !editNewPurpose.trim()}
                        className={`px-6 py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium ${
                          editData.role === "super"
                            ? "bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
                            : "bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
                        } text-white`}
                      >
                        <Plus size={18} />
                        Add
                      </button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      {editData.purposes.map((purpose) => (
                        <div 
                          key={purpose.id} 
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all hover:scale-[1.02] ${
                            editData.role === "super"
                              ? "bg-gradient-to-r from-purple-50 to-purple-100 text-purple-700"
                              : "bg-gradient-to-r from-purple-50 to-purple-100 text-purple-700"
                          }`}
                        >
                          <Target size={14} className="flex-shrink-0" />
                          <span className="font-medium">{purpose.name}</span>
                          <button
                            type="button"
                            onClick={() => removePurposeFromEditList(purpose.id)}
                            className={`ml-1 transition-colors ${
                              editData.role === "super"
                                ? "text-purple-400 hover:text-purple-600"
                                : "text-purple-400 hover:text-purple-600"
                            }`}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Staff/Instructors to Visit */}
                <div className={`rounded-2xl p-6 ${
                  editData.role === "super" ? "bg-purple-50" : "bg-purple-50"
                }`}>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        editData.role === "super" ? "bg-purple-100" : "bg-purple-100"
                      }`}>
                        <UserPlus className={`w-5 h-5 ${
                          editData.role === "super" ? "text-purple-600" : "text-purple-600"
                        }`} />
                      </div>
                      <div>
                        <h4 className="text-lg font-semibold text-gray-800">Staff & Instructors</h4>
                        <p className="text-sm text-gray-500">Who visitors can request to meet</p>
                      </div>
                    </div>
                    <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                      editData.role === "super" 
                        ? "bg-purple-100 text-purple-600" 
                        : "bg-purple-100 text-purple-600"
                    }`}>
                      {editData.staffToVisit.length} added
                    </span>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={editNewStaff}
                          onChange={(e) => handleEditStaffInput(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && addStaffToEditList()}
                          className={`w-full px-4 py-3 bg-white border rounded-xl focus:ring-2 transition-all uppercase ${
                            editData.role === "super" 
                              ? "border-purple-300 focus:border-purple-500 focus:ring-purple-500/20" 
                              : "border-purple-300 focus:border-purple-500 focus:ring-purple-500/20"
                          }`}
                          placeholder="Add staff/instructor name"
                          disabled={editLoading}
                          style={{ textTransform: 'uppercase' }}
                        />
                        <div className="absolute right-3 top-3">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">UPPERCASE</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={addStaffToEditList}
                        disabled={editLoading || !editNewStaff.trim()}
                        className={`px-6 py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium ${
                          editData.role === "super"
                            ? "bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
                            : "bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
                        } text-white`}
                      >
                        <Plus size={18} />
                        Add
                      </button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      {editData.staffToVisit.map((staff) => (
                        <div 
                          key={staff.id} 
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all hover:scale-[1.02] ${
                            editData.role === "super"
                              ? "bg-gradient-to-r from-purple-50 to-purple-100 text-purple-700"
                              : "bg-gradient-to-r from-purple-50 to-purple-100 text-purple-700"
                          }`}
                        >
                          <UserPlus size={14} className="flex-shrink-0" />
                          <span className="font-medium">{staff.name}</span>
                          <button
                            type="button"
                            onClick={() => removeStaffFromEditList(staff.id)}
                            className={`ml-1 transition-colors ${
                              editData.role === "super"
                                ? "text-purple-400 hover:text-purple-600"
                                : "text-purple-400 hover:text-purple-600"
                            }`}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action Button */}
                <div className="pt-6 border-t border-gray-200">
                  <div
                    className={`mb-4 p-3 rounded-lg border ${
                      hasEditChanges
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : "bg-gray-50 border-gray-200 text-gray-700"
                    }`}
                  >
                    <p className="text-sm font-medium">
                      {hasEditChanges
                        ? "Unsaved changes detected. Click Update to save."
                        : "No changes yet. Update is enabled after you edit office information."}
                    </p>
                  </div>
                  <button 
                    onClick={saveEdit} 
                    disabled={editLoading || !hasEditChanges}
                    className={`w-full py-4 rounded-xl transition-all duration-300 font-semibold text-lg shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed group ${
                      editData.role === "super"
                        ? "bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800"
                        : "bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800"
                    } text-white`}
                  >
                    {editLoading ? (
                      <span className="flex items-center justify-center gap-3">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>
                        Saving Changes...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-3">
                        <Check size={20} />
                        {editData.role === "super" ? "UPDATE SUPER ADMIN" : "UPDATE OFFICE"}
                        <svg className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ðŸ”¹ DELETE MODAL */}
      {deleteIndex !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md overflow-hidden shadow-xl">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#7400EA]/10 to-[#5B2D8B]/10 p-6 text-center">
              <div className="mx-auto w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                <Trash2 className="text-[#7400EA]" size={28} />
              </div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">Delete Office Account</h3>
              <p className="text-gray-600">This action cannot be undone</p>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-center mb-3">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                    <span className="text-purple-600 font-bold text-lg">
                      {offices[deleteIndex]?.name?.charAt(0).toUpperCase() || "O"}
                    </span>
                  </div>
                  <div className="text-left">
                    <h4 className="font-semibold text-gray-800">{offices[deleteIndex]?.name}</h4>
                    <p className="text-sm text-gray-600">
                      {offices[deleteIndex]?.role === "super"
                        ? offices[deleteIndex]?.email
                        : offices[deleteIndex]?.username || offices[deleteIndex]?.email}
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-white p-2 rounded border text-center">
                    <div className="text-gray-500">Role</div>
                    <div className="font-medium">
                      <span className={`text-[10px] font-medium tracking-wider px-2 py-1 rounded-full border ${
                        offices[deleteIndex]?.role === "super" 
                          ? "bg-purple-50 text-purple-700 border-purple-200" 
                          : "bg-blue-50 text-blue-700 border-blue-200"
                      }`}>
                        {offices[deleteIndex]?.role === "super" ? "SUPER ADMIN" : "OFFICE ADMIN"}
                      </span>
                    </div>
                  </div>
                  <div className="bg-white p-2 rounded border text-center">
                    <div className="text-gray-500">Created</div>
                    <div className="font-medium">
                      {(() => {
                        const timestamp = offices[deleteIndex]?.createdAt;
                        if (!timestamp) return "Just now";
                        try {
                          let date;
                          if (timestamp.toDate && typeof timestamp.toDate === 'function') {
                            date = timestamp.toDate();
                          } else if (timestamp.seconds && typeof timestamp.seconds === 'number') {
                            date = new Date(timestamp.seconds * 1000);
                          } else if (timestamp instanceof Date) {
                            date = timestamp;
                          } else {
                            date = new Date(timestamp);
                          }
                          if (!date || isNaN(date.getTime())) return "Just now";
                          return date.toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          });
                        } catch {
                          return "Just now";
                        }
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Warning Message - Special message for super admin */}
              {offices[deleteIndex]?.role === "super" ? (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
                  <div className="flex items-start">
                    <Shield className="w-5 h-5 text-purple-600 mt-0.5 mr-2 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-purple-800 mb-1">Super Admin Protected</p>
                      <p className="text-sm text-purple-700">
                        Super Admin accounts cannot be deleted from this interface. 
                        This account is protected and required for system administration.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
                  <div className="flex items-start">
                    <AlertTriangle className="w-5 h-5 text-purple-600 mt-0.5 mr-2 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-purple-800 mb-1">Important Warning</p>
                      <p className="text-sm text-purple-700">
                        All data associated with this office account will be permanently deleted. 
                        This includes any documents, files, or records created by this user.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Extra Confirmation for Safety - Only show for non-super admin */}
              {offices[deleteIndex]?.role !== "super" && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <label className="flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={deleteConfirmed}
                      onChange={(e) => setDeleteConfirmed(e.target.checked)}
                      className="h-5 w-5 text-purple-600 rounded border-gray-300 mr-3 focus:ring-purple-500 focus:ring-offset-0"
                    />
                    <div>
                      <p className="font-medium text-gray-800">I confirm I want to delete this account</p>
                      <p className="text-sm text-gray-600 mt-1">
                        I understand this action is permanent and cannot be undone
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    setDeleteIndex(null);
                    setDeleteConfirmed(false);
                  }}
                  className="flex-1 px-4 py-3 border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-lg transition duration-200 flex items-center justify-center gap-2"
                  disabled={deleteLoading}
                >
                  <X size={18} />
                  Cancel
                </button>
                
                {offices[deleteIndex]?.role === "super" ? (
                  <button 
                    onClick={() => {
                      showNotification("Super Admin accounts cannot be deleted. This account is protected.", {
                        title: "Protected Account",
                        tone: "warning",
                      });
                      setDeleteIndex(null);
                      setDeleteConfirmed(false);
                    }}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-medium rounded-lg transition duration-200 flex items-center justify-center gap-2 cursor-not-allowed opacity-50"
                  >
                    <Shield size={18} />
                    Protected
                  </button>
                ) : (
                  <button 
                    onClick={confirmDelete} 
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-[#7400EA] to-[#5B2D8B] hover:from-[#5B2D8B] hover:to-[#4A2470] text-white font-medium rounded-lg transition duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={deleteLoading || !deleteConfirmed}
                  >
                    {deleteLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 size={18} />
                        Delete Account
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
           </div>
        </div>
      )}

      <ConfirmationModal
        show={resetRequestConfirmation.show}
        title={
          resetRequestConfirmation.action === "approve"
            ? "Approve Password Reset Request"
            : "Reject Password Reset Request"
        }
        message={
          resetRequestConfirmation.action === "approve"
            ? "Approve this request? A one-time reset link will be generated."
            : "Reject this password reset request?"
        }
        tone={resetRequestConfirmation.action === "approve" ? "warning" : "danger"}
        confirmLabel={resetRequestConfirmation.action === "approve" ? "Approve" : "Reject"}
        cancelLabel="Cancel"
        loading={Boolean(resetRequestActionId)}
        onConfirm={confirmResolveResetRequest}
        onCancel={closeResetRequestConfirmation}
      />

      <DuplicateStaffModal
        show={duplicateStaffModal.show}
        staffName={duplicateStaffModal.staffName}
        officeName={duplicateStaffModal.officeName}
        onClose={closeDuplicateStaffModal}
      />

      <NotificationModal
        show={notificationModal.show}
        title={notificationModal.title}
        message={notificationModal.message}
        tone={notificationModal.tone}
        onClose={closeNotification}
      />
    </div>
  );
};
 
export default Offices;
