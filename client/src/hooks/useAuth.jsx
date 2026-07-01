import {
  useEffect,
  useState
} from "react";

import {
  sendLoginEmailCode,
  loginUser,
  registerUser,
  sendAuthEmailCode,
  verifyAuthEmailCode,
  resetPasswordApi,
  deleteAccountApi,
  logoutCurrentSessionApi,
  getCurrentSessionApi
} from "../services/api";

import {
  initE2EEAccountIdentity
} from "../utils/e2ee";

import {
  clearApiRequestMemory,
  setApiAuthToken
} from "../utils/apiRequest";

import {
  resetAppBootstrapGuard
} from "./app/useAppInitialization";

export default function useAuth({
  showToast
}) {

  const [username, setUsername] =
    useState(
      localStorage.getItem("username") || ""
    );

  const [email, setEmail] =
    useState("");

  const [emailCode, setEmailCode] =
    useState("");

  const [maskedLoginEmail, setMaskedLoginEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [token, setToken] =
    useState("");

  const [authReady, setAuthReady] =
    useState(false);

  useEffect(() => {
    function handleExpiredSession() {
      clearApiRequestMemory();
      resetAppBootstrapGuard();
      setApiAuthToken("");
      setToken("");
      setUsername("");
      setPassword("");
      setEmailCode("");
      setMaskedLoginEmail("");
      setAuthReady(true);
    }

    window.addEventListener(
      "liotan:session-expired",
      handleExpiredSession
    );

    return () => {
      window.removeEventListener(
        "liotan:session-expired",
        handleExpiredSession
      );
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const data =
          await getCurrentSessionApi();

        if (cancelled || !data?.username) {
          return;
        }

        setApiAuthToken("");
        localStorage.setItem(
          "username",
          data.username
        );
        setToken("cookie-session");
        setUsername(data.username);
      } catch {
        setApiAuthToken("");
        localStorage.removeItem("username");
      } finally {
        if (!cancelled) {
          setAuthReady(true);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSession(data) {
    clearApiRequestMemory();
    resetAppBootstrapGuard();

    setApiAuthToken("");

    localStorage.setItem(
      "username",
      data.username
    );

    setToken("cookie-session");
    setUsername(data.username);
    setAuthReady(true);
    setPassword("");
    setEmailCode("");
    setMaskedLoginEmail("");
  }

  function handleAuthError(err, fallback) {
    if (err.message === "Failed to fetch") {
      showToast("Server offline");
      return;
    }

    showToast(
      err.message || fallback
    );
  }

  function showCodeResult(result) {
    if (result?.devCode) {
      setEmailCode(result.devCode);
    }

    setMaskedLoginEmail(
      result?.maskedEmail || ""
    );

    const delivered =
      Boolean(result?.sent || result?.devCode);

    showToast(
      delivered
        ? "Code sent"
        : (
            result?.message ||
            "Email delivery is not available. Check RESEND_API_KEY on Liotan-api."
          )
    );

    return delivered;
  }

  async function sendLoginCode() {
    try {
      const result =
        await sendLoginEmailCode(
          email,
          password
        );

      return showCodeResult(result);
    } catch (err) {
      handleAuthError(
        err,
        "Failed to send code"
      );

      return false;
    }
  }

  async function login() {
    try {
      const loginPassword =
        password;

      const data =
        await loginUser(
          email,
          loginPassword,
          emailCode
        );

      await saveSession(data);

      await initE2EEAccountIdentity({
        username: data.username,
        password: loginPassword
      });

      return true;
    } catch (err) {
      handleAuthError(
        err,
        "Login failed"
      );

      return false;
    }
  }

  async function sendRegisterCode() {
    try {
      const result =
        await sendAuthEmailCode(
          email,
          "register"
        );

      return showCodeResult(result);
    } catch (err) {
      handleAuthError(
        err,
        "Failed to send code"
      );

      return false;
    }
  }

  async function sendResetCode() {
    try {
      const result =
        await sendAuthEmailCode(
          email,
          "reset"
        );

      return showCodeResult(result);
    } catch (err) {
      handleAuthError(
        err,
        "Failed to send code"
      );

      return false;
    }
  }

  async function verifyRegisterCode() {
    try {
      await verifyAuthEmailCode(
        email,
        "register",
        emailCode
      );

      return true;
    } catch (err) {
      handleAuthError(
        err,
        "Invalid code"
      );

      return false;
    }
  }

  async function verifyResetCode() {
    try {
      await verifyAuthEmailCode(
        email,
        "reset",
        emailCode
      );

      return true;
    } catch (err) {
      handleAuthError(
        err,
        "Invalid code"
      );

      return false;
    }
  }

  async function register() {
    try {
      const registerPassword =
        password;

      const data =
        await registerUser(
          username,
          registerPassword,
          email,
          emailCode
        );

      await saveSession(data);

      await initE2EEAccountIdentity({
        username: data.username,
        password: registerPassword
      });

      showToast("Registered");
      return true;
    } catch (err) {
      handleAuthError(
        err,
        "Register failed"
      );

      return false;
    }
  }

  async function resetPassword() {
    try {
      await resetPasswordApi(
        email,
        emailCode,
        password
      );

      showToast("Password changed");
      setPassword("");
      setEmailCode("");

      return true;
    } catch (err) {
      handleAuthError(
        err,
        "Failed to reset password"
      );

      return false;
    }
  }

  async function deleteAccount(socketRef) {
    try {
      await deleteAccountApi();
      showToast("Account deleted");
      clearSession(socketRef);
      return true;
    } catch (err) {
      handleAuthError(
        err,
        "Failed to delete account"
      );

      return false;
    }
  }

  function clearSession(socketRef) {
    if (socketRef?.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setApiAuthToken("");
    localStorage.removeItem("username");

    setToken("");
    setUsername("");
    setAuthReady(true);
    setPassword("");
    setEmailCode("");
    setMaskedLoginEmail("");
  }

  async function logout(socketRef) {
    try {
      await logoutCurrentSessionApi();
    } catch {
      // Local logout must still work when the session is already expired.
    }

    clearSession(socketRef);
  }

  return {
    username,
    setUsername,

    email,
    setEmail,

    emailCode,
    setEmailCode,

    maskedLoginEmail,
    setMaskedLoginEmail,

    password,
    setPassword,

    token,
    setToken,

    authReady,

    sendLoginCode,
    login,
    sendRegisterCode,
    verifyRegisterCode,
    register,
    sendResetCode,
    verifyResetCode,
    resetPassword,
    deleteAccount,
    logout
  };
}
