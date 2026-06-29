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
  maskedLoginEmail,
  password,
  setPassword,
  sendLoginCode,
  login,
  sendRegisterCode,
  verifyRegisterCode,
  register,
  sendResetCode,
  verifyResetCode,
  resetPassword
}) {

  const {
    language,
    setLanguage
  } = useLanguage();

  const [mode, setMode] =
    useState("login");

  const [step, setStep] =
    useState("loginCredentials");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const isRu =
    language === "ru";

  const isLogin =
    mode === "login";

  const isRegister =
    mode === "register";

  const isReset =
    mode === "reset";

  function text(ru, en) {
    return isRu ? ru : en;
  }

  function title() {
    if (isReset) {
      return text(
        "Восстановление пароля",
        "Reset password"
      );
    }

    if (isRegister) {
      return text(
        "Создать аккаунт",
        "Create account"
      );
    }

    return text(
      "Вход в Liotan",
      "Sign in to Liotan"
    );
  }

  function subtitle() {
    if (isLogin) {
      if (step === "loginCode") {
        return text(
          `Введите код из письма. Код отправлен на ${maskedLoginEmail || "вашу почту"}.`,
          `Enter the email code. The code was sent to ${maskedLoginEmail || "your email"}.`
        );
      }

      return text(
        "Введите почту и пароль. Username используется только как публичное имя, не для входа.",
        "Enter email and password. Username is public and is not used for login."
      );
    }

    if (step === "email") {
      return text(
        "Введите почту. Мы отправим код подтверждения.",
        "Enter your email. We will send a verification code."
      );
    }

    if (step === "code") {
      return text(
        "Введите код из письма. Аккаунт пока не создаётся.",
        "Enter the email code. The account is not created yet."
      );
    }

    if (isReset) {
      return text(
        "Придумайте новый пароль.",
        "Create a new password."
      );
    }

    return text(
      "Придумайте username и пароль. Аккаунт создастся только после этого шага.",
      "Create a username and password. The account is created only after this step."
    );
  }

  function clearSensitive() {
    setPassword("");
    setConfirmPassword("");
    setEmailCode("");
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setStep(
      nextMode === "login"
        ? "loginCredentials"
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

  function passwordsMatch() {
    return (
      password.length >= 8 &&
      password === confirmPassword
    );
  }

  async function handlePrimary() {
    if (isLogin) {
      if (step === "loginCode") {
        await login();
        return;
      }

      const ok =
        await sendLoginCode();

      if (ok) {
        setStep("loginCode");
      }

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
      const ok = isReset
        ? await verifyResetCode()
        : await verifyRegisterCode();

      if (ok) {
        setStep(
          isReset
            ? "newPassword"
            : "account"
        );
      }

      return;
    }

    if (!passwordsMatch()) {
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
      if (step === "loginCode") {
        setStep("loginCredentials");
        setEmailCode("");
      }

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
    setPassword("");
    setConfirmPassword("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      handlePrimary();
    }
  }

  function primaryText() {
    if (isLogin) {
      if (step === "loginCode") {
        return text(
          "Войти",
          "Login"
        );
      }

      return text(
        "Получить код",
        "Get code"
      );
    }

    if (step === "email") {
      return text(
        "Получить код",
        "Get code"
      );
    }

    if (step === "code") {
      return text(
        "Проверить код",
        "Verify code"
      );
    }

    if (isReset) {
      return text(
        "Сменить пароль",
        "Change password"
      );
    }

    return text(
      "Создать аккаунт",
      "Create account"
    );
  }

  function renderPasswordHint() {
    if (
      step !== "account" &&
      step !== "newPassword"
    ) {
      return null;
    }

    if (!password && !confirmPassword) {
      return (
        <p className="auth-hint">
          {text(
            "Минимум 8 символов.",
            "At least 8 characters."
          )}
        </p>
      );
    }

    if (password.length < 8) {
      return (
        <p className="auth-hint auth-hint-error">
          {text(
            "Пароль слишком короткий.",
            "Password is too short."
          )}
        </p>
      );
    }

    if (
      confirmPassword &&
      password !== confirmPassword
    ) {
      return (
        <p className="auth-hint auth-hint-error">
          {text(
            "Пароли не совпадают.",
            "Passwords do not match."
          )}
        </p>
      );
    }

    return null;
  }

  function renderEmailCodeField() {
    return (
      <input
        className="auth-input"
        placeholder={text(
          "Код из письма",
          "Email code"
        )}
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

  function renderPasswordFields({
    newPassword = false
  } = {}) {
    return (
      <>
        <input
          className="auth-input"
          placeholder={text(
            newPassword ? "Новый пароль" : "Пароль",
            newPassword ? "New password" : "Password"
          )}
          type="password"
          value={password}
          autoFocus={newPassword}
          onChange={(e) =>
            setPassword(e.target.value)
          }
          onKeyDown={handleKeyDown}
        />

        <input
          className="auth-input"
          placeholder={text(
            "Повторите пароль",
            "Repeat password"
          )}
          type="password"
          value={confirmPassword}
          onChange={(e) =>
            setConfirmPassword(e.target.value)
          }
          onKeyDown={handleKeyDown}
        />

        {renderPasswordHint()}
      </>
    );
  }

  function renderFields() {
    if (isLogin) {
      if (step === "loginCode") {
        return renderEmailCodeField();
      }

      return (
        <>
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

          <input
            className="auth-input"
            placeholder={text(
              "Пароль",
              "Password"
            )}
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
      return renderEmailCodeField();
    }

    if (isReset) {
      return renderPasswordFields({
        newPassword: true
      });
    }

    return (
      <>
        <input
          className="auth-input"
          placeholder="Username"
          value={username}
          autoFocus
          onChange={(e) =>
            setUsername(e.target.value)
          }
          onKeyDown={handleKeyDown}
        />

        {renderPasswordFields()}
      </>
    );
  }

  return (
    <div className="login-page">
      <div className="auth-card">
        {(!isLogin || step === "loginCode") && (
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
          disabled={
            (step === "account" || step === "newPassword") &&
            !passwordsMatch()
          }
          onClick={handlePrimary}
        >
          {primaryText()}
        </button>

        {isLogin && step !== "loginCode" && (
          <>
            <button
              type="button"
              className="auth-link"
              onClick={() =>
                switchMode("register")
              }
            >
              {text(
                "Создать аккаунт",
                "Create account"
              )}
            </button>

            <button
              type="button"
              className="auth-link auth-link-secondary"
              onClick={() =>
                switchMode("reset")
              }
            >
              {text(
                "Забыли пароль?",
                "Forgot password?"
              )}
            </button>
          </>
        )}

        {!isLogin && (
          <button
            type="button"
            className="auth-link"
            onClick={() =>
              switchMode("login")
            }
          >
            {text(
              "У меня уже есть аккаунт",
              "I already have an account"
            )}
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
