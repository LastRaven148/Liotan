import LoginPage from "../LoginPage";

export default function AuthLayout({
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

  return (
    <LoginPage
      username={username}
      setUsername={setUsername}
      email={email}
      setEmail={setEmail}
      emailCode={emailCode}
      setEmailCode={setEmailCode}
      maskedLoginEmail={maskedLoginEmail}
      secondFactorRequired={secondFactorRequired}
      setSecondFactorRequired={setSecondFactorRequired}
      totpCode={totpCode}
      setTotpCode={setTotpCode}
      backupCode={backupCode}
      setBackupCode={setBackupCode}
      password={password}
      setPassword={setPassword}
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
