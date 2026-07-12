import { useEffect, useRef } from "react";

const STAGES = Object.freeze({
  "site-loading": { title: "Устанавливаем защищённое соединение", detail: "Подготавливаем приложение", progress: 18 },
  "checking-session": { title: "Проверяем сессию", detail: "Подтверждаем состояние входа", progress: 38 },
  "opening-storage": { title: "Открываем защищённое хранилище", detail: "Подключаем локальное MLS-состояние", progress: 66 },
  "preparing-messages": { title: "Подготавливаем сообщения", detail: "Проверяем готовность защищённого канала", progress: 88 },
  "closing-session": { title: "Закрываем защищённую сессию", detail: "Завершаем локальные криптографические операции", progress: 52 }
});

export default function SecureTransitionGate({ active, stage = "site-loading" }) {
  const cardRef = useRef(null);
  const copy = STAGES[stage] || STAGES["site-loading"];

  useEffect(() => {
    if (!active) return undefined;
    const previous = document.activeElement;
    cardRef.current?.focus({ preventScroll: true });
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [active]);

  if (!active) return null;
  return (
    <div className="secure-transition" role="dialog" aria-modal="true" aria-labelledby="secure-transition-title">
      <section className="secure-transition-card" ref={cardRef} tabIndex={-1}>
        <div className="secure-transition-orbit" aria-hidden="true">
          <span className="secure-transition-core" />
          <span className="secure-transition-ring secure-transition-ring-one" />
          <span className="secure-transition-ring secure-transition-ring-two" />
        </div>
        <div className="secure-transition-copy" role="status" aria-live="polite" aria-atomic="true">
          <h1 id="secure-transition-title">{copy.title}</h1>
          <p>{copy.detail}</p>
        </div>
        <div className="secure-transition-progress" aria-hidden="true">
          <span style={{ width: `${copy.progress}%` }} />
        </div>
        <p className="secure-transition-note">Не закрывайте эту вкладку</p>
      </section>
    </div>
  );
}
