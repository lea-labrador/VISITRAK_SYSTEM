import React, { useState } from "react";
import logo from "../assets/visitrakLogo.png";
import { LogOut, ChevronLeft, ChevronRight } from "lucide-react";

const Sidebar = ({
  menu,
  activeTab,
  setActiveTab,
  darkMode,
  setShowConfirm,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`
        relative h-full flex flex-col justify-between p-5
        transition-all duration-300
        ${collapsed ? "w-20" : "w-64"}
        ${
          darkMode
            ? "bg-[#1f1f1f] text-gray-100 border-r border-gray-700"
            : "bg-gray-50 text-gray-800 border-r border-gray-200"
        }
      `}
    >
      {/* FLOATING TOGGLE BUTTON */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={`
          absolute top-6 -right-4 z-50
          w-9 h-9 rounded-full
          flex items-center justify-center
          shadow-lg transition
          ${
            darkMode
              ? "bg-gray-800 text-white border border-gray-600 hover:bg-gray-700"
              : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-100"
          }
        `}
      >
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>

      {/* TOP SECTION */}
      <div>
        <div className="flex items-center gap-3 mb-6">
          <img src={logo} alt="VisiTrak" className="w-10 h-10" />
          {!collapsed && (
            <h2 className="text-2xl font-bold text-[#491D76] dark:text-white">
              VisiTrak
            </h2>
          )}
        </div>

        {/* MENU SECTIONS */}
        <Section
          title="Overview"
          tabs={menu.overview}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          collapsed={collapsed}
        />
        <Section
          title="Management"
          tabs={menu.management}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          collapsed={collapsed}
        />
        <Section
          title="Feedback"
          tabs={menu.feedback}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          collapsed={collapsed}
        />
      </div>

      {/* LOGOUT BUTTON */}
      <button
        onClick={() => setShowConfirm(true)}
        className={`
          group relative
          w-full flex items-center justify-center
          rounded-2xl border border-purple-700
          bg-[#f7f4fb] text-purple-800
          hover:bg-purple-100 transition
          dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-700
          ${collapsed ? "h-16" : "px-4 py-3"}
        `}
      >
        <LogOut
          size={collapsed ? 25 : 22}
          strokeWidth={collapsed ? 2.8 : 2.2}
        />
        {!collapsed && <span className="ml-3 font-medium">Logout</span>}

        {collapsed && <Tooltip label="Logout" />}
      </button>
    </aside>
  );
};

const Section = ({
  title,
  tabs,
  activeTab,
  setActiveTab,
  collapsed,
}) => {
  const filteredTabs = (tabs || []).filter((tab) => tab !== "notifications");

  if (filteredTabs.length === 0) {
    return null;
  }

  return (
    <div className="mb-4">
      {!collapsed && (
        <h4 className="text-sm font-semibold mb-2 uppercase">
          {title}
        </h4>
      )}

      <ul className="space-y-2">
        {filteredTabs.map((tab) => (
          <li
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              group relative
              cursor-pointer rounded-md px-3 py-2
              transition-colors flex items-center gap-3
              justify-center ${!collapsed && "justify-start"}
              ${
                activeTab === tab
                  ? "bg-[#491D76] text-white"
                  : "hover:bg-[#A37ECA] dark:hover:bg-gray-700"
              }
            `}
          >
            {tab === "dashboard" && "📊"}
            {tab === "analytics" && "📈"}
            {tab === "visitors" && "👥"}
            {tab === "offices" && "🏢"}
            {tab === "feedback" && "💬"}

            {!collapsed && (
              <span className="capitalize">{tab}</span>
            )}

            {collapsed && <Tooltip label={tab} />}
          </li>
        ))}
      </ul>
    </div>
  );
};

const Tooltip = ({ label }) => {
  const formattedLabel =
    label.charAt(0).toUpperCase() + label.slice(1);

  return (
    <span
      className="
        absolute left-full ml-3
        px-3 py-1
        text-sm whitespace-nowrap
        rounded-md shadow-lg
        bg-gray-900 text-white
        dark:bg-gray-700
        opacity-0 group-hover:opacity-100
        transition
        pointer-events-none
      "
    >
      {formattedLabel}
    </span>
  );
};


export default Sidebar;
