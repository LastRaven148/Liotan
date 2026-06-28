import {
  useEffect,
  useState
} from "react";

export default function useMessageAudioState({
  messageId
}) {
  const [audioPlaying, setAudioPlaying] =
    useState(false);

  const [audioStarted, setAudioStarted] =
    useState(false);

  const [audioProgress, setAudioProgress] =
    useState(0);

  const [audioDuration, setAudioDuration] =
    useState(0);

  useEffect(() => {
    function handleGlobalAudioState(e) {
      const state =
        e.detail;

      if (!state?.messageId) {
        setAudioPlaying(false);
        setAudioStarted(false);
        setAudioProgress(0);
        return;
      }

      if (state.messageId !== messageId) {
        setAudioPlaying(false);
        setAudioStarted(false);
        setAudioProgress(0);
        return;
      }

      setAudioStarted(true);
      setAudioPlaying(Boolean(state.playing));
      setAudioProgress(Number(state.progress) || 0);

      if (Number.isFinite(state.duration)) {
        setAudioDuration(state.duration);
      }
    }

    window.addEventListener(
      "liotan:audio-state",
      handleGlobalAudioState
    );

    return () => {
      window.removeEventListener(
        "liotan:audio-state",
        handleGlobalAudioState
      );
    };
  }, [
    messageId
  ]);

  return {
    audioPlaying,
    audioStarted,
    audioProgress,
    audioDuration,
    setAudioProgress,
    setAudioDuration
  };
}