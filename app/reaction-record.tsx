/* eslint-disable react-hooks/refs */
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEvent } from "expo";
import { setAudioModeAsync } from "expo-audio";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { router, useIsFocused } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import {
  beginReactionCameraRecording,
  clampOverlayToRect,
  getContainedVideoRect,
  getRecordingStartBlocker,
  type OverlayPosition,
} from "@/lib/reaction-project";
import { getCurrentSource, setCurrentReaction, setCurrentSource } from "@/lib/reaction-session";
import { composeReactionVideo } from "@/lib/video-compositor";
import SelfieCutoutNative from "selfie-cutout";

const MIN_OVERLAY_SIZE = 96;
const MAX_OVERLAY_SIZE = 220;
type OverlayStyle = "circle" | "square" | "cutout";
type SourcePause = { sourceTimeSec: number; durationSec: number };

function getTouchDistance(touches: { pageX: number; pageY: number }[]) {
  if (touches.length < 2) return 0;
  const [first, second] = touches;
  return Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY);
}

function formatRecordingTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

const DEFAULT_SOURCE_AUDIO_GAIN = 0.5;

function AppleAudioSlider({
  value,
  max = 100,
  onChange,
}: {
  value: number;
  max?: number;
  onChange: (val: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          if (trackWidth > 0) {
            const ratio = Math.max(0, Math.min(1, event.nativeEvent.locationX / trackWidth));
            onChange(Math.round(ratio * max));
          }
        },
        onPanResponderMove: (event) => {
          if (trackWidth > 0) {
            const ratio = Math.max(0, Math.min(1, event.nativeEvent.locationX / trackWidth));
            onChange(Math.round(ratio * max));
          }
        },
      }),
    [max, onChange, trackWidth]
  );
  const percentage = Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <View
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      style={styles.sliderTrack}
      {...panResponder.panHandlers}
    >
      <View pointerEvents="none" style={[styles.sliderTrackFill, { width: `${percentage}%` }]} />
      <View pointerEvents="none" style={[styles.sliderThumb, { left: `${percentage}%` }]} />
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
  const [, setCameraStatus] = useState<"permission" | "starting" | "ready" | "error">("permission");
  const [cameraInstanceKey, setCameraInstanceKey] = useState(0);

  const [isRecording, setIsRecording] = useState(false);
  const [isCompositing, setIsCompositing] = useState(false);
  const [recordingElapsedSeconds, setRecordingElapsedSeconds] = useState(0);
  const [recordingStatus, setRecordingStatus] = useState("Preparing camera and microphone…");

  const [overlaySize, setOverlaySize] = useState(140);
  const [overlayPosition, setOverlayPosition] = useState<OverlayPosition>({ x: width - 160, y: 80 });
  const [overlayStyle, setOverlayStyle] = useState<OverlayStyle>("circle");
  const [isCutoutReady, setIsCutoutReady] = useState(false);

  const [isAudioSheetOpen, setIsAudioSheetOpen] = useState(false);
  const [reelVolume, setReelVolume] = useState(18);
  const [micVolume, setMicVolume] = useState(220);
  const [isReelMuted, setIsReelMuted] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isAutoDucking, setIsAutoDucking] = useState(true);

  const [studioSize, setStudioSize] = useState({ width, height });
  const [isSourcePaused, setIsSourcePaused] = useState(false);
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
  const overlayStyleRef = useRef<OverlayStyle>(overlayStyle);
  const stopRequestedRef = useRef(false);
  const recordingStartedAtMsRef = useRef<number | null>(null);
  const recordingStopDurationSecRef = useRef<number | null>(null);

  const sourceVideoRect = useMemo(
    () => getContainedVideoRect(studioSize, { width: source?.width, height: source?.height }),
    [source?.height, source?.width, studioSize]
  );
  const overlayRect = useMemo(
    () => ({
      ...sourceVideoRect,
      height: Math.max(0, sourceVideoRect.height - 120),
    }),
    [sourceVideoRect]
  );

  useEffect(() => {
    if (Number.isFinite(observedSourceTime) && observedSourceTime >= 0) {
      sourceTimeRef.current = observedSourceTime;
    }
  }, [observedSourceTime]);

  const effectiveReelGain = isReelMuted ? 0 : reelVolume / 100;
  const effectiveMicGain = isMicMuted ? 0 : Math.max(0, Math.min(9, (micVolume / 100) * 3));
  const sourceAudioGainRef = useRef(effectiveReelGain);
  const reactionAudioGainRef = useRef(effectiveMicGain);

  useEffect(() => {
    sourceAudioGainRef.current = isAutoDucking ? effectiveReelGain * 0.7 : effectiveReelGain;
    reactionAudioGainRef.current = effectiveMicGain;
    if (!isSourcePaused && !isCompositing) {
      playerRef.current.volume = sourceAudioGainRef.current;
    }
  }, [effectiveMicGain, effectiveReelGain, isAutoDucking, isCompositing, isSourcePaused]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    isCompositingRef.current = isCompositing;
  }, [isCompositing]);

  useEffect(() => {
    overlayStyleRef.current = overlayStyle;
  }, [overlayStyle]);

  useEffect(() => {
    if (!isRecording || isCompositing) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setRecordingElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isCompositing, isRecording]);

  useEffect(() => {
    if (!source) router.replace("/");
  }, [source]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    SelfieCutoutNative.warmUp?.().catch(() => undefined);
  }, []);

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
      }
      setAudioModeAsync({
        allowsRecording: false,
        interruptionMode: "mixWithOthers",
        shouldRouteThroughEarpiece: false,
      }).catch(() => undefined);
    };
  }, [player]);

  useEffect(() => {
    let isActive = true;
    async function openCameraPreview() {
      if (!cameraPermission?.granted) {
        const permission = await requestCameraPermission();
        if (isActive) {
          setCameraStatus(permission.granted ? "starting" : "permission");
          setRecordingStatus(
            permission.granted ? "Opening camera preview…" : "Camera permission is required to record."
          );
        }
        return;
      }
      setCameraStatus("starting");
      setRecordingStatus("Opening camera preview…");
    }
    openCameraPreview().catch(() => isActive && setCameraStatus("error"));
    return () => {
      isActive = false;
    };
  }, [cameraPermission?.granted, requestCameraPermission]);

  useEffect(() => {
    let isActive = true;
    async function prepareMicrophone() {
      if (microphonePermission?.granted) return;
      const permission = await requestMicrophonePermission();
      if (!permission.granted && isActive) {
        setRecordingStatus("Microphone permission is required to record your voice.");
        Alert.alert("Microphone needed", "Allow microphone access now so Reel Reactor can capture your voice.");
      }
    }
    prepareMicrophone().catch(() => undefined);
    return () => {
      isActive = false;
    };
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

  const overlayResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !isRecording && !isCompositing,
        onStartShouldSetPanResponderCapture: () => !isRecording && !isCompositing,
        onMoveShouldSetPanResponder: () => !isRecording && !isCompositing,
        onMoveShouldSetPanResponderCapture: () => !isRecording && !isCompositing,
        onPanResponderGrant: (event) => {
          dragStart.current = overlayPositionRef.current;
          pinchStartDistance.current = getTouchDistance(event.nativeEvent.touches);
          pinchStartSize.current = overlaySizeRef.current;
          isPinching.current = pinchStartDistance.current > 0;
        },
        onPanResponderMove: (event, gestureState) => {
          const touchDistance = getTouchDistance(event.nativeEvent.touches);
          if (event.nativeEvent.touches.length > 1 && touchDistance > 0) {
            if (!isPinching.current) {
              isPinching.current = true;
              pinchStartDistance.current = touchDistance;
              pinchStartSize.current = overlaySizeRef.current;
              return;
            }
            const baseline = pinchStartDistance.current || touchDistance;
            const nextSize = Math.max(
              MIN_OVERLAY_SIZE,
              Math.min(MAX_OVERLAY_SIZE, Math.round(pinchStartSize.current * (touchDistance / baseline)))
            );
            overlaySizeRef.current = nextSize;
            setOverlaySize(nextSize);
            setOverlayPosition((current) => clampOverlayToRect(current, overlayRect, nextSize));
            return;
          }
          if (isPinching.current) return;
          setOverlayPosition(
            clampOverlayToRect(
              { x: dragStart.current.x + gestureState.dx, y: dragStart.current.y + gestureState.dy },
              overlayRect,
              overlaySizeRef.current
            )
          );
        },
        onPanResponderRelease: () => {
          isPinching.current = false;
        },
        onPanResponderTerminate: () => {
          isPinching.current = false;
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [isCompositing, isRecording, overlayRect]
  );

  async function ensurePermissions() {
    const camera = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    const microphone = microphonePermission?.granted ? microphonePermission : await requestMicrophonePermission();
    return camera.granted && microphone.granted;
  }

  function closeOpenSourcePause() {
    const activePause = sourcePauseStart.current;
    if (!activePause) return sourcePausesRef.current;
    const durationSec = Math.max(0, (Date.now() - activePause.wallTimeMs) / 1000);
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
      ? Math.max(0.1, (Date.now() - recordingStartedAtMs) / 1000)
      : null;
    setRecordingStatus(reason);
    setIsRecording(false);
    try {
      playerRef.current.volume = 0;
      player.pause();
      if (SelfieCutoutNative.SelfieCutoutView) {
        SelfieCutoutNative.stopRecording?.();
      } else {
        cameraRef.current?.stopRecording();
      }
    } catch (error) {
      stopRequestedRef.current = false;
      setRecordingStatus(
        `Could not stop recording: ${error instanceof Error ? error.message : "unknown camera error"}`
      );
      setIsRecording(false);
    }
  }

  function toggleSourcePause() {
    if (!isRecording || isCompositing) return;
    if (isSourcePaused) {
      closeOpenSourcePause();
      playerRef.current.volume = effectiveReelGain;
      player.play();
      return;
    }
    const stableSourceTime = Math.max(0, sourceTimeRef.current);
    playerRef.current.volume = 0;
    player.pause();
    sourcePauseStart.current = { sourceTimeSec: stableSourceTime, wallTimeMs: Date.now() };
    setIsSourcePaused(true);
  }

  async function toggleRecording() {
    recordAttempt.current += 1;
    if (isCompositing || stopRequestedRef.current) return;
    if (isRecording) {
      requestStopRecording("Finishing and rendering your reaction…");
      return;
    }
    setRecordingStatus(`Checking permissions…`);
    const granted = await ensurePermissions();
    if (!granted) {
      Alert.alert(
        "Camera and microphone needed",
        "Allow both permissions so Reel Reactor can record your reaction with sound."
      );
      setRecordingStatus("Camera and microphone permission are required before recording can start.");
      return;
    }
    const nativeCutout = Boolean(SelfieCutoutNative.SelfieCutoutView);
    const recordingBlocker = getRecordingStartBlocker({
      platform: Platform.OS,
      cameraReady: isCameraReady,
      hasCameraRef: nativeCutout ? isCameraReady : Boolean(cameraRef.current),
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
    if (!nativeCutout && !camera) {
      setCameraStatus("starting");
      setRecordingStatus("Camera preview is not ready yet.");
      return;
    }
    sourcePausesRef.current = [];
    setSourcePauses([]);
    sourcePauseStart.current = null;
    setIsSourcePaused(false);
    stopRequestedRef.current = false;
    setRecordingElapsedSeconds(0);
    if (Platform.OS !== "web") {
      await setAudioModeAsync({
        allowsRecording: true,
        interruptionMode: "mixWithOthers",
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
      }).catch(() => undefined);
    }
    playerRef.current.volume = effectiveReelGain;
    recordingStartedAtMsRef.current = Date.now();
    recordingStopDurationSecRef.current = null;
    setIsRecording(true);
    try {
      setRecordingStatus(`Recording reaction… Tap shutter to stop.`);
      const recorded = await beginReactionCameraRecording({
        startCameraRecording: () =>
          nativeCutout ? SelfieCutoutNative.startRecording() : camera!.recordAsync(),
        startSourcePlayback: async () => {
          player.currentTime = 0;
          sourceTimeRef.current = 0;
          playerRef.current.volume = effectiveReelGain;
          player.play();
        },
        onSourcePlaybackIssue: () => {
          setRecordingStatus("Recording camera reaction (source playback issue).");
        },
      });
      if (recorded?.uri) {
        const completedSourcePauses = closeOpenSourcePause();
        setIsCompositing(true);
        const styleLabel = overlayStyle === "circle" ? "Circle" : overlayStyle === "square" ? "Square" : "Cutout";
        setRecordingStatus(
          overlayStyle === "cutout"
            ? "Cutout: isolating you from the background…"
            : `Rendering ${styleLabel} style: source clip + camera + audio…`,
        );
        const finalDurationSec =
          recordingStopDurationSecRef.current ??
          (recordingStartedAtMsRef.current
            ? Math.max(0.5, (Date.now() - recordingStartedAtMsRef.current) / 1000)
            : undefined);
        const compositeUri = await composeReactionVideo({
          sourceUri: source!.uri,
          reactionUri: recorded.uri,
          overlay: { ...overlayPosition, size: overlaySize },
          studioSize,
          sourceSize: { width: source?.width, height: source?.height },
          overlayStyle,
          sourcePauses: completedSourcePauses,
          stopDurationSec: finalDurationSec,
          sourceAudioGain: sourceAudioGainRef.current,
          reactionAudioGain: reactionAudioGainRef.current,
          onProgress: (processedMs) =>
            setRecordingStatus(`Rendering video… ${Math.floor(processedMs / 1000)}s processed`),
        });
        setCurrentReaction({ uri: compositeUri, recordedAt: Date.now(), isComposite: true });
        player.pause();
        router.replace("/review" as never);
      } else {
        setRecordingStatus("Recording stopped without video.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown native render error";
      setRecordingStatus(`Merged video failed: ${message}`);
      Alert.alert("Merged video failed", message);
    } finally {
      if (Platform.OS !== "web") {
        setAudioModeAsync({
          allowsRecording: false,
          interruptionMode: "mixWithOthers",
          playsInSilentMode: true,
          shouldRouteThroughEarpiece: false,
        }).catch(() => undefined);
      }
      playerRef.current.volume = effectiveReelGain;
      setIsRecording(false);
      setIsCompositing(false);
      recordingStartedAtMsRef.current = null;
      recordingStopDurationSecRef.current = null;
      stopRequestedRef.current = false;
    }
  }

  function handleChangeClip() {
    player.pause();
    setCurrentSource(null as never);
    router.replace("/");
  }

  function handleFlipCamera() {
    setIsCameraReady(false);
    setIsCutoutReady(false);
    setCameraStatus("starting");
    setCameraInstanceKey((k) => k + 1);
    setFacing((cur) => (cur === "front" ? "back" : "front"));
  }

  if (!source) return null;

  const bubbleBorderRadius =
    overlayStyle === "circle" ? overlaySize / 2 : overlayStyle === "square" ? 20 : overlaySize / 2;

  const bubbleCustomRadiusStyle =
    overlayStyle === "cutout"
      ? { borderRadius: 0, backgroundColor: "transparent" }
      : { borderRadius: bubbleBorderRadius };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-black" safeAreaClassName="bg-black">
      <View
        onLayout={(event: LayoutChangeEvent) => {
          const { width: nextWidth, height: nextHeight } = event.nativeEvent.layout;
          if (nextWidth > 0 && nextHeight > 0) setStudioSize({ width: nextWidth, height: nextHeight });
        }}
        style={styles.canvas}
      >
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <View style={styles.brandDot} />
            <Text style={styles.brandText}>Reel Reactor</Text>
          </View>
          <View style={styles.topActions}>
            <Pressable onPress={() => setIsAudioSheetOpen(true)} style={({ pressed }) => [styles.btnHeaderAction, pressed && styles.btnPressed]}>
              <MaterialIcons name="tune" size={14} color="#FFFFFF" />
              <Text style={styles.btnHeaderActionText}>Audio</Text>
            </Pressable>
            <Pressable onPress={handleChangeClip} disabled={isRecording} style={({ pressed }) => [styles.btnHeaderAction, (pressed || isRecording) && styles.btnPressed]}>
              <Text style={styles.btnHeaderActionText}>Change Clip</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.viewportWrapper}>
          <View style={styles.stageBox}>
            <VideoView style={StyleSheet.absoluteFill} player={player} contentFit="cover" nativeControls={false} surfaceType="textureView" />
            {isRecording && !isCompositing ? (
              <View style={styles.recordPill}>
                <View style={styles.pillDot} />
                <Text style={styles.recordTimerText}>{formatRecordingTime(recordingElapsedSeconds)}</Text>
              </View>
            ) : null}
            <View
              collapsable={false}
              pointerEvents="box-only"
              {...overlayResponder.panHandlers}
              style={[
                styles.bubbleOverlay,
                bubbleCustomRadiusStyle,
                overlayStyle === "cutout" ? styles.cutoutOverlay : null,
                {
                  height: overlaySize,
                  left: overlayPosition.x,
                  top: overlayPosition.y,
                  width: overlaySize,
                  borderWidth: overlayStyle === "cutout" ? 0 : 1.5,
                  borderColor: overlayStyle === "cutout" ? "transparent" : isRecording ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.6)",
                },
              ]}
              needsOffscreenAlphaCompositing={overlayStyle === "cutout"}
            >
              {isFocused && cameraPermission?.granted ? (
                <>
                  {SelfieCutoutNative.SelfieCutoutView ? (
                    <SelfieCutoutNative.SelfieCutoutView
                      key={`live-${cameraInstanceKey}`}
                      facing={facing}
                      isolatePerson={overlayStyle === "cutout"}
                      pointerEvents="none"
                      collapsable={false}
                      needsOffscreenAlphaCompositing={overlayStyle === "cutout"}
                      style={[styles.cameraView, overlayStyle === "cutout" ? styles.cutoutCamera : bubbleCustomRadiusStyle]}
                      onReady={() => {
                        setIsCameraReady(true);
                        setIsCutoutReady(true);
                        setCameraStatus("ready");
                      }}
                      onError={() => {
                        setIsCameraReady(false);
                        setIsCutoutReady(false);
                        setCameraStatus("error");
                      }}
                    />
                  ) : (
                    <CameraView
                      key={cameraInstanceKey}
                      ref={cameraRef}
                      style={[styles.cameraView, overlayStyle === "cutout" ? styles.cutoutCamera : bubbleCustomRadiusStyle]}
                      pointerEvents="none"
                      facing={facing}
                      mode="video"
                      mute={false}
                      onCameraReady={() => {
                        setIsCameraReady(true);
                        setIsCutoutReady(true);
                        setCameraStatus("ready");
                      }}
                      onMountError={() => {
                        setIsCameraReady(false);
                        setIsCutoutReady(false);
                        setCameraStatus("error");
                      }}
                    />
                  )}
                  <View collapsable={false} pointerEvents="none" style={[styles.interactionSurface, bubbleCustomRadiusStyle]} />
                </>
              ) : (
                <View style={[styles.permissionOverlay, bubbleCustomRadiusStyle]}>
                  <MaterialIcons name="videocam" size={24} color="#86868B" />
                  <Text style={styles.permissionText}>Camera</Text>
                </View>
              )}
            </View>
          </View>
        </View>
        <View style={styles.controlDock}>
          <View style={styles.shapePillBar}>
            <Pressable onPress={() => { if (isRecording) return; setOverlayStyle("circle"); }} style={[styles.shapeItem, overlayStyle === "circle" && styles.shapeItemActive]}>
              <Text style={[styles.shapeItemText, overlayStyle === "circle" && styles.shapeItemTextActive]}>Circle</Text>
            </Pressable>
            <Pressable onPress={() => { if (isRecording) return; setOverlayStyle("square"); }} style={[styles.shapeItem, overlayStyle === "square" && styles.shapeItemActive]}>
              <Text style={[styles.shapeItemText, overlayStyle === "square" && styles.shapeItemTextActive]}>Square</Text>
            </Pressable>
            <Pressable onPress={() => { if (isRecording) return; setOverlayStyle("cutout"); }} style={[styles.shapeItem, overlayStyle === "cutout" && styles.shapeItemActive]}>
              <Text style={[styles.shapeItemText, overlayStyle === "cutout" && styles.shapeItemTextActive]}>✨ Cutout</Text>
            </Pressable>
          </View>
          <View style={styles.shutterBar}>
            <Pressable onPress={toggleSourcePause} disabled={!isRecording} style={({ pressed }) => [styles.dockSideBtn, isSourcePaused && styles.dockSideBtnPaused, !isRecording && styles.dockSideBtnDisabled, pressed && styles.btnPressed]}>
              <Text style={[styles.dockSideBtnIcon, isSourcePaused && styles.dockSideBtnIconPaused]}>{isSourcePaused ? "▶" : "⏸"}</Text>
            </Pressable>
            <Pressable onPress={toggleRecording} disabled={isCompositing} style={({ pressed }) => [styles.appleShutter, pressed && styles.btnPressed]}>
              <View style={[styles.shutterCore, isRecording && styles.shutterCoreRecording]} />
            </Pressable>
            <Pressable onPress={() => setIsAudioSheetOpen(true)} style={({ pressed }) => [styles.dockSideBtn, pressed && styles.btnPressed]}>
              <MaterialIcons name="tune" size={20} color="#FFFFFF" />
            </Pressable>
            <Pressable onPress={handleFlipCamera} disabled={isRecording} style={({ pressed }) => [styles.dockSideBtn, isRecording && styles.dockSideBtnDisabled, pressed && styles.btnPressed]}>
              <Text style={styles.dockSideBtnIcon}>📷</Text>
            </Pressable>
          </View>
        </View>
        <Modal visible={isAudioSheetOpen} transparent animationType="fade" onRequestClose={() => setIsAudioSheetOpen(false)}>
          <Pressable style={styles.audioSheetBackdrop} onPress={() => setIsAudioSheetOpen(false)}>
            <Pressable style={styles.audioSheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.audioSheetHeader}>
                <View style={styles.audioSheetTitleGroup}>
                  <MaterialIcons name="volume-up" size={18} color="#FFFFFF" />
                  <Text style={styles.audioSheetTitle}>Audio Balance</Text>
                </View>
                <Pressable onPress={() => setIsAudioSheetOpen(false)} style={({ pressed }) => [styles.btnCloseSheet, pressed && styles.btnPressed]}>
                  <Text style={styles.btnCloseSheetText}>✕</Text>
                </Pressable>
              </View>
              <View style={styles.audioChannelGroup}>
                <View style={styles.audioRow}>
                  <View style={styles.audioRowTop}>
                    <View style={styles.audioRowLabel}>
                      <Text style={styles.emojiIcon}>🔊</Text>
                      <Text style={styles.audioRowLabelText}>Reel Clip Volume</Text>
                    </View>
                    <Text style={styles.audioRowValue}>{isReelMuted ? "Muted" : `${reelVolume}%`}</Text>
                  </View>
                  <View style={styles.audioSliderWrap}>
                    <Pressable onPress={() => setIsReelMuted((m) => !m)} style={[styles.audioIconBtn, isReelMuted && styles.audioIconBtnMuted]}>
                      <Text style={styles.audioIconBtnText}>{isReelMuted ? "🔇" : "🔊"}</Text>
                    </Pressable>
                    <View style={styles.sliderContainer}>
                      <AppleAudioSlider value={isReelMuted ? 0 : reelVolume} max={100} onChange={(val) => { setReelVolume(val); if (isReelMuted) setIsReelMuted(false); }} />
                    </View>
                  </View>
                </View>
                <View style={styles.audioRow}>
                  <View style={styles.audioRowTop}>
                    <View style={styles.audioRowLabel}>
                      <Text style={styles.emojiIcon}>🎙</Text>
                      <Text style={styles.audioRowLabelText}>Your Reaction Voice</Text>
                    </View>
                    <Text style={styles.audioRowValue}>{isMicMuted ? "Muted" : `${micVolume}%`}</Text>
                  </View>
                  <View style={styles.audioSliderWrap}>
                    <Pressable onPress={() => setIsMicMuted((m) => !m)} style={[styles.audioIconBtn, isMicMuted && styles.audioIconBtnMuted]}>
                      <Text style={styles.audioIconBtnText}>{isMicMuted ? "🔇" : "🎙"}</Text>
                    </Pressable>
                    <View style={styles.sliderContainer}>
                      <AppleAudioSlider value={isMicMuted ? 0 : micVolume} max={350} onChange={(val) => { setMicVolume(val); if (isMicMuted) setIsMicMuted(false); }} />
                    </View>
                  </View>
                </View>
                <View style={styles.micMeterContainer}>
                  <Text style={styles.micMeterLabel}>Mic Input:</Text>
                  <View style={styles.micMeterTrack}>
                    <View style={[styles.micMeterFill, { width: isRecording && !isMicMuted ? "65%" : "8%" }]} />
                  </View>
                </View>
                <View style={styles.audioToggleRow}>
                  <View style={styles.toggleInfo}>
                    <Text style={styles.toggleLabel}>Auto-Duck Background</Text>
                    <Text style={styles.toggleDesc}>Automatically drops clip audio while you speak</Text>
                  </View>
                  <Switch value={isAutoDucking} onValueChange={setIsAutoDucking} trackColor={{ false: "rgba(255,255,255,0.15)", true: "#30D158" }} thumbColor="#FFFFFF" />
                </View>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
        {isCompositing ? (
          <View style={styles.renderingModal}>
            <View style={styles.renderingCard}>
              <ActivityIndicator size="large" color="#FF3B30" />
              <Text style={styles.renderingTitle}>Creating Combined Reel</Text>
              <Text style={styles.renderingStatus}>{recordingStatus}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  canvas: { backgroundColor: "#000000", flex: 1 },
  topBar: { alignItems: "center", flexDirection: "row", height: 48, justifyContent: "space-between", paddingHorizontal: 16, zIndex: 20 },
  brand: { alignItems: "center", flexDirection: "row", gap: 8 },
  brandDot: { backgroundColor: "#FF3B30", borderRadius: 4, height: 8, width: 8 },
  brandText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700", letterSpacing: -0.3 },
  topActions: { alignItems: "center", flexDirection: "row", gap: 8 },
  btnHeaderAction: { alignItems: "center", backgroundColor: "rgba(255, 255, 255, 0.12)", borderColor: "rgba(255, 255, 255, 0.08)", borderRadius: 20, borderWidth: 1, flexDirection: "row", gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  btnHeaderActionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  btnPressed: { opacity: 0.82, transform: [{ scale: 0.96 }] },
  viewportWrapper: { alignItems: "center", flex: 1, justifyContent: "center", paddingBottom: 8, paddingHorizontal: 12, position: "relative", width: "100%" },
  stageBox: { aspectRatio: 9 / 16, backgroundColor: "#09090B", borderColor: "rgba(255, 255, 255, 0.08)", borderRadius: 28, borderWidth: 1, maxHeight: "100%", overflow: "hidden", position: "relative", shadowColor: "#000000", shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.8, shadowRadius: 36, width: "100%" },
  recordPill: { alignItems: "center", alignSelf: "center", backgroundColor: "rgba(0, 0, 0, 0.65)", borderColor: "rgba(255, 255, 255, 0.12)", borderRadius: 20, borderWidth: 1, flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingVertical: 6, position: "absolute", top: 16, zIndex: 10 },
  pillDot: { backgroundColor: "#FF3B30", borderRadius: 4, height: 8, width: 8 },
  recordTimerText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600", letterSpacing: 0.2 },
  bubbleOverlay: { borderWidth: 1.5, elevation: 10, overflow: "hidden", position: "absolute", shadowColor: "#000000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16, zIndex: 15 },
  cutoutOverlay: { backgroundColor: "transparent", borderWidth: 0, elevation: 0, overflow: "visible", shadowOpacity: 0, shadowRadius: 0 },
  cameraView: { flex: 1, overflow: "hidden" },
  cutoutCamera: { backgroundColor: "transparent", overflow: "visible" },
  interactionSurface: { ...StyleSheet.absoluteFillObject, backgroundColor: "transparent" },
  permissionOverlay: { alignItems: "center", backgroundColor: "#18181C", flex: 1, justifyContent: "center" },
  permissionText: { color: "#86868B", fontSize: 11, fontWeight: "600", marginTop: 4 },
  controlDock: { alignItems: "center", gap: 10, paddingBottom: 16, paddingHorizontal: 16, width: "100%", zIndex: 20 },
  shapePillBar: { backgroundColor: "rgba(26, 26, 30, 0.75)", borderColor: "rgba(255, 255, 255, 0.1)", borderRadius: 24, borderWidth: 1, flexDirection: "row", padding: 4 },
  shapeItem: { alignItems: "center", borderRadius: 18, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 6 },
  shapeItemActive: { backgroundColor: "rgba(255, 255, 255, 0.16)" },
  shapeItemText: { color: "#86868B", fontSize: 12, fontWeight: "600" },
  shapeItemTextActive: { color: "#FFFFFF", fontWeight: "700" },
  shutterBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", maxWidth: 340, width: "100%" },
  dockSideBtn: { alignItems: "center", backgroundColor: "rgba(255, 255, 255, 0.1)", borderColor: "rgba(255, 255, 255, 0.08)", borderRadius: 23, borderWidth: 1, height: 46, justifyContent: "center", width: 46 },
  dockSideBtnPaused: { backgroundColor: "rgba(255, 59, 48, 0.25)", borderColor: "rgba(255, 59, 48, 0.5)" },
  dockSideBtnDisabled: { opacity: 0.5 },
  dockSideBtnIcon: { color: "#FFFFFF", fontSize: 16 },
  dockSideBtnIconPaused: { color: "#FF453A" },
  appleShutter: { alignItems: "center", borderColor: "#FFFFFF", borderRadius: 37, borderWidth: 4, height: 74, justifyContent: "center", width: 74 },
  shutterCore: { backgroundColor: "#FF3B30", borderRadius: 28, height: 56, width: 56 },
  shutterCoreRecording: { borderRadius: 8, height: 28, width: 28 },
  audioSheetBackdrop: { alignItems: "center", backgroundColor: "rgba(0, 0, 0, 0.65)", flex: 1, justifyContent: "flex-end", padding: 12 },
  audioSheet: { backgroundColor: "rgba(26, 26, 30, 0.96)", borderColor: "rgba(255, 255, 255, 0.14)", borderRadius: 24, borderWidth: 1, gap: 16, maxWidth: 420, padding: 20, width: "100%" },
  audioSheetHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  audioSheetTitleGroup: { alignItems: "center", flexDirection: "row", gap: 8 },
  audioSheetTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  btnCloseSheet: { alignItems: "center", backgroundColor: "rgba(255, 255, 255, 0.12)", borderRadius: 16, height: 32, justifyContent: "center", width: 32 },
  btnCloseSheetText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  audioChannelGroup: { gap: 14 },
  audioRow: { gap: 6 },
  audioRowTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  audioRowLabel: { alignItems: "center", flexDirection: "row", gap: 6 },
  emojiIcon: { fontSize: 13 },
  audioRowLabelText: { color: "#F5F5F7", fontSize: 13, fontWeight: "600" },
  audioRowValue: { color: "#86868B", fontSize: 12, fontWeight: "600" },
  audioSliderWrap: { alignItems: "center", flexDirection: "row", gap: 10 },
  audioIconBtn: { alignItems: "center", backgroundColor: "rgba(255, 255, 255, 0.08)", borderColor: "rgba(255, 255, 255, 0.06)", borderRadius: 18, borderWidth: 1, height: 36, justifyContent: "center", width: 36 },
  audioIconBtnMuted: { backgroundColor: "rgba(255, 59, 48, 0.25)", borderColor: "rgba(255, 59, 48, 0.4)" },
  audioIconBtnText: { fontSize: 14 },
  sliderContainer: { flex: 1, height: 32, justifyContent: "center" },
  sliderTrack: { backgroundColor: "rgba(255, 255, 255, 0.15)", borderRadius: 4, height: 8, position: "relative", width: "100%" },
  sliderTrackFill: { backgroundColor: "#0A84FF", borderRadius: 4, bottom: 0, left: 0, position: "absolute", top: 0 },
  sliderThumb: { backgroundColor: "#FFFFFF", borderRadius: 12, height: 24, marginLeft: -12, position: "absolute", shadowColor: "#000000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 4, top: -8, width: 24 },
  micMeterContainer: { alignItems: "center", backgroundColor: "rgba(0, 0, 0, 0.3)", borderColor: "rgba(255, 255, 255, 0.06)", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  micMeterLabel: { color: "#86868B", fontSize: 11, fontWeight: "600", minWidth: 64 },
  micMeterTrack: { backgroundColor: "rgba(255, 255, 255, 0.1)", borderRadius: 3, flex: 1, height: 6, overflow: "hidden" },
  micMeterFill: { backgroundColor: "#30D158", borderRadius: 3, height: "100%" },
  audioToggleRow: { alignItems: "center", borderTopColor: "rgba(255, 255, 255, 0.08)", borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingTop: 8 },
  toggleInfo: { flex: 1, gap: 2, paddingRight: 10 },
  toggleLabel: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  toggleDesc: { color: "#86868B", fontSize: 11 },
  renderingModal: { ...StyleSheet.absoluteFillObject, alignItems: "center", backgroundColor: "rgba(0, 0, 0, 0.85)", justifyContent: "center", padding: 24, zIndex: 99 },
  renderingCard: { alignItems: "center", backgroundColor: "#18181C", borderColor: "rgba(255, 255, 255, 0.12)", borderRadius: 24, borderWidth: 1, gap: 12, maxWidth: 320, padding: 24, width: "100%" },
  renderingTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", textAlign: "center" },
  renderingStatus: { color: "#86868B", fontSize: 12, lineHeight: 16, textAlign: "center" },
});
