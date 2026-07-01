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
  secondFactorRequired,
  setSecondFactorRequired,
  totpCode,
  setTotpCode,
  backupCode,
  setBackupCode,
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
    setLanguage,
    t
  } = useLanguage();

  const [mode, setMode] =
    useState("login");

  const [step, setStep] =
    useState("loginCredentials");

  const [confirmPassword, setConfirmPassword] =
    useState("");


  const isLogin =
    mode === "login";

  const isRegister =
    mode === "register";

  const isReset =
    mode === "reset";

  function text(key, fallback) {
    return t[key] || fallback;
  }

  function title() {
    if (isReset) {
      return text("restorePassword", "Восстановление пароля");
    }

    if (isRegister) {
      return text("createAccount", "Создать аккаунт");
    }

    return text("loginTitle", "Вход в Liotan");
  }

  function subtitle() {
    if (isLogin) {
      if (step === "loginTotp") {
        return text("twoFactorSubtitle", "Введите код из приложения Authenticator или одноразовый backup code.");
      }

      if (step === "loginCode") {
        return `${t.emailCodeSentTo || "Введите код из письма. Код отправлен на"} ${maskedLoginEmail || t.yourEmail || "вашу почту"}.`;
      }

      return text("enterEmailPassword", "Введите свою почту и пароль");
    }

    if (step === "email") {
      return text("enterEmailForCode", "Введите почту. Мы отправим код подтверждения.");
    }

    if (step === "code") {
      return text("enterCodeFromEmail", "Введите код из письма.");
    }

    if (isReset) {
      return text("createNewPassword", "Придумайте новый пароль.");
    }

    return text("createNamePassword", "Придумайте Имя и Пароль");
  }

  function clearSensitive() {
    setPassword("");
    setConfirmPassword("");
    setEmailCode("");
    setTotpCode?.("");
    setBackupCode?.("");
    setSecondFactorRequired?.(false);
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
      if (step === "loginTotp") {
        const ok = await login({ totpCode, backupCode });
        if (!ok) {
          setStep("loginTotp");
        }
        return;
      }

      if (step === "loginCode") {
        const ok = await login();
        if (!ok && secondFactorRequired) {
          setStep("loginTotp");
        }
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
      if (step === "loginTotp") {
        setStep("loginCode");
        setTotpCode?.("");
        setBackupCode?.("");
        return;
      }

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
      if (step === "loginTotp") {
        return text("confirm", "Подтвердить");
      }

      if (step === "loginCode") {
        return text("login", "Войти");
      }

      return text("getCode", "Получить код");
    }

    if (step === "email") {
      return text("getCode", "Получить код");
    }

    if (step === "code") {
      return text("verifyCode", "Проверить код");
    }

    if (isReset) {
      return text("changePassword", "Сменить пароль");
    }

    return text("createAccount", "Создать аккаунт");
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
          {text("minPassword", "Минимум 8 символов.")}
        </p>
      );
    }

    if (password.length < 8) {
      return (
        <p className="auth-hint auth-hint-error">
          {text("passwordTooShort", "Пароль слишком короткий.")}
        </p>
      );
    }

    if (
      confirmPassword &&
      password !== confirmPassword
    ) {
      return (
        <p className="auth-hint auth-hint-error">
          {text("passwordsDoNotMatch", "Пароли не совпадают.")}
        </p>
      );
    }

    return null;
  }

  function renderEmailCodeField() {
    return (
      <input
        className="auth-input"
        placeholder={text("emailCode", "Код из письма")}
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
          placeholder={newPassword ? text("newPassword", "Новый пароль") : text("password", "Пароль")}
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
          placeholder={text("repeatPassword", "Повторите пароль")}
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

  function renderTotpField() {
    return (
      <>
        <input
          className="auth-input"
          placeholder={text("twoFactorCode", "Код Authenticator")}
          inputMode="numeric"
          maxLength={6}
          value={totpCode || ""}
          autoFocus
          onChange={(e) => setTotpCode?.(e.target.value.replace(/\D/g, ""))}
          onKeyDown={handleKeyDown}
        />
        <input
          className="auth-input"
          placeholder={text("backupCode", "Backup code, если нет доступа к Authenticator")}
          value={backupCode || ""}
          onChange={(e) => setBackupCode?.(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
        />
        <p className="auth-hint">
          {text("twoFactorHelp", "Backup code можно использовать один раз. После входа он будет удалён.")}
        </p>
      </>
    );
  }

  function renderFields() {
    if (isLogin) {
      if (step === "loginTotp") {
        return renderTotpField();
      }

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
        {(!isLogin || step === "loginCode" || step === "loginTotp") && (
          <button
            type="button"
            className="auth-back"
            onClick={handleBack}
          >
            ←
          </button>
        )}

        <div className="auth-logo">
          L
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
              {text("forgotPassword", "Забыли пароль?")}
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
            {text("alreadyHaveAccount", "У меня уже есть аккаунт")}
          </button>
        )}

        <button
          type="button"
          className="auth-language"
          onClick={switchLanguage}
        >
          {language === "ru"
            ? t.continueEnglish || "Continue in English"
            : t.continueRussian || "Продолжить на русском"}
        </button>
      </div>
    </div>
  );

}
