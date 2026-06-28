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
        password={app.password}
        setPassword={app.setPassword}
        login={app.login}
        register={app.register}
      />
    );

  }

  return (
    <MessengerLayout
      app={app}
    />
  );

}