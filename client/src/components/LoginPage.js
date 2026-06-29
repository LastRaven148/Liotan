import {
  useState
} from "react";

import {
  useLanguage
} from "../context/LanguageContext";

export default function LoginPage({
  username,
  setUsername,
  email,
  setEmail,
  emailCode,
  setEmailCode,
  password,
  setPassword,
  login,
  sendRegisterCode,
  register,
  sendResetCode,
  resetPassword
}) {

  const {
    language,
    setLanguage
  } = useLanguage();

  const [mode, setMode] =
    useState("login");

  const [step, setStep] =
    useState("login");

  const isRu =
    language === "ru";

  const isLogin =
    mode === "login";

  const isRegister =
    mode === "register";

  const isReset =
    mode === "reset";

  function title() {
    if (isReset) {
      return isRu
        ? "Восстановление пароля"
        : "Reset password";
    }

    if (isRegister) {
      return isRu
        ? "Создать аккаунт"
        : "Create account";
    }

    return isRu
      ? "Вход в Liotan"
      : "Sign in to Liotan";
  }

  function subtitle() {
    if (isLogin) {
      return isRu
        ? "Введите username или email и пароль"
        : "Enter username or email and password";
    }

    if (step === "email") {
      return isRu
        ? "На почту придёт код подтверждения"
        : "A verification code will be sent to email";
    }

    if (step === "code") {
      return isRu
        ? "Введите код из письма"
        : "Enter the email code";
    }

    return isRu
      ? "Введите имя пользователя и пароль"
      : "Enter username and password";
  }

  function clearSensitive() {
    setPassword("");
    setEmailCode("");
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setStep(
      nextMode === "login"
        ? "login"
        : "email"
    );
    clearSensitive();
  }

  function switchLanguage() {
    setLanguage(
      language === "ru"
        ? "en"
        : "ru"
    );
  }

  async function handlePrimary() {
    if (isLogin) {
      await login();
      return;
    }

    if (step === "email") {
      const ok = isReset
        ? await sendResetCode()
        : await sendRegisterCode();

      if (ok) {
        setStep("code");
      }

      return;
    }

    if (step === "code") {
      setStep(
        isReset
          ? "newPassword"
          : "account"
      );
      return;
    }

    if (isReset) {
      const ok =
        await resetPassword();

      if (ok) {
        switchMode("login");
      }

      return;
    }

    await register();
  }

  function handleBack() {
    if (isLogin) {
      return;
    }

    if (step === "email") {
      switchMode("login");
      return;
    }

    if (step === "code") {
      setStep("email");
      return;
    }

    setStep("code");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      handlePrimary();
    }
  }

  function primaryText() {
    if (isLogin) {
      return isRu
        ? "Войти"
        : "Login";
    }

    if (step === "email") {
      return isRu
        ? "Получить код"
        : "Get code";
    }

    if (step === "code") {
      return isRu
        ? "Продолжить"
        : "Continue";
    }

    if (isReset) {
      return isRu
        ? "Сменить пароль"
        : "Change password";
    }

    return isRu
      ? "Зарегистрироваться"
      : "Register";
  }

  function renderFields() {
    if (isLogin) {
      return (
        <>
          <input
            className="auth-input"
            placeholder={
              isRu
                ? "Username или email"
                : "Username or email"
            }
            value={username}
            autoFocus
            onChange={(e) =>
              setUsername(e.target.value)
            }
            onKeyDown={handleKeyDown}
          />

          <input
            className="auth-input"
            placeholder={
              isRu
                ? "Пароль"
                : "Password"
            }
            type="password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            onKeyDown={handleKeyDown}
          />
        </>
      );
    }

    if (step === "email") {
      return (
        <input
          className="auth-input"
          placeholder="Email"
          type="email"
          value={email}
          autoFocus
          onChange={(e) =>
            setEmail(e.target.value)
          }
          onKeyDown={handleKeyDown}
        />
      );
    }

    if (step === "code") {
      return (
        <input
          className="auth-input"
          placeholder={
            isRu
              ? "Код из письма"
              : "Email code"
          }
          inputMode="numeric"
          maxLength={6}
          value={emailCode}
          autoFocus
          onChange={(e) =>
            setEmailCode(
              e.target.value.replace(/\D/g, "")
            )
          }
          onKeyDown={handleKeyDown}
        />
      );
    }

    if (isReset) {
      return (
        <input
          className="auth-input"
          placeholder={
            isRu
              ? "Новый пароль"
              : "New password"
          }
          type="password"
          value={password}
          autoFocus
          onChange={(e) =>
            setPassword(e.target.value)
          }
          onKeyDown={handleKeyDown}
        />
      );
    }

    return (
      <>
        <input
          className="auth-input"
          placeholder={
            isRu
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

        <input
          className="auth-input"
          placeholder={
            isRu
              ? "Пароль"
              : "Password"
          }
          type="password"
          value={password}
          onChange={(e) =>
            setPassword(e.target.value)
          }
          onKeyDown={handleKeyDown}
        />
      </>
    );
  }

  return (
    <div className="login-page">

      <div className="auth-card">

        {!isLogin && (
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
          {title()}
        </h1>

        <p className="auth-subtitle">
          {subtitle()}
        </p>

        <div className="auth-fields">
          {renderFields()}
        </div>

        <button
          type="button"
          className="auth-primary"
          onClick={handlePrimary}
        >
          {primaryText()}
        </button>

        {isLogin ? (
          <>
            <button
              type="button"
              className="auth-link"
              onClick={() =>
                switchMode("register")
              }
            >
              {isRu
                ? "Создать аккаунт"
                : "Create account"}
            </button>

            <button
              type="button"
              className="auth-link auth-link-secondary"
              onClick={() =>
                switchMode("reset")
              }
            >
              {isRu
                ? "Забыли пароль?"
                : "Forgot password?"}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="auth-link"
            onClick={() =>
              switchMode("login")
            }
          >
            {isRu
              ? "У меня уже есть аккаунт"
              : "I already have an account"}
          </button>
        )}

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
