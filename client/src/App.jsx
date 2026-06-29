import "./App.css";

import useAppController
from "./hooks/app/useAppController";

import AuthLayout from "./components/layouts/AuthLayout";
import MessengerLayout from "./components/layouts/MessengerLayout";

export default function App() {

  const app =
    useAppController();

  if (!app.token) {

    return (
      <AuthLayout
        username={app.username}
        setUsername={app.setUsername}
        email={app.email}
        setEmail={app.setEmail}
        emailCode={app.emailCode}
        setEmailCode={app.setEmailCode}
        password={app.password}
        setPassword={app.setPassword}
        login={app.login}
        sendRegisterCode={app.sendRegisterCode}
        register={app.register}
        sendResetCode={app.sendResetCode}
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