import "./App.css";

import useAppController from "./hooks/app/useAppController";
import AuthLayout from "./components/layouts/AuthLayout";
import MessengerLayout from "./components/layouts/MessengerLayout";
import CryptoGate from "./crypto/CryptoGate";
import SecureTransitionGate from "./crypto/SecureTransitionGate";

export default function App() {
  const app = useAppController();
  let content = null;

  if (app.authReady && !app.token) {
    content = (
      <AuthLayout
        username={app.username}
        setUsername={app.setUsername}
        email={app.email}
        setEmail={app.setEmail}
        emailCode={app.emailCode}
        setEmailCode={app.setEmailCode}
        maskedLoginEmail={app.maskedLoginEmail}
        secondFactorRequired={app.secondFactorRequired}
        setSecondFactorRequired={app.setSecondFactorRequired}
        totpCode={app.totpCode}
        setTotpCode={app.setTotpCode}
        backupCode={app.backupCode}
        setBackupCode={app.setBackupCode}
        password={app.password}
        setPassword={app.setPassword}
        sendLoginCode={app.sendLoginCode}
        login={app.login}
        sendRegisterCode={app.sendRegisterCode}
        verifyRegisterCode={app.verifyRegisterCode}
        register={app.register}
        sendResetCode={app.sendResetCode}
        verifyResetCode={app.verifyResetCode}
        resetPassword={app.resetPassword}
      />
    );
  } else if (app.authReady && app.token) {
    content = (
      <CryptoGate
        username={app.username}
        onStageChange={app.updateSecureTransition}
        onReady={app.completeSecureTransition}
        onBlocked={app.completeSecureTransition}
      >
        <MessengerLayout app={app} />
      </CryptoGate>
    );
  }

  const transitionActive = Boolean(app.secureTransition?.active);
  return (
    <>
      <div
        className="app-content-root"
        aria-hidden={transitionActive ? "true" : undefined}
        inert={transitionActive ? "" : undefined}
      >
        {content}
      </div>
      <SecureTransitionGate
        active={transitionActive}
        stage={app.secureTransition?.stage}
      />
    </>
  );
}
