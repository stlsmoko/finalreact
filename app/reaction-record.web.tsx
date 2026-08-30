import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { getCurrentSource, setCurrentReaction } from "@/lib/reaction-session";

const OUTPUT_WIDTH = 720;
const OUTPUT_HEIGHT = 1280;
const MIN_OVERLAY_SIZE = 96;
const MAX_OVERLAY_SIZE = 280;

type Overlay = { x: number; y: number; size: number };
type OverlayStyle = "circle" | "square" | "green-screen";

function clampOverlay(overlay: Overlay): Overlay {
  const size = Math.max(MIN_OVERLAY_SIZE, Math.min(MAX_OVERLAY_SIZE, overlay.size));
  return {
    size,
    x: Math.max(0, Math.min(OUTPUT_WIDTH - size, overlay.x)),
    y: Math.max(0, Math.min(OUTPUT_HEIGHT - size, overlay.y)),
  };
}

function preferredMimeType() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

function drawContained(context: CanvasRenderingContext2D, video: HTMLVideoElement) {
  const sourceWidth = video.videoWidth || OUTPUT_WIDTH;
  const sourceHeight = video.videoHeight || OUTPUT_HEIGHT;
  const scale = Math.min(OUTPUT_WIDTH / sourceWidth, OUTPUT_HEIGHT / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  context.fillStyle = "#000000";
  context.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  context.drawImage(video, (OUTPUT_WIDTH - width) / 2, (OUTPUT_HEIGHT - height) / 2, width, height);
}

export default function DesktopReactionRecordScreen() {
  const source = getCurrentSource();
  const sourceVideoRef = useRef<HTMLVideoElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const sourceAudioRef = useRef<MediaElementAudioSourceNode | null>(null);
  const microphoneAudioRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const sourceGainRef = useRef<GainNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const drawSceneRef = useRef<() => void>(() => undefined);
  const chunksRef = useRef<Blob[]>([]);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const [cameraReady, setCameraReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [status, setStatus] = useState("Choose Enable webcam & mic to prepare your Apple glass reaction studio.");
  const [overlay, setOverlay] = useState<Overlay>({ x: 486, y: 120, size: 180 });
  const [overlayStyle, setOverlayStyle] = useState<OverlayStyle>("circle");
  const [isSourcePaused, setIsSourcePaused] = useState(false);
  const [bgVolume, setBgVolume] = useState(0.35);
  const [micVolume, setMicVolume] = useState(1.4);
  const [audioMode, setAudioMode] = useState<"speaker" | "headphones" | "mute">("speaker");
  const [monitorVolume, setMonitorVolume] = useState(0.25);

  useEffect(() => {
    if (!source) router.replace("/");
  }, [source]);

  useEffect(() => {
    const sourceEl = sourceVideoRef.current;
    const cameraEl = cameraVideoRef.current;
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (sourceEl) {
        try {
          sourceEl.pause();
          sourceEl.removeAttribute("src");
          sourceEl.load();
        } catch {}
      }
      if (cameraEl) {
        try {
          cameraEl.pause();
        } catch {}
      }
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      audioContextRef.current?.close().catch(() => undefined);
    };
  }, []);

  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    const sourceVideo = sourceVideoRef.current;
    const cameraVideo = cameraVideoRef.current;
    if (!canvas || !sourceVideo) return;

    const context = canvas.getContext("2d");
    if (!context) return;
    drawContained(context, sourceVideo);

    if (cameraVideo?.readyState && cameraVideo.videoWidth) {
      context.save();
      const x = overlay.x;
      const y = overlay.y;
      const size = overlay.size;

      if (overlayStyle === "circle") {
        context.beginPath();
        context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
        context.clip();
      } else if (overlayStyle === "square") {
        context.beginPath();
        context.roundRect(x, y, size, size, 20);
        context.clip();
      }

      if (overlayStyle === "green-screen") {
        // Green screen chroma keying on canvas
        if (!offscreenCanvasRef.current) {
          const off = document.createElement("canvas");
          off.width = size;
          off.height = size;
          offscreenCanvasRef.current = off;
        }
        const off = offscreenCanvasRef.current;
        if (off.width !== size || off.height !== size) {
          off.width = size;
          off.height = size;
        }
        const offCtx = off.getContext("2d");
        if (offCtx) {
          offCtx.clearRect(0, 0, size, size);
          offCtx.save();
          offCtx.translate(size, 0);
          offCtx.scale(-1, 1);
          offCtx.drawImage(cameraVideo, 0, 0, size, size);
          offCtx.restore();

          const imgData = offCtx.getImageData(0, 0, size, size);
          const data = imgData.data;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            // Simple chroma key for green background
            if (g > 85 && g > r * 1.25 && g > b * 1.25) {
              data[i + 3] = 0; // make transparent
            }
          }
          offCtx.putImageData(imgData, 0, 0);
          context.drawImage(off, x, y);
        }
      } else {
        context.translate(x + size, y);
        context.scale(-1, 1);
        context.drawImage(cameraVideo, 0, 0, size, size);
      }

      context.restore();

      if (overlayStyle !== "green-screen") {
        context.save();
        context.lineWidth = 6;
        context.strokeStyle = "rgba(255, 255, 255, 0.9)";
        if (overlayStyle === "circle") {
          context.beginPath();
          context.arc(x + size / 2, y + size / 2, size / 2 - 3, 0, Math.PI * 2);
          context.stroke();
        } else if (overlayStyle === "square") {
          context.beginPath();
          context.roundRect(x + 3, y + 3, size - 6, size - 6, 17);
          context.stroke();
        }
        context.restore();
      }
    }

    frameRef.current = requestAnimationFrame(() => drawSceneRef.current());
  }, [overlay, overlayStyle]);

  useEffect(() => {
    drawSceneRef.current = drawScene;
  }, [drawScene]);

  useEffect(() => {
    if (sourceVideoRef.current?.readyState) drawScene();
  }, [drawScene]);

  async function enableCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("This browser cannot access a webcam. Use a current desktop Chrome, Edge, or Firefox browser.");
      return;
    }
    setPreparing(true);
    setStatus("Requesting webcam and microphone access…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          channelCount: 1,
        },
      });
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = stream;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        await cameraVideoRef.current.play();
      }
      setCameraReady(true);
      setStatus("Webcam and microphone are ready with Apple glass UI. Drag the reaction bubble, scroll to resize, then Start recording.");
      drawScene();
    } catch (error) {
      setStatus(`Webcam or microphone access failed: ${error instanceof Error ? error.message : "unknown browser error"}`);
    } finally {
      setPreparing(false);
    }
  }

  async function ensureAudioGraph() {
    const sourceVideo = sourceVideoRef.current;
    const cameraStream = cameraStreamRef.current;
    if (!sourceVideo || !cameraStream) throw new Error("The source video or webcam is not ready.");

    const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextClass = audioWindow.AudioContext || audioWindow.webkitAudioContext;
    if (!AudioContextClass) throw new Error("This browser cannot mix source and microphone audio.");
    const context = audioContextRef.current ?? new AudioContextClass();
    audioContextRef.current = context;
    const destination = audioDestinationRef.current ?? context.createMediaStreamDestination();
    audioDestinationRef.current = destination;

    if (!compressorRef.current) {
      const comp = context.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-12, context.currentTime);
      comp.ratio.setValueAtTime(3.5, context.currentTime);
      comp.connect(destination);
      compressorRef.current = comp;
    }
    const compressor = compressorRef.current;

    // Background Reel Recorded Audio Track
    if (!sourceGainRef.current) {
      const sGain = context.createGain();
      sGain.gain.value = bgVolume;
      sourceGainRef.current = sGain;
      sGain.connect(compressor);
    } else {
      sourceGainRef.current.gain.setValueAtTime(bgVolume, context.currentTime);
    }

    // Live Device Speaker / Earphone Monitor Gain
    const effectiveMonVol = audioMode === "mute" ? 0 : audioMode === "headphones" ? 1.0 : monitorVolume;
    if (!monitorGainRef.current) {
      const monGain = context.createGain();
      monGain.gain.value = effectiveMonVol;
      monitorGainRef.current = monGain;
      monGain.connect(context.destination);
    } else {
      monitorGainRef.current.gain.setValueAtTime(effectiveMonVol, context.currentTime);
    }

    // Microphone Audio Track (Voice)
    if (!micGainRef.current) {
      const hp = context.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.setValueAtTime(80, context.currentTime);

      const mGain = context.createGain();
      mGain.gain.value = micVolume;
      micGainRef.current = mGain;

      hp.connect(mGain);
      mGain.connect(compressor);

      const micSource = context.createMediaStreamSource(cameraStream);
      microphoneAudioRef.current = micSource;
      micSource.connect(hp);
    } else {
      micGainRef.current.gain.setValueAtTime(micVolume, context.currentTime);
    }

    // Attach video source cleanly to recorded track and speaker monitor
    if (!sourceAudioRef.current) {
      try {
        const srcNode = context.createMediaElementSource(sourceVideo);
        sourceAudioRef.current = srcNode;
        srcNode.connect(sourceGainRef.current);
        srcNode.connect(monitorGainRef.current);
      } catch (err) {
        console.warn("MediaElementSource note:", err);
      }
    }

    if (context.state === "suspended") await context.resume();
    return destination;
  }

  function handleBgVolumeChange(val: number) {
    setBgVolume(val);
    if (sourceGainRef.current && audioContextRef.current) {
      sourceGainRef.current.gain.setValueAtTime(val, audioContextRef.current.currentTime);
    }
  }

  function handleMicVolumeChange(val: number) {
    setMicVolume(val);
    if (micGainRef.current && audioContextRef.current) {
      micGainRef.current.gain.setValueAtTime(val, audioContextRef.current.currentTime);
    }
  }

  function handleMonitorVolumeChange(val: number) {
    setMonitorVolume(val);
    if (monitorGainRef.current && audioContextRef.current && audioMode === "speaker") {
      monitorGainRef.current.gain.setValueAtTime(val, audioContextRef.current.currentTime);
    }
  }

  function handleAudioModeChange(mode: "speaker" | "headphones" | "mute") {
    setAudioMode(mode);
    if (monitorGainRef.current && audioContextRef.current) {
      const vol = mode === "mute" ? 0 : mode === "headphones" ? 1.0 : monitorVolume;
      monitorGainRef.current.gain.setValueAtTime(vol, audioContextRef.current.currentTime);
    }
  }

  async function startRecording() {
    const sourceVideo = sourceVideoRef.current;
    const canvas = canvasRef.current;
    if (!cameraReady || !cameraStreamRef.current || !sourceVideo || !canvas) {
      setStatus("Enable webcam first, then wait for the source video preview to load.");
      return;
    }
    if (typeof MediaRecorder === "undefined" || !canvas.captureStream) {
      setStatus("This browser does not support desktop video export. Use current Chrome or Edge.");
      return;
    }

    setPreparing(true);
    setStatus("Preparing Apple glass reaction recording with mixed audio…");
    try {
      const destination = await ensureAudioGraph();
      sourceVideo.currentTime = 0;
      await sourceVideo.play();
      if (frameRef.current === null) drawScene();

      const visualStream = canvas.captureStream(30);
      const stream = new MediaStream([
        ...visualStream.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ]);
      const mimeType = preferredMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => setStatus("Desktop recording failed in the browser.");
      recorder.onstop = () => {
        if (frameRef.current !== null) {
          cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
        sourceVideo.pause();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
        if (blob.size < 1_024) {
          setStatus("Desktop recording stopped without enough video data. Try again.");
          setRecording(false);
          return;
        }
        const outputUri = URL.createObjectURL(blob);
        setCurrentReaction({ uri: outputUri, recordedAt: Date.now(), isComposite: true });
        setRecording(false);
        setStatus("Apple glass reaction created successfully. Opening review…");
        router.replace("/review" as never);
      };
      setIsSourcePaused(false);
      recorder.start(1_000);
      setRecording(true);
      setStatus("Recording live reaction with Apple glass UI, camera feed, and independent audio mix!");
    } catch (error) {
      setStatus(`Could not start recording: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      setPreparing(false);
    }
  }

  function toggleSourcePause() {
    const sourceVideo = sourceVideoRef.current;
    if (!recording || !sourceVideo) return;
    if (isSourcePaused) {
      sourceVideo.play().then(() => {
        setIsSourcePaused(false);
        setStatus("Background reel resumed while reaction recording continues.");
      }).catch((e) => {
        setStatus(`Could not resume clip: ${e instanceof Error ? e.message : "error"}`);
      });
    } else {
      sourceVideo.pause();
      setIsSourcePaused(true);
      setStatus("Background reel paused. Your webcam and mic continue recording so you can talk freely.");
    }
  }

  function stopRecording() {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;
    setIsSourcePaused(false);
    setStatus("Finalizing your Apple glass reaction video…");
    mediaRecorderRef.current.stop();
  }

  function moveBubble(event: React.PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !stageRef.current) return;
    const bounds = stageRef.current.getBoundingClientRect();
    const next = clampOverlay({
      ...overlay,
      x: ((event.clientX - bounds.left) / bounds.width) * OUTPUT_WIDTH - dragOffsetRef.current.x,
      y: ((event.clientY - bounds.top) / bounds.height) * OUTPUT_HEIGHT - dragOffsetRef.current.y,
    });
    setOverlay(next);
  }

  function startMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!stageRef.current) return;
    const bounds = stageRef.current.getBoundingClientRect();
    dragOffsetRef.current = {
      x: ((event.clientX - bounds.left) / bounds.width) * OUTPUT_WIDTH - overlay.x,
      y: ((event.clientY - bounds.top) / bounds.height) * OUTPUT_HEIGHT - overlay.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function resizeBubble(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    setOverlay((current) => clampOverlay({ ...current, size: current.size - event.deltaY * 0.45 }));
  }

  if (!source) return null;

  return (
    <main style={styles.page}>
      <section style={styles.content}>
        <header style={styles.header}>
          <div>
            <div style={styles.eyebrow}>REEL REACTOR · APPLE GLASS STUDIO</div>
            <h1 style={styles.title}>React with green screen & glass UI.</h1>
            <p style={styles.subtitle}>Professional reaction suite featuring live chroma keying, Apple glassmorphic translucency, and independent dual audio track mixing.</p>
          </div>
          <button type="button" onClick={() => router.replace("/")} style={styles.backButton}>Change video</button>
        </header>

        <div style={styles.studioGrid}>
          <div>
            <div ref={stageRef} style={styles.stage}>
              <video
                ref={sourceVideoRef}
                src={source.uri}
                crossOrigin="anonymous"
                preload="auto"
                playsInline
                onCanPlay={drawScene}
                onLoadedData={drawScene}
                onLoadedMetadata={drawScene}
                onTimeUpdate={drawScene}
                style={styles.sourcePreview}
              />
              <div
                style={{
                  ...styles.cameraBubble,
                  borderRadius: overlayStyle === "circle" ? "50%" : "22px",
                  left: `${(overlay.x / OUTPUT_WIDTH) * 100}%`,
                  top: `${(overlay.y / OUTPUT_HEIGHT) * 100}%`,
                  width: `${(overlay.size / OUTPUT_WIDTH) * 100}%`,
                  height: `${(overlay.size / OUTPUT_HEIGHT) * 100}%`,
                }}
                onPointerDown={startMove}
                onPointerMove={moveBubble}
                onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
                onWheel={resizeBubble}
              >
                <video ref={cameraVideoRef} muted playsInline style={{ ...styles.cameraPreview, display: cameraReady ? "block" : "none" }} />
                {!cameraReady ? <span style={styles.cameraPlaceholder}>Enable webcam</span> : null}
              </div>
              <span style={styles.dragHint}>Drag bubble to position · Scroll to resize</span>
            </div>
            <canvas ref={canvasRef} width={OUTPUT_WIDTH} height={OUTPUT_HEIGHT} style={styles.hiddenCanvas} />
          </div>

          <aside style={styles.controls}>
            <div style={styles.glassCard}>
              <span style={styles.sourceLabel}>SOURCE VIDEO</span>
              <strong style={styles.sourceName}>{source.name}</strong>
              <span style={styles.sourceNote}>Local file · Secure client session</span>
            </div>

            <div style={styles.glassCard}>
              <span style={styles.sourceLabel}>REACTION STYLE</span>
              <div style={styles.styleRow}>
                {(["circle", "square", "green-screen"] as OverlayStyle[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setOverlayStyle(st)}
                    style={{
                      ...styles.styleButton,
                      ...(overlayStyle === st ? styles.styleButtonActive : {}),
                    }}
                  >
                    {st === "circle" ? "Bubble" : st === "square" ? "Square" : "Green Screen"}
                  </button>
                ))}
              </div>
              {overlayStyle === "green-screen" && (
                <span style={styles.volumeHint}>Green screen mode keys out green backgrounds in real time for clean cutout reactions.</span>
              )}
            </div>

            <div style={styles.glassCard}>
              <span style={styles.sourceLabel}>AUDIO MIXER & ANTI-ECHO</span>
              
              <div style={styles.volumeRow}>
                <span style={styles.volumeLabelText}>Audio Listening Mode</span>
                <div style={styles.styleRow}>
                  <button
                    type="button"
                    onClick={() => handleAudioModeChange("speaker")}
                    style={{
                      ...styles.styleButton,
                      ...(audioMode === "speaker" ? styles.styleButtonActive : {}),
                    }}
                  >
                    🔊 Speakers
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAudioModeChange("headphones")}
                    style={{
                      ...styles.styleButton,
                      ...(audioMode === "headphones" ? styles.styleButtonActive : {}),
                    }}
                  >
                    🎧 Headphones
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAudioModeChange("mute")}
                    style={{
                      ...styles.styleButton,
                      ...(audioMode === "mute" ? styles.styleButtonActive : {}),
                    }}
                  >
                    🔇 Mute Live
                  </button>
                </div>
              </div>

              <div style={styles.volumeRow}>
                <div style={styles.volumeHeaderRow}>
                  <label htmlFor="web-bg-volume" style={styles.volumeLabelText}>Recorded Reel Volume</label>
                  <span style={styles.volumeValText}>{Math.round(bgVolume * 100)}%</span>
                </div>
                <input
                  id="web-bg-volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={bgVolume}
                  onChange={(e) => handleBgVolumeChange(parseFloat(e.target.value))}
                  style={styles.slider}
                />
              </div>

              <div style={styles.volumeRow}>
                <div style={styles.volumeHeaderRow}>
                  <label htmlFor="web-mic-volume" style={styles.volumeLabelText}>Reaction Mic Volume</label>
                  <span style={styles.volumeValText}>{Math.round((micVolume / 1.4) * 100)}%</span>
                </div>
                <input
                  id="web-mic-volume"
                  type="range"
                  min="0.1"
                  max="3.0"
                  step="0.05"
                  value={micVolume}
                  onChange={(e) => handleMicVolumeChange(parseFloat(e.target.value))}
                  style={styles.slider}
                />
              </div>

              {audioMode === "speaker" && (
                <div style={styles.volumeRow}>
                  <div style={styles.volumeHeaderRow}>
                    <label htmlFor="web-mon-volume" style={styles.volumeLabelText}>Live Speaker Level</label>
                    <span style={styles.volumeValText}>{Math.round(monitorVolume * 100)}%</span>
                  </div>
                  <input
                    id="web-mon-volume"
                    type="range"
                    min="0"
                    max="0.8"
                    step="0.01"
                    value={monitorVolume}
                    onChange={(e) => handleMonitorVolumeChange(parseFloat(e.target.value))}
                    style={styles.slider}
                  />
                </div>
              )}

              <span style={styles.volumeHint}>
                {audioMode === "speaker"
                  ? "Speaker mode applies active acoustic echo cancellation to stop background audio doubling into the mic."
                  : audioMode === "headphones"
                  ? "Headphones mode delivers high-fidelity direct audio monitoring with zero room bleed."
                  : "Mute mode silences live speaker output during recording while preserving the digital audio in the export."}
              </span>
            </div>

            <button type="button" disabled={cameraReady || preparing || recording} onClick={enableCamera} style={{ ...styles.secondaryButton, ...(cameraReady || preparing || recording ? styles.disabledButton : {}) }}>
              {cameraReady ? "Apple glass webcam ready" : preparing ? "Preparing webcam & mic…" : "Enable webcam + microphone"}
            </button>

            {recording ? (
              <button type="button" onClick={toggleSourcePause} style={styles.pauseButton}>
                {isSourcePaused ? "▶️ Resume background reel" : "⏸️ Pause background reel (Keep talking)"}
              </button>
            ) : null}

            <button type="button" disabled={!cameraReady || preparing} onClick={recording ? stopRecording : startRecording} style={{ ...styles.primaryButton, ...(!cameraReady || preparing ? styles.disabledButton : {}), ...(recording ? styles.stopButton : {}) }}>
              {recording ? "⏹️ Finish & Get Glass Reaction Video" : "Start recording"}
            </button>

            <div style={styles.statusCard}>
              <span style={styles.statusDot} />
              <span>{status}</span>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#080B11", color: "#F7F8FA", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', Inter, sans-serif" },
  content: { width: "min(1240px, calc(100% - 48px))", margin: "0 auto", padding: "48px 0 64px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 28, marginBottom: 32 },
  eyebrow: { color: "#38BDF8", fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", marginBottom: 10 },
  title: { fontSize: "clamp(32px, 4vw, 48px)", margin: 0, letterSpacing: "-0.03em", lineHeight: 1.1, fontWeight: 700 },
  subtitle: { maxWidth: 640, color: "#94A3B8", fontSize: 16, lineHeight: 1.5, margin: "14px 0 0" },
  backButton: { background: "rgba(255, 255, 255, 0.06)", backdropFilter: "blur(12px)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: 12, color: "#F7F8FA", cursor: "pointer", fontWeight: 600, padding: "12px 18px", transition: "all 0.2s" },
  studioGrid: { display: "grid", gridTemplateColumns: "minmax(340px, 640px) minmax(300px, 1fr)", alignItems: "start", gap: 32 },
  stage: { position: "relative", overflow: "hidden", width: "100%", aspectRatio: "9 / 16", maxHeight: "calc(100vh - 180px)", background: "#000", borderRadius: 28, border: "1px solid rgba(255, 255, 255, 0.18)", boxShadow: "0 30px 90px rgba(0,0,0,0.5)" },
  sourcePreview: { width: "100%", height: "100%", objectFit: "contain", background: "#000" },
  cameraBubble: { position: "absolute", display: "grid", placeItems: "center", overflow: "hidden", border: "4px solid rgba(255,255,255,0.95)", background: "rgba(23,30,43,0.85)", backdropFilter: "blur(16px)", cursor: "grab", touchAction: "none", boxShadow: "0 16px 40px rgba(0,0,0,0.6)" },
  cameraPreview: { width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", pointerEvents: "none" },
  cameraPlaceholder: { color: "#38BDF8", fontWeight: 700, fontSize: 12, textAlign: "center", padding: 10 },
  dragHint: { position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: 18, borderRadius: 999, background: "rgba(10, 14, 23, 0.8)", backdropFilter: "blur(16px)", border: "1px solid rgba(255, 255, 255, 0.15)", color: "#FFFFFF", fontSize: 12, fontWeight: 600, padding: "8px 16px", pointerEvents: "none" },
  hiddenCanvas: { display: "none" },
  controls: { display: "grid", gap: 14, position: "sticky", top: 28 },
  glassCard: { display: "grid", gap: 10, padding: 20, background: "rgba(255, 255, 255, 0.04)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255, 255, 255, 0.12)", borderRadius: 20, boxShadow: "0 10px 30px rgba(0,0,0,0.3)" },
  sourceLabel: { color: "#38BDF8", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em" },
  sourceName: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 15, fontWeight: 600 },
  sourceNote: { color: "#94A3B8", fontSize: 12 },
  styleRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 },
  styleButton: { background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 10, color: "#94A3B8", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "10px 6px", textAlign: "center" },
  styleButtonActive: { background: "#38BDF8", borderColor: "#38BDF8", color: "#080B11" },
  volumeRow: { display: "grid", gap: 6 },
  volumeHeaderRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  volumeLabelText: { fontSize: 13, fontWeight: 600, color: "#E2E8F0" },
  volumeValText: { fontSize: 13, fontWeight: 700, color: "#38BDF8" },
  slider: { width: "100%", accentColor: "#38BDF8", cursor: "pointer", height: 6 },
  volumeHint: { color: "#94A3B8", fontSize: 11, lineHeight: 1.4 },
  primaryButton: { width: "100%", border: 0, borderRadius: 16, background: "linear-gradient(135deg, #38BDF8 0%, #0284C7 100%)", color: "#FFFFFF", cursor: "pointer", fontSize: 16, fontWeight: 700, padding: "17px 18px", boxShadow: "0 8px 25px rgba(56, 189, 248, 0.3)" },
  pauseButton: { width: "100%", border: "1px solid rgba(56, 189, 248, 0.3)", borderRadius: 16, background: "rgba(56, 189, 248, 0.1)", color: "#38BDF8", cursor: "pointer", fontSize: 15, fontWeight: 600, padding: "15px 18px" },
  secondaryButton: { width: "100%", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: 16, background: "rgba(255, 255, 255, 0.06)", backdropFilter: "blur(12px)", color: "#F7F8FA", cursor: "pointer", fontSize: 15, fontWeight: 600, padding: "16px 18px" },
  stopButton: { background: "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)", color: "#FFFFFF", boxShadow: "0 8px 25px rgba(239, 68, 68, 0.3)" },
  disabledButton: { cursor: "not-allowed", opacity: 0.45 },
  statusCard: { display: "flex", gap: 10, alignItems: "center", padding: 14, borderRadius: 14, background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)", color: "#CBD5E1", fontSize: 13, lineHeight: 1.4 },
  statusDot: { flex: "0 0 auto", width: 8, height: 8, borderRadius: "50%", background: "#10B981" },
};
