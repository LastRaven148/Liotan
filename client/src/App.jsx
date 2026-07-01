import "./App.css";

import useAppController
from "./hooks/app/useAppController";

import AuthLayout from "./components/layouts/AuthLayout";
import MessengerLayout from "./components/layouts/MessengerLayout";

export default function App() {

  const app =
    useAppController();

  if (!app.authReady) {

    return (
      <div className="app-bootstrap-screen" aria-hidden="true" />
    );

  }

  if (!app.token) {

    return (
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

  }

  return (
    <MessengerLayout
      app={app}
    />
  );

}