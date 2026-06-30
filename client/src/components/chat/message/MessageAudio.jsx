import {
  formatDuration
} from "./messageFormatters";

export default function MessageAudio({
  attachment,
  audioPlaying,
  audioStarted,
  audioProgress,
  audioDuration,
  attachmentSizeText,
  footer,
  onToggle,
  onSeek
}) {
  const duration = audioDuration || 0;
  const progress = Math.min(audioProgress || 0, duration || audioProgress || 0);

  return (
    <div className="message-audio">
      <button
        type="button"
        className={[
          "audio-play-button",
          audioPlaying ? "is-playing" : ""
        ].join(" ")}
        onClick={onToggle}
      />

      <div className="audio-main">
        <div className="audio-title">
          {attachment.name || "Аудио"}
        </div>

        <div className="audio-progress-line">
          <input
            className="audio-range"
            type="range"
            min="0"
            max={duration || Math.max(progress, 1)}
            step="0.01"
            value={progress}
            onChange={onSeek}
            onInput={onSeek}
          />
        </div>

        <div className="audio-meta">
          <span className="audio-meta-left">
            <span>
              {formatDuration(
                audioStarted
                  ? progress
                  : duration
              )}
            </span>

            {!audioStarted && attachmentSizeText && (
              <span>
                {attachmentSizeText}
              </span>
            )}
          </span>

          {footer && (
            <span className="audio-footer-slot">
              {footer}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
