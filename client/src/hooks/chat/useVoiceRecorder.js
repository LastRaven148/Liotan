import { useEffect, useRef, useState } from "react";

const MAX_VOICE_SECONDS = 300;
const RECORDING_OPTIONS = {
  mimeType: "audio/webm;codecs=opus"
};

function getSupportedMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  if (MediaRecorder.isTypeSupported?.(RECORDING_OPTIONS.mimeType)) {
    return RECORDING_OPTIONS.mimeType;
  }

  if (MediaRecorder.isTypeSupported?.("audio/ogg;codecs=opus")) {
    return "audio/ogg;codecs=opus";
  }

  if (MediaRecorder.isTypeSupported?.("audio/webm")) {
    return "audio/webm";
  }

  return "";
}

function getVoiceFileExtension(mimeType = "") {
  if (mimeType.includes("ogg")) {
    return "ogg";
  }

  if (mimeType.includes("mp4")) {
    return "m4a";
  }

  return "webm";
}

export default function useVoiceRecorder({
  onSendVoice
}) {
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);
  const analyserRef = useRef(null);
  const audioContextRef = useRef(null);
  const waveformRef = useRef([]);
  const cancelledRef = useRef(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState("");
  const [sendingVoice, setSendingVoice] = useState(false);

  function stopTracks() {
    streamRef.current?.getTracks?.().forEach(track => track.stop());
    streamRef.current = null;
  }

  function resetRecordingState() {
    setIsRecording(false);
    setRecordingSeconds(0);
    chunksRef.current = [];
    startedAtRef.current = 0;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    stopTracks();
    if (audioContextRef.current) {
      audioContextRef.current.close?.();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }

  async function startRecording() {
    if (isRecording || sendingVoice) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingError("Запись голоса не поддерживается этим браузером");
      return;
    }

    try {
      setRecordingError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      cancelledRef.current = false;
      startedAtRef.current = Date.now();

      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          audioContextRef.current = ctx;
          analyserRef.current = analyser;
          waveformRef.current = [];
        }
      } catch {
        analyserRef.current = null;
        waveformRef.current = [];
      }

      recorder.ondataavailable = event => {
        if (event.data?.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const wasCancelled = cancelledRef.current;
        const chunks = chunksRef.current;
        const durationSeconds = Math.max(
          1,
          Math.round((Date.now() - startedAtRef.current) / 1000)
        );
        const waveform = normalizeWaveform(waveformRef.current);
        const finalMime = recorder.mimeType || mimeType || "audio/webm";
        resetRecordingState();

        if (wasCancelled || !chunks.length) {
          return;
        }

        try {
          setSendingVoice(true);
          const blob = new Blob(chunks, { type: finalMime });
          const ext = getVoiceFileExtension(finalMime);
          const file = new File(
            [blob],
            `voice-${Date.now()}.${ext}`,
            { type: finalMime }
          );
          await onSendVoice?.(file, durationSeconds, waveform);
        } finally {
          setSendingVoice(false);
        }
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
        sampleWaveform(analyserRef.current, waveformRef.current);
        setRecordingSeconds(seconds);
        if (seconds >= MAX_VOICE_SECONDS) {
          stopRecording();
        }
      }, 250);
    } catch (err) {
      resetRecordingState();
      setRecordingError("Не удалось получить доступ к микрофону");
    }
  }

  function cancelRecording() {
    cancelledRef.current = true;
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      return;
    }
    resetRecordingState();
  }

  function stopRecording() {
    cancelledRef.current = false;
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
      resetRecordingState();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isRecording,
    recordingSeconds,
    recordingError,
    sendingVoice,
    startRecording,
    stopRecording,
    cancelRecording
  };
}


function sampleWaveform(analyser, target) {
  if (!analyser || !Array.isArray(target)) return;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    const centered = (data[i] - 128) / 128;
    sum += centered * centered;
  }
  const rms = Math.sqrt(sum / data.length);
  target.push(Math.max(0, Math.min(1, rms * 5)));
}

function normalizeWaveform(values) {
  const source = Array.isArray(values) && values.length ? values : [0.04];
  const count = 28;
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const start = Math.floor((i / count) * source.length);
    const end = Math.max(start + 1, Math.floor(((i + 1) / count) * source.length));
    const chunk = source.slice(start, end);
    const average = chunk.reduce((sum, item) => sum + Number(item || 0), 0) / chunk.length;
    result.push(Number(Math.max(0.02, Math.min(1, average)).toFixed(2)));
  }
  return result;
}
