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
          <button type="button" className="audio-topbar-button audio-topbar-prev" onClick={() => playByOffset(-1)} aria-label="Предыдущий" />
          <button
            type="button"
            className={["audio-topbar-button", "audio-topbar-play", playing ? "is-playing" : ""].join(" ")}
            onClick={togglePlay}
            aria-label={playing ? "Пауза" : "Воспроизвести"}
          />
          <button type="button" className="audio-topbar-button audio-topbar-next" onClick={() => playByOffset(1)} aria-label="Следующий" />
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
          />
          <button type="button" className="audio-topbar-speed" onClick={toggleSpeed}>{normalizeSpeed(speed)}</button>
          <button
            type="button"
            className={["audio-topbar-button", "audio-topbar-repeat", repeat ? "is-active" : ""].join(" ")}
            onClick={() => setRepeat(value => !value)}
            aria-label="Повтор"
          />
          <button type="button" className="audio-topbar-button audio-topbar-close" onClick={closePlayer} aria-label="Закрыть" />
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
