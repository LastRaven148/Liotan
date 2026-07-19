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
  getAccountDeletionStatusApi,
  logoutCurrentSessionApi,
  getCurrentSessionApi
} from "../services/api";

import {
  clearApiRequestMemory,
  setApiAuthToken
} from "../utils/apiRequest";

import {
  resetAppBootstrapGuard
} from "./app/useAppInitialization";
import { resetMlsEngine } from "../crypto/mlsEngine";
import useSecureTransition from "./useSecureTransition";

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

  const [secondFactorRequired, setSecondFactorRequired] =
    useState(false);

  const [totpCode, setTotpCode] =
    useState("");

  const [backupCode, setBackupCode] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [token, setToken] =
    useState("");

  const [authReady, setAuthReady] =
    useState(false);

  const {
    secureTransition,
    beginSecureTransition,
    updateSecureTransition,
    completeSecureTransition
  } = useSecureTransition();

  useEffect(() => {
    async function handleExpiredSession() {
      await clearSession(null, { showTransition: true });
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
      let restored = false;
      updateSecureTransition("checking-session");
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
        restored = true;
        updateSecureTransition("opening-storage");
      } catch (err) {
        setApiAuthToken("");
        localStorage.removeItem("username");
        if (err?.status !== 401 && import.meta.env.DEV) {
          console.warn("Session restore failed", { status: err?.status || 0, message: err?.message || "unknown" });
        }
      } finally {
        if (!cancelled) {
          setAuthReady(true);
          if (!restored) await completeSecureTransition();
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, [completeSecureTransition, updateSecureTransition]);

  async function saveSession(data) {
    beginSecureTransition("checking-session", { minimumMs: 520 });
    clearApiRequestMemory();
    resetAppBootstrapGuard();
    setApiAuthToken("");

    const confirmed = await getCurrentSessionApi();
    if (!confirmed?.username || confirmed.username !== data?.username) {
      throw new Error("Session cookie was not confirmed by the server");
    }
    updateSecureTransition("opening-storage");

    localStorage.setItem(
      "username",
      confirmed.username
    );

    setToken("cookie-session");
    setUsername(confirmed.username);
    setAuthReady(true);
    setPassword("");
    setEmailCode("");
    setMaskedLoginEmail("");
    setSecondFactorRequired(false);
    setTotpCode("");
    setBackupCode("");
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
            "Email delivery is not available. Verify Resend domain/sender or SMTP on Liotan-api."
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

  async function login(secondFactor = {}) {
    try {
      const loginPassword =
        password;

      const data =
        await loginUser(
          email,
          loginPassword,
          emailCode,
          {
            totpCode: secondFactor.totpCode ?? totpCode,
            backupCode: secondFactor.backupCode ?? backupCode
          }
        );

      await saveSession(data);

      return { ok: true };
    } catch (err) {
      if (err.secondFactorRequired || err.data?.secondFactorRequired) {
        setSecondFactorRequired(true);
        showToast("Введите код двухфакторной аутентификации");
        return { ok: false, secondFactorRequired: true };
      }

      handleAuthError(
        err,
        "Login failed"
      );

      await completeSecureTransition();

      return { ok: false };
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

  async function register(options = {}) {
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

      if (options?.setupTwoFactor) {
        localStorage.setItem("liotan-open-totp-setup", "1");
      } else {
        localStorage.removeItem("liotan-open-totp-setup");
      }

      await saveSession(data);

      showToast("Registered");
      return true;
    } catch (err) {
      handleAuthError(
        err,
        "Register failed"
      );

      await completeSecureTransition();

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

  async function deleteAccount(socketRef, reauth = {}) {
    try {
      let result = await deleteAccountApi(reauth);
      for (let attempt = 0; result?.state !== "completed" && attempt < 30; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, Math.min(5000, 750 * (attempt + 1))));
        try {
          result = await getAccountDeletionStatusApi(result.workflowId);
        } catch (error) {
          if (error?.status === 401) {
            showToast("Account deletion was accepted and continues safely in the background.");
            await clearSession(socketRef, { showTransition: true });
            return true;
          }
          throw error;
        }
      }
      if (result?.state !== "completed") {
        const pending = new Error("Account deletion is still removing encrypted media. It will continue safely in the background.");
        pending.code = "account-deletion-pending";
        throw pending;
      }
      showToast("Account deleted");
      await clearSession(socketRef, { showTransition: true });
      return true;
    } catch (err) {
      handleAuthError(
        err,
        "Failed to delete account"
      );

      return false;
    }
  }

  async function clearSession(socketRef, { showTransition = false } = {}) {
    if (showTransition) beginSecureTransition("closing-session", { minimumMs: 420 });
    await resetMlsEngine();
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
    setSecondFactorRequired(false);
    setTotpCode("");
    setBackupCode("");
    if (showTransition) await completeSecureTransition();
  }

  async function logout(socketRef) {
    beginSecureTransition("closing-session", { minimumMs: 520 });
    try {
      await logoutCurrentSessionApi();
    } catch {
      // Local logout must still work when the session is already expired.
    }

    await clearSession(socketRef, { showTransition: false });
    await completeSecureTransition();
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

    secondFactorRequired,
    setSecondFactorRequired,

    totpCode,
    setTotpCode,

    backupCode,
    setBackupCode,

    password,
    setPassword,

    token,
    setToken,

    authReady,

    secureTransition,
    beginSecureTransition,
    updateSecureTransition,
    completeSecureTransition,

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
