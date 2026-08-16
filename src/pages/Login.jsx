// pages/Login.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import {
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth, authPersistenceReady, db } from "../lib/firebase";
import { clearStoredSession, getStoredUser, setStoredUser } from "../lib/sessionStorage";
import {
  buildSessionUser,
  getOfficeProfileForAuthUser,
} from "../lib/userProfile.services";
import bisuLogo from "../assets/bisulogo.png";
import masidLogo from "../assets/visitrak_logoChar.png";
import emailIcon from "../assets/email.png";
import passwordIcon from "../assets/password.png";
import eyeOpen from "../assets/eye_open.png";
import eyeClosed from "../assets/eye_closed.png";
import illustrator from "../assets/illustrator.png";
import bgImage from "../assets/BG12.png";
import InputField from "../components/InputField";
import RememberForgot from "../components/RememberForgot";

const Login = ({ onLogin }) => {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modalState, setModalState] = useState({
    isOpen: false,
    title: "",
    message: "",
  });
  const navigate = useNavigate(); 

  const showModal = (title, message) => {
    setModalState({ isOpen: true, title, message });
  };

  // Load remembered identifier only (never password).
  useEffect(() => {
    const rememberedIdentifier =
      localStorage.getItem("rememberedIdentifier") ||
      localStorage.getItem("rememberedEmail");

    if (rememberedIdentifier) {
      setIdentifier(rememberedIdentifier);
      setRememberMe(true);
      return;
    }

    // Backward compatibility for previous user storage.
    const savedUser = getStoredUser();
    if (!savedUser) return;

    try {
      const parsed = JSON.parse(savedUser);
      if (parsed?.loginIdentifier) {
        setIdentifier(parsed.loginIdentifier);
      } else if (parsed?.username) {
        setIdentifier(parsed.username);
      } else if (parsed?.email) {
        setIdentifier(parsed.email);
      }
    } catch  {
      clearStoredSession();
    }
  }, []);

  const createActivityLog = async (userData, action) => {
    try {
      const logData = {
        title: "User Login",
        description: `${userData.name} logged into the system`,
        office: userData.office,
        userId: userData.uid || userData.id,
        userEmail: userData.email,
        userRole: userData.role,
        action,
        timestamp: serverTimestamp(),
        type: "login",
      };

      await addDoc(collection(db, "activityLogs"), logData);
    } catch  {
      // Activity logging should never block a valid login.
    }
  };

  const handleForgotPassword = () => {
    navigate("/forgot-password");
  };

  const restoreSuperAdminProfile = async (authUser) => {
    const token = await authUser.getIdToken();
    const response = await fetch("/api/ensure-super-admin-profile", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      // Use the generic fallback below.
    }

    if (!response.ok || payload.success === false) {
      throw new Error(
        payload.message ||
          "Account profile not found in Firestore. Contact your administrator."
      );
    }

    await authUser.getIdToken(true);
  };

  const handleLoginClick = async (e) => {
    e?.preventDefault();
    if (!identifier || !password) {
      showModal("Missing information", "Please enter username/email and password.");
      return;
    }

    setLoading(true);

    try {
      const normalizedIdentifier = identifier.trim().toLowerCase();
      const isEmailLogin = normalizedIdentifier.includes("@");
      await authPersistenceReady;

      let authResult = null;
      if (isEmailLogin) {
        authResult = await signInWithEmailAndPassword(
          auth,
          normalizedIdentifier,
          password
        );
      } else {
        const officeLoginResponse = await fetch("/api/office-login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: normalizedIdentifier,
            password,
          }),
        });

        let officeLoginPayload = {};
        try {
          officeLoginPayload = await officeLoginResponse.json();
        } catch {
          // Ignore parse failures and use fallback below.
        }

        if (!officeLoginResponse.ok || officeLoginPayload.success === false) {
          throw new Error(
            officeLoginPayload.message || "Invalid username/email or password."
          );
        }

        const customToken = String(officeLoginPayload.customToken || "");
        if (!customToken) {
          throw new Error("Invalid username/email or password.");
        }

        authResult = await signInWithCustomToken(auth, customToken);
      }

      const authUser = authResult.user;

      let officeProfile = await getOfficeProfileForAuthUser(authUser);
      if (!officeProfile && isEmailLogin) {
        await restoreSuperAdminProfile(authUser);
        officeProfile = await getOfficeProfileForAuthUser(authUser);
      }

      if (!officeProfile) {
        await signOut(auth);
        throw new Error(
          "Account profile not found in Firestore. Contact your administrator."
        );
      }

      if (officeProfile.status === "inactive") {
        await signOut(auth);
        throw new Error("Account is inactive. Please contact administrator.");
      }

      if (isEmailLogin && officeProfile.role === "office") {
        await signOut(auth);
        throw new Error("Office admins must log in using username.");
      }

      const userData = buildSessionUser(authUser, officeProfile);
      await createActivityLog(userData, "login");

      if (rememberMe) {
        localStorage.setItem("rememberedIdentifier", normalizedIdentifier);
        localStorage.removeItem("rememberedEmail");
      } else {
        localStorage.removeItem("rememberedIdentifier");
        localStorage.removeItem("rememberedEmail");
      }

      setStoredUser(userData);

      if (onLogin) {
        onLogin(userData);
      }

      navigate("/dashboard", { replace: true });
    } catch (error) {

      let errorMessage = "Login failed. Please try again.";
      if (error.code === "auth/invalid-credential") {
        errorMessage = "Invalid username/email or password.";
      } else if (error.code === "auth/user-disabled") {
        errorMessage = "This account is disabled.";
      } else if (error.code === "auth/too-many-requests") {
        errorMessage = "Too many attempts. Please try again later.";
      } else if (error.code === "auth/network-request-failed") {
        errorMessage = "Network error. Check your connection.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      showModal("Login failed", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex flex-col items-center justify-start min-h-screen pt-10 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${bgImage})` }}
    >
      {/* Logo Section */}
      <div className="flex flex-col items-center mb-6 mt-5">
        <div className="flex items-center justify-center gap-6 flex-wrap">
          <img src={bisuLogo} alt="BISU Logo" className="w-20" />
          <img src={masidLogo} alt="VisiTrak Logo" className="w-20" />
        </div>
        <p className="text-white text-3xl font-semibold mt-4 mb-5">Hello, Welcome!</p>
      </div>

      {/* Login + Illustration */}
      <div className="relative flex flex-col lg:flex-row items-center justify-center gap-10 w-full px-6">
        {/* Login Card */}
        <form
          onSubmit={handleLoginClick}
          className="bg-white shadow-xl rounded-2xl p-6 sm:p-8 w-[90%] sm:w-[400px] md:w-[450px] lg:w-[500px] text-center z-10 transition-all duration-300"
        >
          <h2 className="text-2xl font-bold text-purple-800 mb-2">LOGIN</h2>
          <p className="text-gray-500 mb-6 text-sm">
            Welcome back! Please login to admin dashboard
          </p>

          <InputField
            icon={emailIcon}
            type="text"
            placeholder="Email / Username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            disabled={loading}
          />

          <InputField
            icon={passwordIcon}
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            rightIcon={showPassword ? eyeOpen : eyeClosed}
            onRightIconClick={() => setShowPassword(!showPassword)}
            disabled={loading}
          />

          <RememberForgot
            rememberMe={rememberMe}
            onRememberChange={setRememberMe}
            onForgot={handleForgotPassword}
            disabled={loading}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-700 to-purple-900 text-white rounded-md h-12 mt-5 font-semibold hover:from-purple-800 hover:to-purple-950 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Logging in...
              </span>
            ) : "Login"}
          </button>

        </form>

        {/* Illustration */}
        <div className="lg:absolute lg:right-60 lg:top-[-100px] flex justify-center mt-6 lg:mt-0">
          <img
            src={illustrator}
            alt="Illustration"
            className="h-130 sm:h-140 lg:h-150 object-contain animate-bounce-slow"
          />
        </div>
      </div>

      {modalState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-xl font-semibold text-purple-800">
              {modalState.title}
            </h3>
            <p className="mt-3 text-gray-700">{modalState.message}</p>
            <button
              type="button"
              onClick={() =>
                setModalState({ isOpen: false, title: "", message: "" })
              }
              className="mt-5 w-full rounded-md bg-purple-800 px-4 py-2 font-semibold text-white transition hover:bg-purple-900"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
