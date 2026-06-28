import {
  useEffect,
  useRef,
  useState
} from "react";

import { createPortal } from "react-dom";

import { mediaUrl } from "../../utils/mediaUrl";

function formatDuration(value) {
  if (!Number.isFinite(value)) {
    return "0:00";
  }

  const total =
    Math.floor(value);

  const minutes =
    Math.floor(total / 60);

  const seconds =
    String(total % 60).padStart(2, "0");

  return `${minutes}:${seconds}`;
}

export default function AudioPlayer() {
  const audioRef =
    useRef(null);

  const [track, setTrack] =
    useState(null);

  const [playing, setPlaying] =
    useState(false);

  const [progress, setProgress] =
    useState(0);

  const [duration, setDuration] =
    useState(0);

  const [muted, setMuted] =
    useState(false);

  const [repeat, setRepeat] =
    useState(false);

  const [speed, setSpeed] =
    useState(1);

  useEffect(() => {
    function handlePlayAudio(e) {
      const nextTrack =
        e.detail;

      if (!nextTrack?.url) {
        return;
      }

      const audio =
        audioRef.current;

      if (!audio) {
        return;
      }

      if (
        track?.messageId === nextTrack.messageId
      ) {
        if (audio.paused) {
          audio.play();
        } else {
          audio.pause();
        }

        return;
      }

      setTrack(nextTrack);
      setProgress(0);
      setDuration(
        Number(nextTrack.duration) || 0
      );

      audio.src =
        mediaUrl(nextTrack.url);

      audio.playbackRate =
        speed;

      audio.muted =
        muted;

      audio.loop =
        repeat;

      audio.play();
    }

    window.addEventListener(
      "liotan:play-audio",
      handlePlayAudio
    );

    return () => {
      window.removeEventListener(
        "liotan:play-audio",
        handlePlayAudio
      );
    };
  }, [
    track,
    speed,
    muted,
    repeat
  ]);

  useEffect(() => {
    const audio =
      audioRef.current;

    if (!audio) {
      return;
    }

    audio.muted =
      muted;

    audio.loop =
      repeat;

    audio.playbackRate =
      speed;
  }, [
    muted,
    repeat,
    speed
  ]);

  function togglePlay() {
    const audio =
      audioRef.current;

    if (!audio || !track) {
      return;
    }

    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }
  }

  function closePlayer() {
    const audio =
      audioRef.current;

    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }

    setTrack(null);
    setPlaying(false);
    setProgress(0);
    setDuration(0);
  }

  function seekAudio(e) {
    const audio =
      audioRef.current;

    if (!audio || !duration) {
      return;
    }

    const nextTime =
      Number(e.target.value);

    audio.currentTime =
      nextTime;

    setProgress(nextTime);
  }

  function skipAudio(value) {
    const audio =
      audioRef.current;

    if (!audio || !duration) {
      return;
    }

    audio.currentTime =
      Math.max(
        0,
        Math.min(
          audio.currentTime + value,
          duration
        )
      );
  }

  function toggleSpeed() {
    const speeds =
      [1, 1.5, 2];

    const currentIndex =
      speeds.indexOf(speed);

    setSpeed(
      speeds[
        currentIndex === speeds.length - 1
          ? 0
          : currentIndex + 1
      ]
    );
  }

  function renderTopbar() {
    if (!track) {
      return null;
    }

    return createPortal(
      <div className="audio-topbar">
        <div className="audio-topbar-controls">
          <button
            type="button"
            className="audio-topbar-button audio-topbar-prev"
            onClick={() => skipAudio(-10)}
            aria-label="Назад"
          />

          <button
            type="button"
            className={[
              "audio-topbar-button",
              "audio-topbar-play",
              playing ? "is-playing" : ""
            ].join(" ")}
            onClick={togglePlay}
            aria-label={
              playing
                ? "Пауза"
                : "Воспроизвести"
            }
          />

          <button
            type="button"
            className="audio-topbar-button audio-topbar-next"
            onClick={() => skipAudio(10)}
            aria-label="Вперед"
          />
        </div>

        <div className="audio-topbar-main">
          <div className="audio-topbar-title">
            {track.name || "Аудио"}
          </div>

          <div className="audio-topbar-progress-row">
            <span className="audio-topbar-time">
              {formatDuration(progress)}
            </span>

            <input
              className="audio-topbar-range"
              type="range"
              min="0"
              max={duration || 0}
              step="0.01"
              value={progress}
              onChange={seekAudio}
            />

            <span className="audio-topbar-time">
              {formatDuration(duration)}
            </span>
          </div>
        </div>

        <div className="audio-topbar-actions">
          <button
            type="button"
            className={[
              "audio-topbar-button",
              "audio-topbar-mute",
              muted ? "is-active" : ""
            ].join(" ")}
            onClick={() =>
              setMuted(value => !value)
            }
            aria-label="Звук"
          />

          <button
            type="button"
            className="audio-topbar-speed"
            onClick={toggleSpeed}
          >
            {speed}x
          </button>

          <button
            type="button"
            className={[
              "audio-topbar-button",
              "audio-topbar-repeat",
              repeat ? "is-active" : ""
            ].join(" ")}
            onClick={() =>
              setRepeat(value => !value)
            }
            aria-label="Повтор"
          />

          <button
            type="button"
            className="audio-topbar-button audio-topbar-close"
            onClick={closePlayer}
            aria-label="Закрыть"
          />
        </div>
      </div>,
      document.body
    );
  }

    useEffect(() => {
    if (!track?.messageId) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent(
        "liotan:audio-state",
        {
          detail: {
            messageId: track.messageId,
            playing,
            progress,
            duration
          }
        }
      )
    );
  }, [
    track,
    playing,
    progress,
    duration
  ]);

  return (
    <>
      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() =>
          setPlaying(true)
        }
        onPause={() =>
          setPlaying(false)
        }
        onLoadedMetadata={(e) =>
          setDuration(
            Number.isFinite(e.currentTarget.duration)
              ? e.currentTarget.duration
              : 0
          )
        }
        onTimeUpdate={(e) =>
          setProgress(
            e.currentTarget.currentTime
          )
        }
         onEnded={() => {
          if (repeat) {
            return;
          }

          const playlist =
            track?.playlist || [];

          const currentIndex =
            playlist.findIndex(item =>
              item.messageId === track?.messageId
            );

          const nextTrack =
            playlist[currentIndex + 1];

          if (nextTrack?.url) {
            window.dispatchEvent(
              new CustomEvent(
                "liotan:play-audio",
                {
                  detail: {
                    ...nextTrack,
                    playlist
                  }
                }
              )
            );

            return;
          }

          setPlaying(false);
          setProgress(0);
        }}
      />

      {renderTopbar()}
    </>
  );
}