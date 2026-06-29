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
  sendLegacyBindCode,
  legacyBindEmail,
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

  const isLegacy =
    mode === "legacy";

  function text(
    ru,
    en
  ) {
    return isRu
      ? ru
      : en;
  }

  function title() {
    if (isReset) {
      return text(
        "Восстановление пароля",
        "Reset password"
      );
    }

    if (isLegacy) {
      return text(
        "Привязать почту",
        "Link email"
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
        "Введите почту и пароль. Username больше не используется для входа.",
        "Enter email and password. Username is no longer used for login."
      );
    }

    if (isLegacy) {
      if (step === "legacyCode") {
        return text(
          `Введите код из письма. Код отправлен на ${maskedLoginEmail || "вашу почту"}.`,
          `Enter the email code. The code was sent to ${maskedLoginEmail || "your email"}.`
        );
      }

      return text(
        "Для старого аккаунта: введите старый username, старый пароль и новую почту. После кода вход по username отключится.",
        "For an old account: enter old username, old password, and new email. After the code, username login is disabled."
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
        : nextMode === "legacy"
          ? "legacyCredentials"
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

    if (isLegacy) {
      if (step === "legacyCode") {
        await legacyBindEmail(username);
        return;
      }

      const ok =
        await sendLegacyBindCode(username);

      if (ok) {
        setStep("legacyCode");
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

    if (isLegacy) {
      if (step === "legacyCode") {
        setStep("legacyCredentials");
        setEmailCode("");
        return;
      }

      switchMode("login");
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

    if (isLegacy) {
      if (step === "legacyCode") {
        return text(
          "Привязать и войти",
          "Link and login"
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

  function renderFields() {
    if (isLegacy) {
      if (step === "legacyCode") {
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

          <input
            className="auth-input"
            placeholder={text(
              "Старый пароль",
              "Old password"
            )}
            type="password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            onKeyDown={handleKeyDown}
          />

          <input
            className="auth-input"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            onKeyDown={handleKeyDown}
          />
        </>
      );
    }

    if (isLogin) {
      if (step === "loginCode") {
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

    if (isReset) {
      return (
        <>
          <input
            className="auth-input"
            placeholder={text(
              "Новый пароль",
              "New password"
            )}
            type="password"
            value={password}
            autoFocus
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

    return (
      <>
        <input
          className="auth-input"
          placeholder={text(
            "Username",
            "Username"
          )}
          value={username}
          autoFocus
          onChange={(e) =>
            setUsername(e.target.value)
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

            <button
              type="button"
              className="auth-link auth-link-secondary"
              onClick={() =>
                switchMode("legacy")
              }
            >
              {text(
                "Старый аккаунт без почты",
                "Old account without email"
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
