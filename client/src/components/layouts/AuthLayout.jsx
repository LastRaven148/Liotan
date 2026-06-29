import LoginPage from "../LoginPage";

export default function AuthLayout({
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

  return (
    <LoginPage
      username={username}
      setUsername={setUsername}
      email={email}
      setEmail={setEmail}
      emailCode={emailCode}
      setEmailCode={setEmailCode}
      maskedLoginEmail={maskedLoginEmail}
      password={password}
      setPassword={setPassword}
      sendLegacyBindCode={sendLegacyBindCode}
      legacyBindEmail={legacyBindEmail}
      sendLoginCode={sendLoginCode}
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
