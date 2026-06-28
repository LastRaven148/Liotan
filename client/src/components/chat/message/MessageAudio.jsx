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
  onToggle,
  onSeek
}) {
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
          {audioStarted ? (
            <input
              className="audio-range"
              type="range"
              min="0"
              max={audioDuration || 0}
              step="0.01"
              value={audioProgress}
              onChange={onSeek}
            />
          ) : (
            <div className="audio-range-placeholder" />
          )}
        </div>

        <div className="audio-meta">
          <span>
            {formatDuration(
              audioStarted
                ? audioProgress
                : audioDuration
            )}
          </span>

          {!audioStarted && attachmentSizeText && (
            <span>
              {attachmentSizeText}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
