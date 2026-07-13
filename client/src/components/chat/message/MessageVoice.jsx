import {
  formatDuration
} from "./messageFormatters";

function buildWaveform(seed = "", count = 28) {
  const source = String(seed || "");
  const values = [];
  for (let index = 0; index < count; index += 1) {
    const code = source.charCodeAt(index % Math.max(source.length, 1)) || 0;
    const next = (code + index * 17) % 100;
    values.push(next / 100);
  }
  return values;
}

function VoiceWave({
  active,
  progress = 0,
  duration = 0,
  attachment
}) {
  const waveform = Array.isArray(attachment?.waveform) && attachment.waveform.length
    ? attachment.waveform
    : buildWaveform(attachment?.url || attachment?.name || "voice");
  const playedRatio = duration > 0 ? Math.max(0, Math.min(1, progress / duration)) : 0;

  return (
    <div className="voice-wave" aria-hidden="true">
      {Array.from({ length: 28 }).map((_, index) => {
        const raw = Number(waveform[index % waveform.length]) || 0;
        const normalized = raw > 1 ? raw / 100 : raw;
        const level = 1 + Math.min(5, Math.floor(Math.max(0.04, Math.min(1, normalized)) * 6));
        const played = index / 28 <= playedRatio;
        return (
          <span
            key={index}
            className={[`level-${level}`, (active && played) ? "is-active" : ""].filter(Boolean).join(" ")}
          />
        );
      })}
    </div>
  );
}

export default function MessageVoice({
  t = {},
  attachment,
  audioPlaying,
  audioStarted,
  audioProgress,
  audioDuration,
  footer,
  onToggle,
  onSeek
}) {
  const totalDuration = audioDuration || Number(attachment?.duration) || 0;
  const duration = audioStarted ? audioProgress : totalDuration;

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
          <VoiceWave active={audioPlaying || audioStarted} progress={audioProgress} duration={totalDuration} attachment={attachment} />

          <input
            className="voice-range"
            type="range"
            min="0"
            max={totalDuration || Math.max(audioProgress, 1)}
            step="0.01"
            value={audioProgress}
            onChange={onSeek}
            onInput={onSeek}
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
