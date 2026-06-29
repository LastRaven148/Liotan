import {
  useState
} from "react";

import {
  loginUser,
  registerUser,
  sendAuthEmailCode,
  resetPasswordApi,
  deleteAccountApi
} from "../services/api";

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

  async function login() {

    try {

      const data =
        await loginUser(
          username,
          password
        );

      await saveSession(data);

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

  async function register() {

    try {

      await registerUser(
        username,
        password,
        email,
        emailCode
      );

      const data =
        await loginUser(
          username,
          password
        );

      await saveSession(data);

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

    password,
    setPassword,

    token,
    setToken,

    login,
    sendRegisterCode,
    register,
    sendResetCode,
    resetPassword,
    logout,
    deleteAccount
  };

}
