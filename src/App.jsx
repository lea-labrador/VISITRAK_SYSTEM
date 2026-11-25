import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";

import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import EncoderPage from "./pages/EncoderPage";
import { auth, authPersistenceReady } from "./lib/firebase";
import { clearStoredSession, setStoredUser } from "./lib/sessionStorage";
import {
  buildSessionUser,
  getOfficeProfileForAuthUser,
} from "./lib/userProfile.services";

import "./App.css";

const BackButtonManager = ({ user }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const guardTimeoutRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const ensureGuardState = (targetUrl) => {
      if (!window.history.state || !window.history.state.guard) {
        window.history.pushState(
          { guard: true },
          "",
          targetUrl || window.location.href
        );
      }
    };

    if (user) {
      ensureGuardState("/dashboard");
      return;
    }

    if (location.pathname === "/" || location.pathname === "/login") {
      ensureGuardState();
    }
  }, [user, location.pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const attemptCloseWindow = () => {
      window.close();
    };

    const handlePopState = () => {
      const path = window.location.pathname;

      if (user) {
        window.dispatchEvent(new CustomEvent("visitrak:logout-request"));
        if (path !== "/dashboard") {
          navigate("/dashboard", { replace: true });
        }
        if (guardTimeoutRef.current) {
          clearTimeout(guardTimeoutRef.current);
        }
        guardTimeoutRef.current = setTimeout(() => {
          window.history.pushState({ guard: true }, "", "/dashboard");
        }, 0);
        return;
      }

      if (path === "/" || path === "/login") {
        attemptCloseWindow();
        window.history.pushState({ guard: true }, "", window.location.href);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (guardTimeoutRef.current) {
        clearTimeout(guardTimeoutRef.current);
      }
    };
  }, [user, navigate]);

  return null;
};

function App() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let unsub = () => { };
    let disposed = false;

    authPersistenceReady.finally(() => {
      if (disposed) return;

      unsub = onAuthStateChanged(auth, async (authUser) => {
        try {
          if (!authUser) {
            setUser(null);
            clearStoredSession();
            setIsLoading(false);
            return;
          }

          // Helpers opening /encode sign in anonymously. They are not office
          // accounts, so never sign them out or load a dashboard profile for them.
          if (authUser.isAnonymous) {
            setUser(null);
            setIsLoading(false);
            return;
          }

          const officeProfile = await getOfficeProfileForAuthUser(authUser);
          if (!officeProfile) {
            // Signed-in user without profile should not access dashboard.
            await signOut(auth);
            setUser(null);
            clearStoredSession();
            setIsLoading(false);
            return;
          }

          const userData = buildSessionUser(authUser, officeProfile);
          setUser(userData);
          setStoredUser(userData);
        } catch {
          setUser(null);
          clearStoredSession();
        } finally {
          setIsLoading(false);
        }
      });
    });

    return () => {
      disposed = true;
      unsub();
    };
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    setStoredUser(userData);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch {
      // ignore errors on sign-out
    } finally {
      setUser(null);
      clearStoredSession();
    }
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <Router>
      <BackButtonManager user={user} />
      <Routes>
        <Route
          path="/"
          element={user ? <Navigate to="/dashboard" replace /> : <Login onLogin={handleLogin} />}
        />
        <Route
          path="/login"
          element={user ? <Navigate to="/dashboard" replace /> : <Navigate to="/" replace />}
        />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/encode" element={<EncoderPage />} />

        <Route
          path="/dashboard"
          element={
            user ? (
              <Dashboard user={user} onLogout={handleLogout} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;