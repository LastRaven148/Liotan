import LoginPage from "../LoginPage";

export default function AuthLayout({
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
  verifyRegisterCode,
  register,
  sendResetCode,
  verifyResetCode,
  resetPassword
}) {

  return (
    <LoginPage
      username={username}
      setUsername={setUsername}
      email={email}
      setEmail={setEmail}
      emailCode={emailCode}
      setEmailCode={setEmailCode}
      password={password}
      setPassword={setPassword}
      login={login}
      sendRegisterCode={sendRegisterCode}
      verifyRegisterCode={verifyRegisterCode}
      register={register}
      sendResetCode={sendResetCode}
      verifyResetCode={verifyResetCode}
      resetPassword={resetPassword}
    />
  );

}
