import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import { createPortal } from "react-dom";

import { mediaUrl } from "../../utils/mediaUrl";

function getAudioSource(value) {
  if (!value) return "";
  if (String(value).startsWith("blob:")) return value;
  return mediaUrl(value);
}

function formatDuration(value) {
  if (!Number.isFinite(value)) return "0:00";
  const total = Math.max(0, Math.floor(value));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}


function PrevIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12.7 7.1v9.8L7.2 12l5.5-4.9Z" fill="currentColor" />
      <path d="M18.1 7.1v9.8L12.6 12l5.5-4.9Z" fill="currentColor" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M11.3 7.1v9.8L16.8 12l-5.5-4.9Z" fill="currentColor" />
      <path d="M5.9 7.1v9.8L11.4 12 5.9 7.1Z" fill="currentColor" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 7.35v9.3c0 .55.62.87 1.07.55l6.43-4.65a.68.68 0 0 0 0-1.1L10.07 6.8A.66.66 0 0 0 9 7.35Z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="8" y="6.5" width="3" height="11" rx="1" fill="currentColor" />
      <rect x="13" y="6.5" width="3" height="11" rx="1" fill="currentColor" />
    </svg>
  );
}

function VolumeIcon({ muted }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4.5 9.3v5.4h3.1l4.7 3.7V5.6L7.6 9.3H4.5Z" fill="currentColor" />
      {muted ? (
        <>
          <path d="M16 9l4 4m0-4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M15.2 9.2c.8.8 1.2 1.8 1.2 2.8s-.4 2-1.2 2.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M17.6 6.8a7.2 7.2 0 0 1 0 10.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7.2 7.5h8.1c2 0 3.7 1.6 3.7 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.4 4.9 18.2 7.5l-2.8 2.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.8 16.5H8.7c-2 0-3.7-1.6-3.7-3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.6 19.1 5.8 16.5l2.8-2.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7.5 7.5 16.5 16.5M16.5 7.5 7.5 16.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function normalizeSpeed(value) {
  if (value === 1) return "1x";
  return `${String(value).replace(".", ",")}x`;
}

export default function AudioPlayer() {
  const audioRef = useRef(null);
  const trackRef = useRef(null);
  const [track, setTrack] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const durationRef = useRef(0);
  const progressRef = useRef(0);
  const [muted, setMuted] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    trackRef.current = track;
  }, [track]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  const emitAudioState = useCallback((next = {}) => {
    const currentTrack = next.track || trackRef.current;

    if (!currentTrack?.messageId) {
      window.dispatchEvent(new CustomEvent("liotan:audio-state", {
        detail: {
          messageId: null,
          playing: false,
          progress: 0,
          duration: 0
        }
      }));
      return;
    }

    window.dispatchEvent(new CustomEvent("liotan:audio-state", {
      detail: {
        messageId: currentTrack.messageId,
        playing: next.playing ?? playing,
        progress: next.progress ?? progressRef.current,
        duration: next.duration ?? durationRef.current
      }
    }));
  }, [playing]);

  const closePlayer = useCallback(() => {
    const audio = audioRef.current;

    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }

    setTrack(null);
    trackRef.current = null;
    setPlaying(false);
    progressRef.current = 0;
    durationRef.current = 0;
    setProgress(0);
    setDuration(0);

    emitAudioState({
      track: null,
      playing: false,
      progress: 0,
      duration: 0
    });
  }, [emitAudioState]);

  const startTrack = useCallback((nextTrack) => {
    const audio = audioRef.current;
    if (!audio || !nextTrack?.url) return;

    setTrack(nextTrack);
    trackRef.current = nextTrack;
    progressRef.current = 0;
    setProgress(0);

    const nextDuration = Number(nextTrack.duration) || 0;
    durationRef.current = nextDuration;
    setDuration(nextDuration);

    audio.src = getAudioSource(nextTrack.url);
    audio.currentTime = 0;
    audio.playbackRate = speed;
    audio.muted = muted;
    audio.loop = repeat;
    audio.play().catch(() => {
      setPlaying(false);
      emitAudioState({
        track: nextTrack,
        playing: false,
        progress: 0,
        duration: nextDuration
      });
    });

    emitAudioState({
      track: nextTrack,
      playing: true,
      progress: 0,
      duration: nextDuration
    });
  }, [emitAudioState, muted, repeat, speed]);

  useEffect(() => {
    function handlePlayAudio(e) {
      const nextTrack = e.detail;
      if (!nextTrack?.url) return;

      const audio = audioRef.current;
      if (!audio) return;

      const currentTrack = trackRef.current;

      if (currentTrack?.messageId === nextTrack.messageId) {
        if (audio.paused) {
          audio.play().catch(() => {});
        } else {
          audio.pause();
        }
        return;
      }

      startTrack(nextTrack);
    }

    window.addEventListener("liotan:play-audio", handlePlayAudio);
    return () => window.removeEventListener("liotan:play-audio", handlePlayAudio);
  }, [startTrack]);

  useEffect(() => {
    function handleSeekAudio(e) {
      const data = e.detail;
      const currentTrack = trackRef.current;

      if (!data || data.messageId !== currentTrack?.messageId) return;

      const audio = audioRef.current;
      if (!audio) return;

      const nextTime = Number(data.time) || 0;
      audio.currentTime = nextTime;
      progressRef.current = nextTime;
      setProgress(nextTime);
      emitAudioState({ track: currentTrack, progress: nextTime });
    }

    window.addEventListener("liotan:seek-audio", handleSeekAudio);
    return () => window.removeEventListener("liotan:seek-audio", handleSeekAudio);
  }, [emitAudioState]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = muted;
    audio.loop = repeat;
    audio.playbackRate = speed;
  }, [muted, repeat, speed]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !trackRef.current) return;

    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }

  function playByOffset(offset) {
    const currentTrack = trackRef.current;
    const playlist = currentTrack?.playlist || [];
    const currentIndex = playlist.findIndex(item => item.messageId === currentTrack?.messageId);
    const nextTrack = playlist[currentIndex + offset];

    if (nextTrack?.url) {
      startTrack({ ...nextTrack, playlist });
    }
  }

  function playNextOrClose() {
    const currentTrack = trackRef.current;
    const playlist = currentTrack?.playlist || [];
    const currentIndex = playlist.findIndex(item => item.messageId === currentTrack?.messageId);
    const nextTrack = playlist[currentIndex + 1];

    if (nextTrack?.url) {
      startTrack({ ...nextTrack, playlist });
      return;
    }

    closePlayer();
  }

  function toggleSpeed() {
    const speeds = [1, 1.5, 2];
    const currentIndex = speeds.indexOf(speed);
    setSpeed(speeds[currentIndex === speeds.length - 1 ? 0 : currentIndex + 1]);
  }

  function renderTopbar() {
    if (!track) return null;

    return createPortal(
      <div className="audio-topbar">
        <div className="audio-topbar-controls">
          <button type="button" className="audio-topbar-button audio-topbar-prev" onClick={() => playByOffset(-1)} aria-label="Предыдущий"><PrevIcon /></button>
          <button
            type="button"
            className={["audio-topbar-button", "audio-topbar-play", playing ? "is-playing" : ""].join(" ")}
            onClick={togglePlay}
            aria-label={playing ? "Пауза" : "Воспроизвести"}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button type="button" className="audio-topbar-button audio-topbar-next" onClick={() => playByOffset(1)} aria-label="Следующий"><NextIcon /></button>
        </div>

        <div className="audio-topbar-main">
          <div className="audio-topbar-title">{track.name || "Аудио"}</div>
          <div className="audio-topbar-subtitle">
            <span>{formatDuration(progress)}</span>
            {track.artist && <span> · {track.artist}</span>}
          </div>
        </div>

        <div className="audio-topbar-actions">
          <button
            type="button"
            className={["audio-topbar-button", "audio-topbar-mute", muted ? "is-active" : ""].join(" ")}
            onClick={() => setMuted(value => !value)}
            aria-label={muted ? "Включить звук" : "Выключить звук"}
          >
            <VolumeIcon muted={muted} />
          </button>
          <button type="button" className="audio-topbar-speed" onClick={toggleSpeed}>{normalizeSpeed(speed)}</button>
          <button
            type="button"
            className={["audio-topbar-button", "audio-topbar-repeat", repeat ? "is-active" : ""].join(" ")}
            onClick={() => setRepeat(value => !value)}
            aria-label="Повтор"
          >
            <RepeatIcon />
          </button>
          <button type="button" className="audio-topbar-button audio-topbar-close" onClick={closePlayer} aria-label="Закрыть"><CloseIcon /></button>
        </div>
      </div>,
      document.body
    );
  }

  return (
    <>
      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => {
          setPlaying(true);
          emitAudioState({ playing: true });
        }}
        onPause={() => {
          setPlaying(false);
          emitAudioState({ playing: false });
        }}
        onLoadedMetadata={(e) => {
          const nativeDuration = Number(e.currentTarget.duration);
          const fallbackDuration = Number(trackRef.current?.duration) || durationRef.current || 0;
          const nextDuration = Number.isFinite(nativeDuration) && nativeDuration > 0 ? nativeDuration : fallbackDuration;
          durationRef.current = nextDuration;
          setDuration(nextDuration);
          emitAudioState({ duration: nextDuration });
        }}
        onTimeUpdate={(e) => {
          const current = Number(e.currentTarget.currentTime) || 0;
          const knownDuration = durationRef.current || Number(trackRef.current?.duration) || 0;
          const nextProgress = knownDuration > 0 ? Math.min(current, knownDuration) : current;
          progressRef.current = nextProgress;
          setProgress(nextProgress);
          emitAudioState({ progress: nextProgress, duration: knownDuration || durationRef.current });
        }}
        onEnded={() => {
          if (!repeat) playNextOrClose();
        }}
      />
      {renderTopbar()}
    </>
  );
}
