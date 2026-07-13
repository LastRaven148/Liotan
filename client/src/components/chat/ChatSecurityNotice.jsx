export default function ChatSecurityNotice({ ready }) {
  return (
    <div
      className={ready ? "chat-security-notice is-ready" : "chat-security-notice is-pending"}
      role="status"
      aria-live="polite"
    >
      {ready
        ? "Сообщения и медиа защищены сквозным шифрованием. Прочитать их можете только вы и участники этого чата."
        : "Защищённая сессия подготавливается. Отправка будет доступна после проверки MLS."}
    </div>
  );
}
