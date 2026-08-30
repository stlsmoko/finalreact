import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEvent } from "expo";
import { setAudioModeAsync } from "expo-audio";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { router, useIsFocused } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, LayoutChangeEvent, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { beginReactionCameraRecording, clampOverlayToRect, getContainedVideoRect, getRecordingStartBlocker, type OverlayPosition } from "@/lib/reaction-project";
import { getCurrentSource, setCurrentReaction } from "@/lib/reaction-session";
import { composeReactionVideo } from "@/lib/video-compositor";

const MIN_OVERLAY_SIZE = 96;
const MAX_OVERLAY_SIZE = 184;
type OverlayStyle = "circle" | "square" | "green-screen";
type SourcePause = { sourceTimeSec: number; durationSec: number };

function getTouchDistance(touches: { pageX: number; pageY: number }[]) {
  if (touches.length < 2) return 0;
  const [first, second] = touches;
  return Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY);
}

function formatRecordingTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const MIN_SOURCE_AUDIO_GAIN = 0;
const MAX_SOURCE_AUDIO_GAIN = 1;
const DEFAULT_SOURCE_AUDIO_GAIN = 0.12;

function BackgroundVolumeSlider({ value, onChange }: { value: number; onChange: (nextValue: number) => void }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      if (trackWidth > 0) onChange(Math.max(MIN_SOURCE_AUDIO_GAIN, Math.min(MAX_SOURCE_AUDIO_GAIN, (event.nativeEvent.locationX / trackWidth) * MAX_SOURCE_AUDIO_GAIN)));
    },
    onPanResponderMove: (event) => {
      if (trackWidth > 0) onChange(Math.max(MIN_SOURCE_AUDIO_GAIN, Math.min(MAX_SOURCE_AUDIO_GAIN, (event.nativeEvent.locationX / trackWidth) * MAX_SOURCE_AUDIO_GAIN)));
    },
  }), [onChange, trackWidth]);
  const percentage = Math.round((value / MAX_SOURCE_AUDIO_GAIN) * 100);

  return (
    <View style={styles.volumeSliderWrap}>
      <View onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)} style={styles.volumeTrack} {...panResponder.panHandlers}>
        <View pointerEvents="none" style={[styles.volumeTrackFill, { width: `${percentage}%` }]} />
        <View pointerEvents="none" style={[styles.volumeThumb, { left: `${percentage}%` }]} />
      </View>
    </View>
  );
}

export default function ReactionRecordScreen() {
  const source = getCurrentSource();
  const isBrowserPreview = Platform.OS === "web";
  const isFocused = useIsFocused();
  const cameraRef = useRef<CameraView>(null);
  const { height, width } = useWindowDimensions();
  const player = useVideoPlayer(source?.uri ?? null, (videoPlayer) => {
    videoPlayer.loop = false;
    videoPlayer.audioMixingMode = "mixWithOthers";
    videoPlayer.volume = DEFAULT_SOURCE_AUDIO_GAIN;
    videoPlayer.timeUpdateEventInterval = 0.1;
  });
  const playerRef = useRef(player);
  const timeUpdate = useEvent(player, "timeUpdate", {
    currentTime: 0,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });
  const observedSourceTime = timeUpdate?.currentTime ?? 0;
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<"front" | "back">("front");
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<"permission" | "starting" | "ready" | "error">("permission");
  const [cameraInstanceKey, setCameraInstanceKey] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isCompositing, setIsCompositing] = useState(false);
  const [recordingElapsedSeconds, setRecordingElapsedSeconds] = useState(0);
  const [recordingStatus, setRecordingStatus] = useState("Preparing camera and microphone…");
  const [isCleanScene] = useState(false);
  const [overlaySize, setOverlaySize] = useState(132);
  const [overlayPosition, setOverlayPosition] = useState<OverlayPosition>({ x: width - 154, y: 126 });
  const [overlayGestureStatus, setOverlayGestureStatus] = useState("Drag to move • pinch to resize");
  const [overlayStyle, setOverlayStyle] = useState<OverlayStyle>("circle");
  const [isDockExpanded, setIsDockExpanded] = useState(false);
  const [studioSize, setStudioSize] = useState({ width, height });
  const [isSourcePaused, setIsSourcePaused] = useState(false);
  const [sourceAudioGain, setSourceAudioGain] = useState(DEFAULT_SOURCE_AUDIO_GAIN);
  const sourceAudioGainRef = useRef(DEFAULT_SOURCE_AUDIO_GAIN);
  const [, setSourcePauses] = useState<SourcePause[]>([]);
  const recordAttempt = useRef(0);
  const dragStart = useRef<OverlayPosition>(overlayPosition);
  const overlayPositionRef = useRef<OverlayPosition>(overlayPosition);
  const overlaySizeRef = useRef(overlaySize);
  const pinchStartSize = useRef(overlaySize);
  const pinchStartDistance = useRef(0);
  const isPinching = useRef(false);
  const sourcePauseStart = useRef<{ sourceTimeSec: number; wallTimeMs: number } | null>(null);
  const sourceTimeRef = useRef(0);
  const sourcePausesRef = useRef<SourcePause[]>([]);
  const isRecordingRef = useRef(false);
  const isCompositingRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const recordingStartedAtMsRef = useRef<number | null>(null);
  const recordingStopDurationSecRef = useRef<number | null>(null);
  const dockHeight = Math.max(230, Math.min(studioSize.height * 0.52, 470));
  const compactDockHeight = 82;
  const reservedDockHeight = !isCleanScene && !isRecording && !isCompositing && !isDockExpanded ? compactDockHeight : dockHeight;
  const sourceVideoRect = useMemo(
    () => getContainedVideoRect(studioSize, { width: source?.width, height: source?.height }),
    [source?.height, source?.width, studioSize],
  );
  const overlayRect = useMemo(() => ({
    ...sourceVideoRect,
    height: Math.max(0, Math.min(sourceVideoRect.height, studioSize.height - reservedDockHeight - sourceVideoRect.y - 12)),
  }), [reservedDockHeight, sourceVideoRect, studioSize.height]);

  useEffect(() => {
    if (Number.isFinite(observedSourceTime) && observedSourceTime >= 0) {
      sourceTimeRef.current = observedSourceTime;
    }
  }, [observedSourceTime]);

  function handleSourceAudioGainChange(nextValue: number) {
    const boundedValue = Math.max(MIN_SOURCE_AUDIO_GAIN, Math.min(MAX_SOURCE_AUDIO_GAIN, nextValue));
    sourceAudioGainRef.current = boundedValue;
    setSourceAudioGain(boundedValue);
    if (!isSourcePaused && !isCompositing) {
      playerRef.current.volume = boundedValue;
    }
  }

  useEffect(() => {
    if (!isSourcePaused && !isCompositing) playerRef.current.volume = sourceAudioGainRef.current;
  }, [isCompositing, isSourcePaused, sourceAudioGain]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    isCompositingRef.current = isCompositing;
  }, [isCompositing]);

  useEffect(() => {
    if (!isRecording) return;
    const startedAt = Date.now();
    const timer = setInterval(() => setRecordingElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000)), 1_000);
    return () => clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    if (!source) router.replace("/");
  }, [source]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    setAudioModeAsync({
      allowsRecording: true,
      interruptionMode: "mixWithOthers",
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: false,
    }).catch(() => undefined);
    return () => {
      try {
        player.pause();
      } catch {
        // The hook owns player disposal; this guard only prevents a stale source player from sounding in review.
      }
      setAudioModeAsync({ allowsRecording: false, interruptionMode: "mixWithOthers", shouldRouteThroughEarpiece: false }).catch(() => undefined);
    };
  }, [player]);

  useEffect(() => {
    let isActive = true;

    async function openCameraPreview() {
      if (!cameraPermission?.granted) {
        const permission = await requestCameraPermission();
        if (isActive) {
          setCameraStatus(permission.granted ? "starting" : "permission");
          setRecordingStatus(permission.granted ? "Opening camera preview…" : "Camera permission is required to record.");
        }
        return;
      }
      setCameraStatus("starting");
      setRecordingStatus("Opening camera preview…");
    }

    openCameraPreview().catch(() => isActive && setCameraStatus("error"));
    return () => { isActive = false; };
  }, [cameraPermission?.granted, requestCameraPermission]);

  useEffect(() => {
    let isActive = true;

    async function prepareMicrophone() {
      if (microphonePermission?.granted) return;
      const permission = await requestMicrophonePermission();
      if (!permission.granted && isActive) {
        setRecordingStatus("Microphone permission is required to record your voice.");
        Alert.alert("Microphone needed", "Allow microphone access now so Start recording can capture your spoken reaction.");
      }
    }

    prepareMicrophone().catch(() => undefined);
    return () => { isActive = false; };
  }, [microphonePermission?.granted, requestMicrophonePermission]);

  useEffect(() => {
    overlayPositionRef.current = overlayPosition;
  }, [overlayPosition]);

  useEffect(() => {
    overlaySizeRef.current = overlaySize;
  }, [overlaySize]);

  useEffect(() => {
    setOverlayPosition((current) => clampOverlayToRect(current, overlayRect, overlaySizeRef.current));
  }, [overlayRect]);

  // React Native invokes these responder callbacks after a touch event, never during render.
  // eslint-disable-next-line react-hooks/refs
  const overlayResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !isRecording && !isCompositing,
    onStartShouldSetPanResponderCapture: () => !isRecording && !isCompositing,
    onMoveShouldSetPanResponder: () => !isRecording && !isCompositing,
    onMoveShouldSetPanResponderCapture: () => !isRecording && !isCompositing,
    onPanResponderGrant: (event) => {
      dragStart.current = overlayPositionRef.current;
      pinchStartDistance.current = getTouchDistance(event.nativeEvent.touches);
      pinchStartSize.current = overlaySizeRef.current;
      isPinching.current = pinchStartDistance.current > 0;
      if (pinchStartDistance.current > 0) {
        setOverlayGestureStatus("Resizing camera bubble");
      } else {
        setOverlayGestureStatus("Moving camera bubble");
      }
    },
    onPanResponderMove: (event, gestureState) => {
      const touchDistance = getTouchDistance(event.nativeEvent.touches);

      if (event.nativeEvent.touches.length > 1 && touchDistance > 0) {
        if (!isPinching.current) {
          isPinching.current = true;
          pinchStartDistance.current = touchDistance;
          pinchStartSize.current = overlaySizeRef.current;
          setOverlayGestureStatus("Resizing camera bubble");
          return;
        }
        const baseline = pinchStartDistance.current || touchDistance;
        const nextSize = Math.max(MIN_OVERLAY_SIZE, Math.min(MAX_OVERLAY_SIZE, Math.round(pinchStartSize.current * (touchDistance / baseline))));
        overlaySizeRef.current = nextSize;
        setOverlaySize(nextSize);
        setOverlayPosition((current) => clampOverlayToRect(current, overlayRect, nextSize));
        setOverlayGestureStatus("Resizing camera bubble");
        return;
      }

      if (isPinching.current) return;
      setOverlayPosition(clampOverlayToRect({ x: dragStart.current.x + gestureState.dx, y: dragStart.current.y + gestureState.dy }, overlayRect, overlaySizeRef.current));
      setOverlayGestureStatus("Moving camera bubble");
    },
    onPanResponderRelease: () => {
      isPinching.current = false;
      setOverlayGestureStatus("Camera bubble updated");
    },
    onPanResponderTerminate: () => {
      isPinching.current = false;
      setOverlayGestureStatus("Camera bubble updated");
    },
    onPanResponderTerminationRequest: () => false,
  }), [isCompositing, isRecording, overlayRect]);

  async function ensurePermissions() {
    const camera = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    const microphone = microphonePermission?.granted ? microphonePermission : await requestMicrophonePermission();
    return camera.granted && microphone.granted;
  }

  async function retryCameraPreview() {
    setIsCameraReady(false);
    setCameraStatus("starting");
    setRecordingStatus("Retrying camera preview…");
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        setCameraStatus("permission");
        return;
      }
    }
    setCameraInstanceKey((key) => key + 1);
  }

  function closeOpenSourcePause() {
    const activePause = sourcePauseStart.current;
    if (!activePause) return sourcePausesRef.current;
    const durationSec = Math.max(0, (Date.now() - activePause.wallTimeMs) / 1_000);
    const completed = [...sourcePausesRef.current, { sourceTimeSec: activePause.sourceTimeSec, durationSec }];
    sourcePauseStart.current = null;
    sourcePausesRef.current = completed;
    setSourcePauses(completed);
    setIsSourcePaused(false);
    return completed;
  }

  function requestStopRecording(reason: string) {
    if (!isRecordingRef.current || isCompositingRef.current || stopRequestedRef.current) return;
    stopRequestedRef.current = true;
    const recordingStartedAtMs = recordingStartedAtMsRef.current;
    recordingStopDurationSecRef.current = recordingStartedAtMs
      ? Math.max(0.1, (Date.now() - recordingStartedAtMs) / 1_000)
      : null;
    setRecordingStatus(reason);
    try {
      playerRef.current.volume = 0;
      player.pause();
      cameraRef.current?.stopRecording();
    } catch (error) {
      stopRequestedRef.current = false;
      setRecordingStatus(`Could not stop the recording: ${error instanceof Error ? error.message : "unknown camera error"}`);
      setIsRecording(false);
    }
  }

  function toggleSourcePause() {
    if (!isRecording || isCompositing) return;
    if (isSourcePaused) {
      closeOpenSourcePause();
      playerRef.current.volume = sourceAudioGain;
      player.play();
      setRecordingStatus("Reel resumed while your reaction recording continues.");
      return;
    }
    const stableSourceTime = Math.max(0, sourceTimeRef.current);
    playerRef.current.volume = 0;
    player.pause();
    sourcePauseStart.current = { sourceTimeSec: stableSourceTime, wallTimeMs: Date.now() };
    setIsSourcePaused(true);
    setRecordingStatus(`Reel paused at ${stableSourceTime.toFixed(1)}s. Your camera and microphone are still recording so you can talk over this moment.`);
  }

  async function toggleRecording() {
    const attempt = ++recordAttempt.current;
    setRecordingStatus(`${isRecording ? "Stop" : "Start"} request #${attempt} received.`);
    if (isRecording) {
      requestStopRecording("Finishing and saving your reaction…");
      return;
    }

    setRecordingStatus(`Start request #${attempt}: checking camera and microphone permissions…`);
    const granted = await ensurePermissions();
    if (!granted) {
      Alert.alert("Camera and microphone needed", "Allow both permissions so Reel Reactor can record your reaction with sound.");
      setRecordingStatus("Camera and microphone permission are required before recording can start.");
      return;
    }
    const recordingBlocker = getRecordingStartBlocker({
      platform: Platform.OS,
      cameraReady: isCameraReady,
      hasCameraRef: Boolean(cameraRef.current),
    });
    if (recordingBlocker) {
      setRecordingStatus(recordingBlocker);
      if (!isBrowserPreview) {
        setCameraStatus("starting");
        Alert.alert("Camera is still opening", recordingBlocker);
      }
      return;
    }

    const camera = cameraRef.current;
    if (!camera) {
      setCameraStatus("starting");
      setRecordingStatus("Camera preview is not ready yet. Wait for Ready to react, then tap Start recording.");
      return;
    }

    sourcePausesRef.current = [];
    setSourcePauses([]);
    sourcePauseStart.current = null;
    setIsSourcePaused(false);
    stopRequestedRef.current = false;
    setIsDockExpanded(false);
    setRecordingElapsedSeconds(0);
    if (Platform.OS !== "web") {
      await setAudioModeAsync({
        allowsRecording: true,
        interruptionMode: "mixWithOthers",
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
      }).catch(() => undefined);
    }
    playerRef.current.volume = sourceAudioGain;
    recordingStartedAtMsRef.current = Date.now();
    recordingStopDurationSecRef.current = null;
    setIsRecording(true);

    setRecordingStatus(`Start request #${attempt}: calling the native camera recorder…`);
    try {
      setRecordingStatus(`Start request #${attempt}: native recorder started. Tap Stop recording when you are finished.`);
      const recorded = await beginReactionCameraRecording({
        startCameraRecording: () => camera.recordAsync(),
        startSourcePlayback: async () => {
          player.currentTime = 0;
          sourceTimeRef.current = 0;
          playerRef.current.volume = sourceAudioGain;
          player.play();
        },
        onSourcePlaybackIssue: () => {
          setRecordingStatus("Your reaction camera is recording, but the source preview could not start. You can still tap Stop recording.");
        },
      });
      if (recorded?.uri) {
        const completedSourcePauses = closeOpenSourcePause();
        setIsCompositing(true);
        const styleLabel = overlayStyle === "circle" ? "Bubble" : overlayStyle === "square" ? "Square" : "Green key";
        setRecordingStatus(`Rendering ${styleLabel} style: source clip + reaction camera + audio…`);
        const compositeUri = await composeReactionVideo({
          sourceUri: source!.uri,
          reactionUri: recorded.uri,
          overlay: { ...overlayPosition, size: overlaySize },
          studioSize,
          sourceSize: { width: source?.width, height: source?.height },
          overlayStyle,
          sourcePauses: completedSourcePauses,
          stopDurationSec: recordingStopDurationSecRef.current ?? undefined,
          sourceAudioGain: sourceAudioGainRef.current,
          onProgress: (processedMs) => setRecordingStatus(`Rendering merged video… ${Math.floor(processedMs / 1000)}s processed`),
        });
        setCurrentReaction({ uri: compositeUri, recordedAt: Date.now(), isComposite: true });
        player.pause();
        setRecordingStatus("Combined reaction video created. Opening review…");
        router.replace("/review" as never);
      } else {
        setRecordingStatus("The camera stopped without saving a video. Tap Start recording to try again.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown native render error";
      setRecordingStatus(`Merged video failed: ${message}`);
      Alert.alert("Merged video failed", `${message}\n\nNo camera-only file was saved as the final reaction video.`);
    } finally {
      if (Platform.OS !== "web") {
        setAudioModeAsync({
          allowsRecording: false,
          interruptionMode: "mixWithOthers",
          playsInSilentMode: true,
          shouldRouteThroughEarpiece: false,
        }).catch(() => undefined);
      }
      playerRef.current.volume = sourceAudioGain;
      setIsRecording(false);
      setIsCompositing(false);
      recordingStartedAtMsRef.current = null;
      recordingStopDurationSecRef.current = null;
      stopRequestedRef.current = false;
    }
  }

  if (!source) return null;

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-black" safeAreaClassName="bg-black">
      <View onLayout={(event: LayoutChangeEvent) => {
        const { width: nextWidth, height: nextHeight } = event.nativeEvent.layout;
        if (nextWidth > 0 && nextHeight > 0) setStudioSize({ width: nextWidth, height: nextHeight });
      }} style={styles.canvas}>
        <VideoView style={StyleSheet.absoluteFill} player={player} contentFit="contain" nativeControls={false} surfaceType="textureView" />
        <View style={styles.scrim} pointerEvents="none" />

        {!isCleanScene ? <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} disabled={isRecording} hitSlop={12} style={({ pressed }) => [styles.roundControl, (pressed || isRecording) && styles.controlPressed]}>
            <MaterialIcons name="close" size={23} color="#FFFFFF" />
          </Pressable>
          <View style={styles.statusPill}>
            <View style={[styles.statusDot, isRecording && styles.recordingDot]} />
            <Text style={styles.statusLabel}>{isRecording ? "Recording reaction" : cameraStatus === "ready" ? "Ready to react" : "Opening camera"}</Text>
          </View>
          <Pressable onPress={() => {
            setIsCameraReady(false);
            setCameraStatus("starting");
            setCameraInstanceKey((key) => key + 1);
            setFacing((current) => current === "front" ? "back" : "front");
          }} disabled={isRecording} hitSlop={12} style={({ pressed }) => [styles.roundControl, (pressed || isRecording) && styles.controlPressed]}>
            <MaterialIcons name="flip-camera-android" size={22} color="#FFFFFF" />
          </Pressable>
        </View> : null}

        <View collapsable={false} pointerEvents="box-only" {...overlayResponder.panHandlers} style={[styles.reactionOverlay, { borderRadius: overlayStyle === "circle" ? overlaySize / 2 : 18, height: overlaySize, left: overlayPosition.x, top: overlayPosition.y, width: overlaySize }]}>
            {isFocused && cameraPermission?.granted ? (
              <>
                <CameraView
                  key={cameraInstanceKey}
                  ref={cameraRef}
                  style={[styles.camera, { borderRadius: overlayStyle === "circle" ? overlaySize / 2 : 15 }]}
                  pointerEvents="none"
                  facing={facing}
                  mode="video"
                  mute={false}
                onCameraReady={() => {
                  setIsCameraReady(true);
                  setCameraStatus("ready");
                  setRecordingStatus("Camera ready. Tap Start recording when you are ready.");
                }}
                onMountError={(error) => {
                  setIsCameraReady(false);
                  setCameraStatus("error");
                  setRecordingStatus(`Camera could not open: ${error.message || "unknown camera error"}`);
                    Alert.alert("Camera could not open", error.message || "Close other apps using the camera, then tap Retry camera.");
                  }}
                />
                <View collapsable={false} pointerEvents="none" style={styles.interactionSurface} />
              </>
            ) : (
              <View style={styles.permissionOverlay}>
                <MaterialIcons name="video-camera-front" size={28} color="#FF8A6B" />
                <Text style={styles.permissionOverlayText}>Allow camera to{`\n`}show your reaction</Text>
                <Pressable onPress={retryCameraPreview} style={({ pressed }) => [styles.cameraRetryButton, pressed && styles.cameraRetryPressed]}>
                  <Text style={styles.cameraRetryLabel}>Allow camera</Text>
                </Pressable>
              </View>
            )}
            {!isCleanScene ? <View pointerEvents="none" style={styles.dragBadge}>
              <MaterialIcons name="open-with" size={13} color="#FFFFFF" />
              <Text style={styles.dragBadgeLabel}>DRAG</Text>
            </View> : null}
        </View>

        {!isCleanScene && !isRecording && !isCompositing && !isDockExpanded ? <View style={styles.compactDock}>
          <Pressable onPress={() => setIsDockExpanded(true)} style={({ pressed }) => [styles.positionButton, pressed && styles.modePressed]}>
            <MaterialIcons name="tune" size={19} color="#FFFFFF" />
            <Text style={styles.positionButtonLabel}>Position & style</Text>
          </Pressable>
          <Pressable
            hitSlop={12}
            onPressIn={() => setRecordingStatus("Record control touched. Starting…")}
            onPress={toggleRecording}
            style={({ pressed }) => [styles.compactRecordButton, pressed && styles.recordPressed]}
          >
            <MaterialIcons name="fiber-manual-record" size={25} color="#FFFFFF" />
            <Text style={styles.compactRecordLabel}>Record</Text>
          </Pressable>
        </View> : null}

        {!isCleanScene && (isDockExpanded || isRecording || isCompositing) ? <View style={[styles.bottomDock, { height: dockHeight }]}>
          <ScrollView style={styles.controlScroll} contentContainerStyle={styles.controlScrollContent} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {!isRecording && !isCompositing ? <Pressable onPress={() => setIsDockExpanded(false)} style={({ pressed }) => [styles.fullScreenPreviewButton, pressed && styles.modePressed]}>
              <MaterialIcons name="fullscreen" size={17} color="#FFFFFF" />
              <Text style={styles.fullScreenPreviewLabel}>Full-screen positioning</Text>
            </Pressable> : null}
            <Text style={styles.instruction}>{isRecording ? "Your reaction is recording now — tap Stop recording when finished" : isCompositing ? "Creating your combined reaction video…" : overlayGestureStatus}</Text>
            {!isCompositing ? <View style={styles.volumeControl}>
              <View style={styles.volumeHeader}>
                <Text style={styles.volumeLabel}>BACKGROUND REEL AUDIO</Text>
                <Text style={styles.volumeValue}>{Math.round((sourceAudioGain / MAX_SOURCE_AUDIO_GAIN) * 100)}%</Text>
              </View>
              <BackgroundVolumeSlider value={sourceAudioGain} onChange={handleSourceAudioGainChange} />
              <Text style={styles.volumeHint}>Lower the reel to keep your reaction clear. This level is used in the final export.</Text>
            </View> : null}
            {isRecording ? <Pressable onPress={toggleSourcePause} style={({ pressed }) => [styles.sourcePauseButton, pressed && styles.recordPressed]}>
              <MaterialIcons name={isSourcePaused ? "play-arrow" : "pause"} size={22} color="#FFFFFF" />
              <Text style={styles.sourcePauseLabel}>{isSourcePaused ? "Resume reel" : "Pause reel & talk"}</Text>
            </Pressable> : null}
            {!isRecording && !isCompositing ? <View style={styles.styleSelector}>
              <Text style={styles.styleSelectorLabel}>REACTION STYLE</Text>
              <View style={styles.styleRow}>
                {(["circle", "square", "green-screen"] as OverlayStyle[]).map((style) => <Pressable key={style} onPress={() => setOverlayStyle(style)} style={({ pressed }) => [styles.styleButton, overlayStyle === style && styles.styleButtonSelected, pressed && styles.modePressed]}>
                  <Text style={[styles.styleButtonLabel, overlayStyle === style && styles.styleButtonLabelSelected]}>{style === "circle" ? "Bubble" : style === "square" ? "Square" : "Green key"}</Text>
                </Pressable>)}
              </View>
              {overlayStyle === "green-screen" ? <Text style={styles.greenScreenHint}>Use an evenly lit, bright green background behind you. The export keys that green out; ordinary rooms cannot be removed by this mode.</Text> : null}
            </View> : null}
            <Pressable
              disabled={isCompositing}
              hitSlop={12}
              onPressIn={() => !isCompositing && setRecordingStatus("Record control touched. Starting…")}
              onPress={toggleRecording}
              style={({ pressed }) => [isRecording ? styles.stopRecordButton : styles.startRecordButton, (pressed || isCompositing) && styles.recordPressed]}
            >
              <MaterialIcons name={isCompositing ? "hourglass-top" : isRecording ? "stop" : isBrowserPreview ? "phone-android" : "fiber-manual-record"} size={isRecording ? 25 : 27} color={isRecording ? "#FF5C35" : "#FFFFFF"} />
              <Text style={isRecording ? styles.stopRecordLabel : styles.startRecordLabel}>{isCompositing ? "Creating reaction video…" : isRecording ? `Stop recording · ${formatRecordingTime(recordingElapsedSeconds)}` : isBrowserPreview ? "Record on phone" : "Start recording"}</Text>
            </Pressable>
            <View style={[styles.recordingStatusRow, isRecording && styles.recordingStatusActive]}>
              <MaterialIcons name={isRecording ? "fiber-manual-record" : "info-outline"} size={15} color={isRecording ? "#FFB199" : "#C1C9D4"} />
              <Text style={[styles.recordingStatusText, isRecording && styles.recordingStatusTextActive]}>{recordingStatus}</Text>
            </View>
            {cameraStatus === "error" ? <Pressable onPress={retryCameraPreview} style={({ pressed }) => [styles.retryCameraRow, pressed && styles.modePressed]}>
              <MaterialIcons name="refresh" size={16} color="#FFB199" />
              <Text style={styles.retryCameraLabel}>Retry camera</Text>
            </Pressable> : null}
            <Text style={styles.buildLabel}>{isBrowserPreview ? "BROWSER PREVIEW · RECORDING IS PHONE-ONLY" : "NATIVE COMPOSITE ONLY · v1.0.25"}</Text>
          </ScrollView>
        </View> : null}

      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  canvas: { backgroundColor: "#000000", flex: 1 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(3, 6, 10, 0.13)" },
  topBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 5 },
  roundControl: { alignItems: "center", backgroundColor: "rgba(12,16,24,0.72)", borderColor: "rgba(255,255,255,0.18)", borderRadius: 19, borderWidth: 1, height: 40, justifyContent: "center", width: 40 },
  controlPressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  statusPill: { alignItems: "center", backgroundColor: "rgba(12,16,24,0.75)", borderColor: "rgba(255,255,255,0.16)", borderRadius: 18, borderWidth: 1, flexDirection: "row", gap: 7, paddingHorizontal: 12, paddingVertical: 8 },
  statusDot: { backgroundColor: "#36C98A", borderRadius: 4, height: 7, width: 7 },
  recordingDot: { backgroundColor: "#FF5C35" },
  statusLabel: { color: "#F7F8FA", fontSize: 13, fontWeight: "700" },
  reactionOverlay: { borderColor: "#FFFFFF", borderWidth: 3, elevation: 8, overflow: "visible", position: "absolute", shadowColor: "#000000", shadowOpacity: 0.42, shadowRadius: 10 },
  camera: { borderRadius: 999, flex: 1, overflow: "hidden" },
  interactionSurface: { ...StyleSheet.absoluteFill, backgroundColor: "transparent", borderRadius: 999 },
  permissionOverlay: { alignItems: "center", backgroundColor: "#171E2B", borderRadius: 999, flex: 1, justifyContent: "center", overflow: "hidden" },
  permissionOverlayText: { color: "#F7F8FA", fontSize: 10, fontWeight: "700", lineHeight: 14, marginTop: 5, textAlign: "center" },
  cameraRetryButton: { backgroundColor: "#FF5C35", borderRadius: 9, marginTop: 9, paddingHorizontal: 9, paddingVertical: 6 },
  cameraRetryLabel: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  cameraRetryPressed: { opacity: 0.72 },
  dragBadge: { alignItems: "center", backgroundColor: "rgba(12,16,24,0.76)", borderRadius: 10, flexDirection: "row", gap: 3, left: "50%", marginLeft: -30, paddingHorizontal: 7, paddingVertical: 4, position: "absolute", top: -16 },
  dragBadgeLabel: { color: "#FFFFFF", fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  compactDock: { alignItems: "center", backgroundColor: "rgba(5,8,13,0.9)", borderTopColor: "rgba(255,255,255,0.14)", borderTopWidth: 1, bottom: 0, elevation: 30, flexDirection: "row", gap: 10, left: 0, paddingHorizontal: 12, paddingVertical: 12, position: "absolute", right: 0, zIndex: 30 },
  positionButton: { alignItems: "center", backgroundColor: "rgba(27,42,65,0.96)", borderColor: "rgba(255,255,255,0.34)", borderRadius: 15, borderWidth: 1, flex: 1, flexDirection: "row", gap: 7, height: 54, justifyContent: "center" },
  positionButtonLabel: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  compactRecordButton: { alignItems: "center", backgroundColor: "#FF5C35", borderColor: "rgba(255,255,255,0.92)", borderRadius: 15, borderWidth: 1, flexDirection: "row", gap: 6, height: 54, justifyContent: "center", paddingHorizontal: 17 },
  compactRecordLabel: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  bottomDock: { backgroundColor: "rgba(5,8,13,0.9)", borderTopColor: "rgba(255,255,255,0.14)", borderTopWidth: 1, bottom: 0, elevation: 30, left: 0, position: "absolute", right: 0, zIndex: 30 },
  controlScroll: { flex: 1, width: "100%" },
  controlScrollContent: { alignItems: "center", paddingBottom: 26, paddingHorizontal: 22, paddingTop: 12 },
  instruction: { color: "#FFFFFF", fontSize: 13, fontWeight: "600", marginBottom: 13, textAlign: "center", textShadowColor: "rgba(0,0,0,0.65)", textShadowRadius: 5 },
  fullScreenPreviewButton: { alignItems: "center", backgroundColor: "rgba(27,42,65,0.88)", borderColor: "rgba(255,255,255,0.28)", borderRadius: 11, borderWidth: 1, flexDirection: "row", gap: 5, marginBottom: 10, paddingHorizontal: 11, paddingVertical: 7 },
  fullScreenPreviewLabel: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  startRecordButton: { alignItems: "center", backgroundColor: "#FF5C35", borderColor: "rgba(255,255,255,0.95)", borderRadius: 18, borderWidth: 2, flexDirection: "row", gap: 10, height: 62, justifyContent: "center", width: "100%" },
  stopRecordButton: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#FF5C35", borderRadius: 18, borderWidth: 3, flexDirection: "row", gap: 10, height: 62, justifyContent: "center", width: "100%" },
  startRecordLabel: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" },
  stopRecordLabel: { color: "#FF5C35", fontSize: 17, fontWeight: "900" },
  recordingStatusRow: { alignItems: "center", backgroundColor: "rgba(12,16,24,0.82)", borderRadius: 10, flexDirection: "row", gap: 7, marginTop: 9, paddingHorizontal: 10, paddingVertical: 7, width: "100%" },
  recordingStatusActive: { borderColor: "rgba(255,92,53,0.75)", borderWidth: 1 },
  recordingStatusText: { color: "#C1C9D4", flex: 1, fontSize: 11, fontWeight: "600", lineHeight: 15 },
  recordingStatusTextActive: { color: "#FFDFD6" },
  volumeControl: { backgroundColor: "rgba(12,16,24,0.86)", borderColor: "rgba(255,255,255,0.16)", borderRadius: 14, borderWidth: 1, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 10, width: "100%" },
  volumeHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 7 },
  volumeLabel: { color: "#AAB3C2", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  volumeValue: { color: "#FFB199", fontSize: 12, fontWeight: "900" },
  volumeSliderWrap: { height: 32, justifyContent: "center", width: "100%" },
  volumeTrack: { backgroundColor: "#465267", borderRadius: 4, height: 7, position: "relative", width: "100%" },
  volumeTrackFill: { backgroundColor: "#FF5C35", borderRadius: 4, bottom: 0, left: 0, position: "absolute", top: 0 },
  volumeThumb: { backgroundColor: "#FFFFFF", borderColor: "#FFB199", borderRadius: 10, borderWidth: 2, height: 20, marginLeft: -10, position: "absolute", top: -7, width: 20 },
  volumeHint: { color: "#AAB3C2", fontSize: 10, lineHeight: 14, marginTop: 3 },
  sourcePauseButton: { alignItems: "center", backgroundColor: "rgba(27, 42, 65, 0.94)", borderColor: "rgba(255,255,255,0.48)", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 8, marginBottom: 10, paddingHorizontal: 16, paddingVertical: 11, width: "100%" },
  sourcePauseLabel: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  styleSelector: { backgroundColor: "rgba(12,16,24,0.86)", borderColor: "rgba(255,255,255,0.16)", borderRadius: 14, borderWidth: 1, marginBottom: 10, padding: 10, width: "100%" },
  styleSelectorLabel: { color: "#AAB3C2", fontSize: 10, fontWeight: "900", letterSpacing: 0.8, marginBottom: 8 },
  styleRow: { flexDirection: "row", gap: 7 },
  styleButton: { alignItems: "center", borderColor: "#465267", borderRadius: 10, borderWidth: 1, flex: 1, paddingHorizontal: 6, paddingVertical: 9 },
  styleButtonSelected: { backgroundColor: "#FF5C35", borderColor: "#FFB199" },
  styleButtonLabel: { color: "#C1C9D4", fontSize: 11, fontWeight: "800" },
  styleButtonLabelSelected: { color: "#FFFFFF" },
  greenScreenHint: { color: "#AAB3C2", fontSize: 10, lineHeight: 14, marginTop: 8 },
  buildLabel: { color: "#FFB199", fontSize: 10, fontWeight: "900", letterSpacing: 0.8, marginTop: 10 },
  retryCameraRow: { alignItems: "center", flexDirection: "row", gap: 5, marginTop: 8, paddingVertical: 3 },
  retryCameraLabel: { color: "#FFB199", fontSize: 12, fontWeight: "800" },
  modePressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  recordPressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  doneButton: { backgroundColor: "rgba(12,16,24,0.48)", borderRadius: 10, bottom: 12, paddingHorizontal: 10, paddingVertical: 6, position: "absolute", right: 12 },
  doneLabel: { color: "rgba(247,248,250,0.84)", fontSize: 11, fontWeight: "800" },
});
