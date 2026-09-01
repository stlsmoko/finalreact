import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

import { ScreenContainer } from "@/components/screen-container";
import { getCurrentReaction, setCurrentRoute } from "@/lib/reaction-session";

export default function ReviewScreen() {
  const take = getCurrentReaction();
  const takeUri = take?.uri;
  const safeTakeUri = takeUri ?? "";
  const [isSaving, setIsSaving] = useState(false);
  const player = useVideoPlayer(takeUri ?? null, (videoPlayer) => {
    videoPlayer.loop = false;
    videoPlayer.muted = false;
  });

  useFocusEffect(useCallback(() => {
    return () => {
      try {
        player.pause();
      } catch {
        // The hook owns disposal; this prevents a stale review player from retaining audio focus.
      }
    };
  }, [player]));

  useEffect(() => {
    if (take?.isComposite) setCurrentRoute("/review");
  }, [take?.isComposite]);

  if (!takeUri || !take?.isComposite) {
    router.replace("/");
    return null;
  }

  async function saveTake() {
    if (isSaving) return;
    if (Platform.OS === "web") {
      Alert.alert("Use a phone to save", "Saving a local camera take requires the native iPhone or Android build.");
      return;
    }
    if (!safeTakeUri) {
      Alert.alert("Nothing to save", "Record a reaction first, then save it to your gallery.");
      return;
    }
    setIsSaving(true);
    try {
      const MediaLibrary = await import("expo-media-library");
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission needed", "Allow Photos / Gallery access so Reel Reactor can save this video.");
        return;
      }
      let localUri = safeTakeUri;
      if (localUri.startsWith("/") && !localUri.startsWith("file:")) {
        localUri = `file://${localUri}`;
      }
      const dest = `${FileSystem.cacheDirectory ?? ""}ReelReactor-${Date.now()}.mp4`;
      try {
        if (dest.startsWith("file:")) {
          await FileSystem.copyAsync({ from: localUri, to: dest });
          localUri = dest;
        }
      } catch {
        // Original cache file is fine if the copy is unnecessary.
      }
      if (typeof MediaLibrary.createAssetAsync === "function") {
        await MediaLibrary.createAssetAsync(localUri);
      } else {
        await MediaLibrary.saveToLibraryAsync(localUri);
      }
      Alert.alert("Saved", "Your reaction is in Photos / Gallery.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The gallery could not import this video.";
      Alert.alert("Could not save", message);
    } finally {
      setIsSaving(false);
    }
  }

  async function shareTake() {
    if (Platform.OS === "web") {
      Alert.alert("Use a phone to share", "Sharing a local reaction video requires the native iPhone or Android build.");
      return;
    }
    const Sharing = await import("expo-sharing");
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      Alert.alert("Sharing unavailable", "This device does not currently provide a compatible share sheet.");
      return;
    }
    await Sharing.shareAsync(safeTakeUri, { dialogTitle: "Share reaction take", mimeType: "video/mp4", UTI: "public.mpeg-4" });
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5" containerClassName="bg-[#0C1018]">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => { player.pause(); router.replace("/"); }} hitSlop={12} style={styles.closeButton}>
            <MaterialIcons name="close" size={22} color="#F7F8FA" />
          </Pressable>
          <Text style={styles.headerTitle}>Reaction video</Text>
          <View style={styles.closeButton} />
        </View>
        <View style={styles.previewCard}>
          <VideoView style={styles.preview} player={player} contentFit="contain" nativeControls />
        </View>
        <View style={styles.statusCard}>
          <View style={styles.statusIcon}><MaterialIcons name="check" size={21} color="#0C1018" /></View>
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>Picture-in-picture video created</Text>
            <Text style={styles.statusText}>This file contains your source clip, floating camera reaction, and both audio tracks.</Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable onPress={saveTake} disabled={isSaving} style={({ pressed }) => [styles.primaryButton, (pressed || isSaving) && styles.primaryPressed]}>
            {isSaving ? <ActivityIndicator color="#FFFFFF" /> : <MaterialIcons name="save-alt" size={22} color="#FFFFFF" />}
            <Text style={styles.primaryLabel}>{isSaving ? "Saving…" : "Save reaction video"}</Text>
          </Pressable>
          <Pressable onPress={shareTake} style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryPressed]}>
            <MaterialIcons name="ios-share" size={21} color="#FF8A6B" />
            <Text style={styles.secondaryLabel}>Share reaction video</Text>
          </Pressable>
          <Pressable onPress={() => { player.pause(); router.replace("/reaction-record" as never); }} style={styles.rerecordButton}>
            <Text style={styles.rerecordLabel}>Record again</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 36 },
  header: { alignItems: "center", flexDirection: "row", height: 58, justifyContent: "space-between" },
  closeButton: { alignItems: "center", height: 40, justifyContent: "center", width: 40 },
  headerTitle: { color: "#F7F8FA", fontSize: 17, fontWeight: "700" },
  previewCard: { aspectRatio: 9 / 14, backgroundColor: "#000000", borderColor: "#283244", borderRadius: 28, borderWidth: 1, overflow: "hidden", width: "100%" },
  preview: { flex: 1 },
  statusCard: { alignItems: "center", backgroundColor: "#171E2B", borderColor: "#283244", borderRadius: 18, borderWidth: 1, flexDirection: "row", marginTop: 17, padding: 14 },
  statusIcon: { alignItems: "center", backgroundColor: "#36C98A", borderRadius: 13, height: 28, justifyContent: "center", width: 28 },
  statusCopy: { flex: 1, marginLeft: 10 },
  statusTitle: { color: "#F7F8FA", fontSize: 14, fontWeight: "800" },
  statusText: { color: "#AAB3C2", fontSize: 12, lineHeight: 17, marginTop: 4 },
  composeNote: { alignItems: "flex-start", backgroundColor: "#32241F", borderRadius: 15, flexDirection: "row", gap: 9, marginTop: 13, padding: 13 },
  composeNoteText: { color: "#E8B7A7", flex: 1, fontSize: 12, lineHeight: 17 },
  actions: { marginTop: 24 },
  primaryButton: { alignItems: "center", backgroundColor: "#FF5C35", borderRadius: 18, flexDirection: "row", gap: 10, height: 57, justifyContent: "center" },
  primaryPressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  primaryLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  secondaryButton: { alignItems: "center", borderColor: "#465267", borderRadius: 17, borderWidth: 1, flexDirection: "row", gap: 8, height: 54, justifyContent: "center", marginTop: 10 },
  secondaryPressed: { opacity: 0.7 },
  secondaryLabel: { color: "#FF8A6B", fontSize: 15, fontWeight: "800" },
  rerecordButton: { alignItems: "center", justifyContent: "center", paddingVertical: 16 },
  rerecordLabel: { color: "#AAB3C2", fontSize: 14, fontWeight: "700" },
});
