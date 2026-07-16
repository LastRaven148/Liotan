export default function ChatSecurityNotice({ ready, onInspect }) {
  return (
    <div
      className={ready ? "chat-security-notice is-ready" : "chat-security-notice is-pending"}
      role="status"
      aria-live="polite"
    >
      {ready
        ? "Сообщения и медиа защищены сквозным шифрованием. Прочитать их можете только вы и участники этого чата."
        : "Защищённая сессия подготавливается. Отправка будет доступна после проверки MLS."}
      {ready && <button type="button" className="chat-security-inspect" onClick={onInspect}>
        Проверить защищённость
      </button>}
    </div>
  );
}
