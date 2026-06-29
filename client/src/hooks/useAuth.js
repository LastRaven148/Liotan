import {
  useState
} from "react";

import {
  sendLoginEmailCode,
  loginUser,
  registerUser,
  sendAuthEmailCode,
  verifyAuthEmailCode,
  resetPasswordApi,
  sendBindEmailCodeApi,
  bindEmailApi
} from "../services/api";

import {
  initE2EEAccountIdentity
} from "../utils/e2ee";

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
    useState(
      localStorage.getItem("token") || ""
    );

  async function saveSession(data) {
    localStorage.setItem(
      "token",
      data.token
    );

    localStorage.setItem(
      "username",
      data.username
    );

    setToken(data.token);
    setUsername(data.username);
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

    showToast(
      result?.sent
        ? "Code sent"
        : "Mail is not configured. Code is in server logs."
    );
  }

  async function sendLoginCode() {
    try {
      const result =
        await sendLoginEmailCode(
          email,
          password
        );

      showCodeResult(result);
      return true;
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

      showCodeResult(result);
      return true;
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

      showCodeResult(result);
      return true;
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

  async function sendBindEmailCode(emailValue) {
    try {
      const result =
        await sendBindEmailCodeApi(
          emailValue
        );

      showToast(
        result?.sent
          ? "Code sent"
          : "Mail is not configured. Code is in server logs."
      );

      return result;
    } catch (err) {
      handleAuthError(
        err,
        "Failed to send code"
      );

      return null;
    }
  }

  async function bindEmail(emailValue, codeValue) {
    try {
      await bindEmailApi(
        emailValue,
        codeValue
      );

      showToast("Email linked");
      return true;
    } catch (err) {
      handleAuthError(
        err,
        "Failed to link email"
      );

      return false;
    }
  }

  function clearSession(socketRef) {
    if (socketRef?.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    localStorage.removeItem("token");
    localStorage.removeItem("username");

    setToken("");
    setUsername("");
    setPassword("");
    setEmailCode("");
    setMaskedLoginEmail("");
  }

  function logout(socketRef) {
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

    sendLoginCode,
    login,
    sendRegisterCode,
    verifyRegisterCode,
    register,
    sendResetCode,
    verifyResetCode,
    resetPassword,
    sendBindEmailCode,
    bindEmail,
    logout
  };
}
