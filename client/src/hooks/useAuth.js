import {
  useState
} from "react";

import {
  sendLoginEmailCode,
  sendLegacyBindEmailCodeApi,
  legacyBindEmailApi,
  loginUser,
  registerUser,
  sendAuthEmailCode,
  verifyAuthEmailCode,
  resetPasswordApi,
  sendBindEmailCodeApi,
  bindEmailApi,
  deleteAccountApi
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

    setToken(
      data.token
    );

    setUsername(
      data.username
    );

    setPassword("");
    setEmailCode("");
    setMaskedLoginEmail("");

  }

  function handleAuthError(
    err,
    fallback
  ) {
    if (
      err.message === "Failed to fetch"
    ) {
      showToast(
        "Server offline"
      );

      return;
    }

    showToast(
      err.message ||
      fallback
    );
  }


  async function sendLegacyBindCode(
    legacyUsername
  ) {

    try {

      const result =
        await sendLegacyBindEmailCodeApi(
          legacyUsername,
          password,
          email
        );

      if (result?.devCode) {
        setEmailCode(
          result.devCode
        );
      }

      setMaskedLoginEmail(
        result?.maskedEmail || ""
      );

      showToast(
        result?.sent
          ? "Code sent"
          : "Mail is not configured. Code is in server logs."
      );

      return true;

    } catch (err) {
      handleAuthError(
        err,
        "Failed to send code"
      );

      return false;
    }

  }

  async function legacyBindEmail(
    legacyUsername
  ) {

    try {

      const loginPassword =
        password;

      const data =
        await legacyBindEmailApi(
          legacyUsername,
          loginPassword,
          email,
          emailCode
        );

      await saveSession(data);

      await initE2EEAccountIdentity({
        username: data.username,
        password: loginPassword
      });

      showToast(
        "Email linked"
      );

      return true;

    } catch (err) {
      handleAuthError(
        err,
        "Failed to link email"
      );

      return false;
    }

  }

  async function sendLoginCode() {

    try {

      const result =
        await sendLoginEmailCode(
          email,
          password
        );

      if (result?.devCode) {
        setEmailCode(
          result.devCode
        );
      }

      setMaskedLoginEmail(
        result?.maskedEmail || ""
      );

      showToast(
        result?.sent
          ? "Code sent"
          : "Mail is not configured. Code is in server logs."
      );

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

    } catch (err) {
      handleAuthError(
        err,
        "Login failed"
      );
    }

  }


  async function sendRegisterCode() {

    try {

      const result =
        await sendAuthEmailCode(
          email,
          "register"
        );

      if (result?.devCode) {
        setEmailCode(
          result.devCode
        );
      }

      showToast(
        result?.sent
          ? "Code sent"
          : "Mail is not configured. Code is in server logs."
      );

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

      showToast(
        "Registered"
      );

    } catch (err) {
      handleAuthError(
        err,
        "Register failed"
      );
    }

  }

  async function sendResetCode() {

    try {

      const result =
        await sendAuthEmailCode(
          email,
          "reset"
        );

      if (result?.devCode) {
        setEmailCode(
          result.devCode
        );
      }

      showToast(
        result?.sent
          ? "Code sent"
          : "Mail is not configured. Code is in server logs."
      );

      return true;

    } catch (err) {
      handleAuthError(
        err,
        "Failed to send code"
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

  async function bindEmail(
    emailValue,
    codeValue
  ) {

    try {

      await bindEmailApi(
        emailValue,
        codeValue
      );

      showToast(
        "Email linked"
      );

      return true;

    } catch (err) {
      handleAuthError(
        err,
        "Failed to link email"
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

      showToast(
        "Password changed"
      );

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

  function clearSession(
    socketRef
  ) {

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

  async function deleteAccount(
    socketRef
  ) {

    try {

      await deleteAccountApi();

      clearSession(
        socketRef
      );

      showToast(
        "Account deleted"
      );

    } catch (err) {

      showToast(
        err.message ||
        "Failed to delete account"
      );

    }

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

    sendLegacyBindCode,
    legacyBindEmail,
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
    logout,
    deleteAccount
  };

}
