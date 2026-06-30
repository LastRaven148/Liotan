import {
  formatDuration
} from "./messageFormatters";

function VoiceWave({
  active
}) {
  return (
    <div className="voice-wave" aria-hidden="true">
      {Array.from({ length: 28 }).map((_, index) => (
        <span
          key={index}
          className={active && index % 3 === 0 ? "is-active" : ""}
          style={{
            "--voice-wave-height": `${6 + ((index * 11) % 22)}px`
          }}
        />
      ))}
    </div>
  );
}

export default function MessageVoice({
  t = {},
  audioPlaying,
  audioStarted,
  audioProgress,
  audioDuration,
  footer,
  onToggle,
  onSeek
}) {
  const duration =
    audioStarted
      ? audioProgress
      : audioDuration;

  return (
    <div className="message-voice">
      <button
        type="button"
        className={[
          "voice-play-button",
          audioPlaying ? "is-playing" : ""
        ].join(" ")}
        onClick={onToggle}
        aria-label={audioPlaying ? t.pause || "Пауза" : t.play || "Воспроизвести"}
      />

      <div className="voice-main">
        <div className="voice-progress-row">
          <VoiceWave active={audioPlaying} />

          <input
            className="voice-range"
            type="range"
            min="0"
            max={audioDuration || 0}
            step="0.01"
            value={audioProgress}
            onChange={onSeek}
            aria-label={t.voicePosition || "Позиция голосового сообщения"}
          />
        </div>

        <div className="voice-meta">
          <span className="voice-duration">
            {formatDuration(duration)}
          </span>

          {footer && (
            <span className="voice-footer-slot">
              {footer}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
