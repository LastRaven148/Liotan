import {
  useState
} from "react";

import {
  useLanguage
} from "../context/LanguageContext";

export default function LoginPage({
  username,
  setUsername,
  password,
  setPassword,
  login,
  register
}) {

  const {
    language,
    setLanguage
  } = useLanguage();

  const [mode, setMode] =
    useState("login");

  const [step, setStep] =
    useState("username");

  const isLogin =
    mode === "login";

  const title =
    isLogin
      ? language === "ru"
        ? "Вход в Liotan"
        : "Sign in to Liotan"
      : language === "ru"
        ? "Создать аккаунт"
        : "Create account";

  const subtitle =
    step === "username"
      ? language === "ru"
        ? "Введите имя пользователя"
        : "Enter your username to continue"
      : language === "ru"
        ? `Добро пожаловать, ${username}`
        : `Welcome, ${username}`;

  function handleNext() {

    if (!username.trim()) {
      return;
    }

    setStep("password");

  }

  function handleBack() {

    setStep("username");
    setPassword("");

  }

  function handleSubmit() {

    if (isLogin) {
      login();
      return;
    }

    register();

  }

  function switchMode() {

    setMode(
      isLogin
        ? "register"
        : "login"
    );

    setStep("username");
    setPassword("");

  }

  function switchLanguage() {

    setLanguage(
      language === "ru"
        ? "en"
        : "ru"
    );

  }

  function handleKeyDown(e) {

    if (e.key !== "Enter") {
      return;
    }

    if (step === "username") {
      handleNext();
      return;
    }

    handleSubmit();

  }

  return (
    <div className="login-page">

      <div className="auth-card">

        {step === "password" && (
          <button
            type="button"
            className="auth-back"
            onClick={handleBack}
          >
            ←
          </button>
        )}

        <div className="auth-logo">
          R
        </div>

        <h1>
          {title}
        </h1>

        <p className="auth-subtitle">
          {subtitle}
        </p>

        {step === "username" ? (
          <input
            className="auth-input"
            placeholder={
              language === "ru"
                ? "Имя пользователя"
                : "Username"
            }
            value={username}
            autoFocus
            onChange={(e) =>
              setUsername(e.target.value)
            }
            onKeyDown={handleKeyDown}
          />
        ) : (
          <input
            className="auth-input"
            placeholder={
              language === "ru"
                ? "Пароль"
                : "Password"
            }
            type="password"
            value={password}
            autoFocus
            onChange={(e) =>
              setPassword(e.target.value)
            }
            onKeyDown={handleKeyDown}
          />
        )}

        <button
          type="button"
          className="auth-primary"
          onClick={
            step === "username"
              ? handleNext
              : handleSubmit
          }
        >
          {step === "username"
            ? language === "ru"
              ? "Далее"
              : "Next"
            : isLogin
              ? language === "ru"
                ? "Войти"
                : "Login"
              : language === "ru"
                ? "Зарегистрироваться"
                : "Register"}
        </button>

        <button
          type="button"
          className="auth-link"
          onClick={switchMode}
        >
          {isLogin
            ? language === "ru"
              ? "Создать аккаунт"
              : "Create account"
            : language === "ru"
              ? "У меня уже есть аккаунт"
              : "I already have an account"}
        </button>

        <button
          type="button"
          className="auth-language"
          onClick={switchLanguage}
        >
          {language === "ru"
            ? "Continue in English"
            : "Продолжить на русском"}
        </button>

      </div>

    </div>
  );

}