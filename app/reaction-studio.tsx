import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useVideoPlayer, VideoView } from "expo-video";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { clampOverlay, type OverlayPosition } from "@/lib/reaction-project";
import { getCurrentSource } from "@/lib/reaction-session";

const OVERLAY_SIZE = 132;

export default function ReactionStudioScreen() {
  const source = getCurrentSource();
  const { height, width } = useWindowDimensions();
  const player = useVideoPlayer(source?.uri ?? null, (videoPlayer) => {
    videoPlayer.loop = false;
  });
  const [overlayPosition, setOverlayPosition] = useState<OverlayPosition>({ x: width - OVERLAY_SIZE - 22, y: 122 });
  const dragStart = useRef<OverlayPosition>(overlayPosition);

  useEffect(() => {
    if (!source) router.replace("/");
  }, [source]);

  // React Native invokes these responder callbacks after a touch event, never during render.
  // eslint-disable-next-line react-hooks/refs
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3,
    onPanResponderGrant: () => { dragStart.current = overlayPosition; },
    onPanResponderMove: (_, gesture) => {
      setOverlayPosition(clampOverlay({ x: dragStart.current.x + gesture.dx, y: dragStart.current.y + gesture.dy }, { width, height }, OVERLAY_SIZE));
    },
  }), [height, overlayPosition, width]);

  if (!source) return null;

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-[#000000]" safeAreaClassName="bg-[#000000]">
      <View style={styles.canvas}>
        <VideoView style={StyleSheet.absoluteFill} player={player} contentFit="contain" nativeControls={false} />
        <View style={styles.scrim} pointerEvents="none" />

        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={({ pressed }) => [styles.roundControl, pressed && styles.controlPressed]}>
            <MaterialIcons name="close" size={23} color="#FFFFFF" />
          </Pressable>
          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusLabel}>Ready to react</Text>
          </View>
          <Pressable onPress={() => setOverlayPosition({ x: width - OVERLAY_SIZE - 22, y: 122 })} hitSlop={10} style={({ pressed }) => [styles.roundControl, pressed && styles.controlPressed]}>
            <MaterialIcons name="restart-alt" size={23} color="#FFFFFF" />
          </Pressable>
        </View>

        <View {...panResponder.panHandlers} style={[styles.reactionOverlay, { left: overlayPosition.x, top: overlayPosition.y }]}>
          <View style={styles.cameraPlaceholder}>
            <MaterialIcons name="face" size={34} color="#FF8A6B" />
            <Text style={styles.overlayHint}>Your camera</Text>
          </View>
          <View style={styles.dragHandle}>
            <MaterialIcons name="open-with" size={16} color="#FFFFFF" />
          </View>
        </View>

        <View style={styles.bottomDock}>
          <Text style={styles.instruction}>Drag your camera bubble to move it</Text>
          <View style={styles.controlsRow}>
            <Pressable style={({ pressed }) => [styles.smallControl, pressed && styles.controlPressed]}>
              <MaterialIcons name="volume-up" size={23} color="#FFFFFF" />
            </Pressable>
            <Pressable onPress={() => router.push("/reaction-record" as never)} style={({ pressed }) => [styles.recordButton, pressed && styles.recordPressed]}>
              <MaterialIcons name="fiber-manual-record" size={34} color="#FFFFFF" />
            </Pressable>
            <Pressable style={({ pressed }) => [styles.smallControl, pressed && styles.controlPressed]}>
              <MaterialIcons name="flip-camera-android" size={23} color="#FFFFFF" />
            </Pressable>
          </View>
          <Text style={styles.recordCaption}>Enable camera to record</Text>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  canvas: { backgroundColor: "#000000", flex: 1 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(3, 6, 10, 0.16)" },
  topBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 5 },
  roundControl: { alignItems: "center", backgroundColor: "rgba(12,16,24,0.72)", borderColor: "rgba(255,255,255,0.18)", borderRadius: 19, borderWidth: 1, height: 40, justifyContent: "center", width: 40 },
  controlPressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  statusPill: { alignItems: "center", backgroundColor: "rgba(12,16,24,0.75)", borderColor: "rgba(255,255,255,0.16)", borderRadius: 18, borderWidth: 1, flexDirection: "row", gap: 7, paddingHorizontal: 12, paddingVertical: 8 },
  statusDot: { backgroundColor: "#36C98A", borderRadius: 4, height: 7, width: 7 },
  statusLabel: { color: "#F7F8FA", fontSize: 13, fontWeight: "700" },
  reactionOverlay: { borderColor: "#FFFFFF", borderRadius: OVERLAY_SIZE / 2, borderWidth: 3, elevation: 8, height: OVERLAY_SIZE, overflow: "visible", position: "absolute", shadowColor: "#000000", shadowOpacity: 0.35, shadowRadius: 10, width: OVERLAY_SIZE },
  cameraPlaceholder: { alignItems: "center", backgroundColor: "#171E2B", borderRadius: OVERLAY_SIZE / 2 - 3, flex: 1, justifyContent: "center", overflow: "hidden" },
  overlayHint: { color: "#F7F8FA", fontSize: 11, fontWeight: "700", marginTop: 5 },
  dragHandle: { alignItems: "center", backgroundColor: "#FF5C35", borderColor: "#FFFFFF", borderRadius: 14, borderWidth: 2, bottom: -5, height: 28, justifyContent: "center", position: "absolute", right: -5, width: 28 },
  bottomDock: { alignItems: "center", bottom: 0, left: 0, paddingBottom: 7, paddingHorizontal: 22, position: "absolute", right: 0 },
  instruction: { color: "#FFFFFF", fontSize: 13, fontWeight: "600", marginBottom: 13, textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 5 },
  controlsRow: { alignItems: "center", flexDirection: "row", gap: 28 },
  smallControl: { alignItems: "center", backgroundColor: "rgba(12,16,24,0.82)", borderColor: "rgba(255,255,255,0.18)", borderRadius: 22, borderWidth: 1, height: 44, justifyContent: "center", width: 44 },
  recordButton: { alignItems: "center", backgroundColor: "#FF5C35", borderColor: "rgba(255,255,255,0.9)", borderRadius: 38, borderWidth: 4, height: 76, justifyContent: "center", width: 76 },
  recordPressed: { opacity: 0.88, transform: [{ scale: 0.97 }] },
  recordCaption: { color: "#E8EDF5", fontSize: 12, fontWeight: "600", marginTop: 9 },
});
