import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useVideoPlayer, VideoView } from "expo-video";
import { router } from "expo-router";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { getCurrentSharedLink, getCurrentSource } from "@/lib/reaction-session";

export default function SourceSetupScreen() {
  const source = getCurrentSource();
  const sharedLink = getCurrentSharedLink();
  const { height } = useWindowDimensions();
  const previewHeight = Math.max(230, Math.min(360, Math.floor(height * 0.38)));
  const player = useVideoPlayer(source?.uri ?? null, (videoPlayer) => {
    videoPlayer.loop = true;
  });

  useEffect(() => {
    if (!source) router.replace("/");
  }, [player, source]);

  if (!source) return null;

  const durationSeconds = source.durationMs ? Math.round(source.durationMs / 1_000) : null;

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5" containerClassName="bg-[#0C1018]">
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconButton}>
            <MaterialIcons name="arrow-back-ios-new" size={20} color="#F7F8FA" />
          </Pressable>
          <Text style={styles.title}>Set up your reaction</Text>
          <View style={styles.iconSpacer} />
        </View>

        <View style={[styles.previewCard, { height: previewHeight }]}>
          <VideoView style={styles.preview} player={player} contentFit="contain" nativeControls />
        </View>

        <View style={styles.sourceSummary}>
          <View style={styles.sourceIcon}>
            <MaterialIcons name="movie" size={20} color="#FF8A6B" />
          </View>
          <View style={styles.sourceCopy}>
            <Text style={styles.sourceName} numberOfLines={1}>{source.name}</Text>
            <Text style={styles.sourceMeta}>{durationSeconds ? `${durationSeconds}s local video` : "Local video"}</Text>
          </View>
          <Pressable onPress={() => router.replace("/")} style={({ pressed }) => [styles.changeButton, pressed && styles.pressed]}>
            <Text style={styles.changeButtonLabel}>Change</Text>
          </Pressable>
        </View>

        <View style={styles.tipCard}>
          <MaterialIcons name="tips-and-updates" size={19} color="#AAB3C2" />
          <Text style={styles.tipCopy}>Move and resize your front-camera bubble in the studio, then begin your reaction.</Text>
        </View>
        {sharedLink ? <Text style={styles.linkNotice} numberOfLines={1}>Source link attached to this session</Text> : null}

        <View style={styles.actionDock}>
          <Pressable onPress={() => router.push("/reaction-record" as never)} style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}>
            <MaterialIcons name="video-camera-front" size={22} color="#FFFFFF" />
            <Text style={styles.primaryButtonLabel}>Open reaction studio</Text>
          </Pressable>
          <Text style={styles.footer}>Next: position your camera and start recording.</Text>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { alignItems: "center", flexDirection: "row", height: 58, justifyContent: "space-between" },
  iconButton: { alignItems: "center", height: 40, justifyContent: "center", width: 40 },
  iconSpacer: { width: 40 },
  title: { color: "#F7F8FA", fontSize: 17, fontWeight: "700", letterSpacing: -0.2 },
  previewCard: { backgroundColor: "#000000", borderColor: "#283244", borderRadius: 26, borderWidth: 1, overflow: "hidden", width: "100%" },
  preview: { flex: 1 },
  sourceSummary: { alignItems: "center", backgroundColor: "#171E2B", borderColor: "#283244", borderRadius: 16, borderWidth: 1, flexDirection: "row", marginTop: 12, padding: 12 },
  sourceIcon: { alignItems: "center", backgroundColor: "#32241F", borderRadius: 11, height: 40, justifyContent: "center", width: 40 },
  sourceCopy: { flex: 1, marginLeft: 10 },
  sourceName: { color: "#F7F8FA", fontSize: 14, fontWeight: "700" },
  sourceMeta: { color: "#AAB3C2", fontSize: 12, marginTop: 2 },
  changeButton: { paddingHorizontal: 4, paddingVertical: 8 },
  changeButtonLabel: { color: "#FF8A6B", fontSize: 13, fontWeight: "700" },
  tipCard: { alignItems: "flex-start", backgroundColor: "#121823", borderRadius: 14, flexDirection: "row", gap: 9, marginTop: 11, padding: 12 },
  tipCopy: { color: "#AAB3C2", flex: 1, fontSize: 12, lineHeight: 17 },
  linkNotice: { color: "#8792A3", fontSize: 11, marginTop: 7 },
  actionDock: { marginTop: "auto", paddingBottom: 6, paddingTop: 12 },
  primaryButton: { alignItems: "center", backgroundColor: "#FF5C35", borderRadius: 18, flexDirection: "row", gap: 9, height: 58, justifyContent: "center" },
  primaryPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  primaryButtonLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  footer: { color: "#7E899A", fontSize: 12, lineHeight: 17, marginTop: 9, textAlign: "center" },
  pressed: { opacity: 0.65 },
});
