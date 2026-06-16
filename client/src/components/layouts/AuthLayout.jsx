import LoginPage from "../LoginPage";

export default function AuthLayout({
  username,
  setUsername,
  password,
  setPassword,
  login,
  register
}) {

  return (
    <LoginPage
      username={username}
      setUsername={setUsername}
      password={password}
      setPassword={setPassword}
      login={login}
      register={register}
    />
  );

}