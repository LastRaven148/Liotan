import {
  useState
} from "react";

import {
  loginUser,
  registerUser
} from "../services/api";

export default function useAuth({
  showToast
}) {

  const [username, setUsername] =
    useState(
      localStorage.getItem("username") || ""
    );

  const [password, setPassword] =
    useState("");

  const [token, setToken] =
    useState(
      localStorage.getItem("token") || ""
    );

  async function login() {

    try {

      const data =
        await loginUser(
          username,
          password
        );

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

    } catch (err) {

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
        "Login failed"
      );

    }

  }

  async function register() {

    try {

      await registerUser(
        username,
        password
      );

      showToast(
        "Registered"
      );

    } catch (err) {

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
        "Register failed"
      );

    }

  }

  function logout(socketRef) {

    if (socketRef?.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    localStorage.removeItem("token");
    localStorage.removeItem("username");

    setToken("");
    setUsername("");
    setPassword("");

  }

  return {
    username,
    setUsername,

    password,
    setPassword,

    token,
    setToken,

    login,
    register,
    logout
  };

}