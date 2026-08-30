import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { normalizeSharedLink, validateSourceVideo } from "@/lib/reaction-project";
import { setCurrentSharedLink, setCurrentSource } from "@/lib/reaction-session";

export default function HomeScreen() {
  const [isChoosing, setIsChoosing] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [isLinkEntryOpen, setIsLinkEntryOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  async function chooseVideo() {
    if (isChoosing) return;
    setPickerError(null);
    setIsChoosing(true);
    try {
      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["videos"],
        allowsMultipleSelection: false,
        quality: 1,
      };
      if (Platform.OS === "ios") {
        pickerOptions.preferredAssetRepresentationMode = ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible;
      }
      const result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
      if (result.canceled) return;

      const asset = result.assets[0];
      const message = validateSourceVideo(asset);
      if (message) {
        Alert.alert("Choose another clip", message);
        return;
      }

      if (Platform.OS === "web") {
        setCurrentSource({
          uri: asset.uri,
          name: asset.fileName ?? "Selected video",
          durationMs: asset.duration,
          width: asset.width,
          height: asset.height,
        });
        router.push("/source-setup" as never);
        return;
      }

      if (!FileSystem.cacheDirectory) {
        Alert.alert("Video storage unavailable", "Reel Reactor could not prepare this clip on your phone. Close the app, reopen it, and try again.");
        return;
      }

      const extension = asset.fileName?.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? ".mp4";
      const localUri = `\( {FileSystem.cacheDirectory}reel-reactor-source- \){Date.now()}${extension}`;
      try {
        let readableSourceUri = asset.uri;
        if (Platform.OS === "ios" && readableSourceUri.startsWith("ph://")) {
          if (!asset.assetId) {
            throw new Error("The photo library did not provide a readable video reference.");
          }
          const MediaLibrary = await import("expo-media-library");
          const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.assetId, { shouldDownloadFromNetwork: true });
          if (!assetInfo.localUri) {
            throw new Error("The selected video is not available locally yet. Download it from iCloud, then choose it again.");
          }
          readableSourceUri = assetInfo.localUri;
        }
        await FileSystem.copyAsync({ from: readableSourceUri, to: localUri });
        const localInfo = await FileSystem.getInfoAsync(localUri);
        if (!localInfo.exists || !localInfo.size) {
          throw new Error("The selected clip was empty after copying.");
        }
      } catch {
        Alert.alert("Could not prepare that video", "Reel Reactor needs a local copy of the selected clip before it can mix your reaction. Try selecting the clip again.");
        return;
      }

      setCurrentSource({
        uri: localUri,
        name: asset.fileName ?? "Selected video",
        durationMs: asset.duration,
        width: asset.width,
        height: asset.height,
      });
      router.push("/source-setup" as never);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please try selecting a video again.";
      setPickerError(`Could not open your videos: ${message}`);
      Alert.alert("Could not open your videos", message);
    } finally {
      setIsChoosing(false);
    }
  }

  function importByLink() {
    const sharedUrl = normalizeSharedLink(linkDraft);
    if (!sharedUrl) {
      setLinkError("Paste a full public link beginning with https://.");
      return;
    }
    setLinkError(null);
    setCurrentSharedLink({ url: sharedUrl, capturedAt: Date.now() });
    router.push({ pathname: "/shared-link", params: { url: sharedUrl } } as never);
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5" containerClassName="bg-[#080B11]">
      <ScrollView style={styles.page} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>REEL REACTOR · APPLE GLASS STUDIO</Text>
        <Text style={styles.heading}>React with green screen & glass UI.</Text>
        <Text style={styles.subheading}>Live chroma keying, movable camera overlay, and dual-track audio. Pick a clip to open the studio.</Text>

        <View style={styles.heroCard}>
          <View style={styles.fakeVideoFrame}>
            <View style={styles.fakeCaption} />
            <View style={styles.fakeCaptionShort} />
            <View style={styles.fakeOverlay}>
              <MaterialIcons name="face" size={34} color="#38BDF8" />
            </View>
            <View style={styles.fakeRecord} />
          </View>
          <View style={styles.heroCardBottom}>
            <View style={styles.styleRow}>
              <View style={[styles.stylePill, styles.stylePillActive]}><Text style={styles.stylePillActiveText}>Circle</Text></View>
              <View style={styles.stylePill}><Text style={styles.stylePillText}>Square</Text></View>
              <View style={styles.stylePill}><Text style={styles.stylePillText}>Cutout</Text></View>
            </View>
            <Text style={styles.heroCardTitle}>Picture-in-picture + green screen</Text>
            <Text style={styles.heroCardCopy}>Source clip stays on stage. Your camera is the overlay.</Text>
          </View>
        </View>

        <Pressable onPress={chooseVideo} disabled={isChoosing} style={({ pressed }) => [styles.primaryButton, (pressed || isChoosing) && styles.pressed]}>
          <MaterialIcons name="video-library" size={22} color="#080B11" />
          <Text style={styles.primaryLabel}>{isChoosing ? "Opening videos…" : "Choose a video"}</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setLinkError(null);
            setIsLinkEntryOpen((open) => !open);
          }}
          style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
        >
          <MaterialIcons name="link" size={21} color="#38BDF8" />
          <Text style={styles.linkButtonLabel}>{isLinkEntryOpen ? "Hide link importer" : "Import video by link"}</Text>
        </Pressable>
        {isLinkEntryOpen ? (
          <View style={styles.linkImporter}>
            <Text style={styles.linkImporterTitle}>Paste a public reel link</Text>
            <Text style={styles.linkImporterCopy}>Downloads locally, then opens reaction setup.</Text>
            <TextInput
              value={linkDraft}
              onChangeText={(value) => {
                setLinkDraft(value);
                if (linkError) setLinkError(null);
              }}
              onSubmitEditing={importByLink}
              placeholder="https://…"
              placeholderTextColor="#64748B"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              style={styles.linkInput}
            />
            <Pressable onPress={importByLink} style={({ pressed }) => [styles.linkSubmit, pressed && styles.pressed]}>
              <MaterialIcons name="download" size={19} color="#080B11" />
              <Text style={styles.linkSubmitLabel}>Continue with link</Text>
            </Pressable>
            {linkError ? <Text style={styles.error}>{linkError}</Text> : null}
          </View>
        ) : null}
        {pickerError ? <Text style={styles.error}>{pickerError}</Text> : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  pageContent: { flexGrow: 1, paddingBottom: 122, paddingTop: 8 },
  eyebrow: { color: "#38BDF8", fontSize: 11, fontWeight: "800", letterSpacing: 1.6, marginBottom: 10 },
  heading: { color: "#F7F8FA", fontSize: 34, fontWeight: "800", letterSpacing: -1.1, lineHeight: 38 },
  subheading: { color: "#94A3B8", fontSize: 15, lineHeight: 22, marginTop: 12, maxWidth: 340 },
  heroCard: { backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.12)", borderRadius: 24, borderWidth: 1, marginTop: 24, overflow: "hidden" },
  fakeVideoFrame: { backgroundColor: "#0A1018", height: 210, overflow: "hidden", position: "relative" },
  fakeCaption: { backgroundColor: "rgba(247,248,250,0.55)", borderRadius: 4, height: 8, left: 18, position: "absolute", top: 24, width: 120 },
  fakeCaptionShort: { backgroundColor: "rgba(247,248,250,0.28)", borderRadius: 4, height: 8, left: 18, position: "absolute", top: 38, width: 72 },
  fakeOverlay: { alignItems: "center", backgroundColor: "#152033", borderColor: "#FFFFFF", borderRadius: 48, borderWidth: 3, height: 96, justifyContent: "center", position: "absolute", right: 18, top: 20, width: 96 },
  fakeRecord: { backgroundColor: "#EF4444", borderColor: "#FFFFFF", borderRadius: 22, borderWidth: 3, bottom: 16, height: 44, left: "50%", marginLeft: -22, position: "absolute", width: 44 },
  heroCardBottom: { padding: 16 },
  styleRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  stylePill: { backgroundColor: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)", borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  stylePillActive: { backgroundColor: "#38BDF8", borderColor: "#38BDF8" },
  stylePillText: { color: "#94A3B8", fontSize: 12, fontWeight: "700" },
  stylePillActiveText: { color: "#080B11", fontSize: 12, fontWeight: "800" },
  heroCardTitle: { color: "#F7F8FA", fontSize: 16, fontWeight: "800" },
  heroCardCopy: { color: "#94A3B8", fontSize: 13, lineHeight: 19, marginTop: 4 },
  primaryButton: { alignItems: "center", backgroundColor: "#38BDF8", borderRadius: 16, flexDirection: "row", gap: 10, height: 56, justifyContent: "center", marginTop: 22 },
  pressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  primaryLabel: { color: "#080B11", fontSize: 16, fontWeight: "800" },
  linkButton: { alignItems: "center", borderColor: "rgba(255,255,255,0.15)", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 8, height: 52, justifyContent: "center", marginTop: 10 },
  linkButtonLabel: { color: "#38BDF8", fontSize: 14, fontWeight: "800" },
  linkImporter: { backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.12)", borderRadius: 16, borderWidth: 1, marginTop: 12, padding: 14 },
  linkImporterTitle: { color: "#F7F8FA", fontSize: 14, fontWeight: "800" },
  linkImporterCopy: { color: "#94A3B8", fontSize: 12, lineHeight: 17, marginTop: 5 },
  linkInput: { backgroundColor: "#080B11", borderColor: "rgba(255,255,255,0.14)", borderRadius: 12, borderWidth: 1, color: "#F7F8FA", fontSize: 14, height: 48, marginTop: 12, paddingHorizontal: 13 },
  linkSubmit: { alignItems: "center", backgroundColor: "#38BDF8", borderRadius: 13, flexDirection: "row", gap: 7, height: 47, justifyContent: "center", marginTop: 10 },
  linkSubmitLabel: { color: "#080B11", fontSize: 14, fontWeight: "800" },
  error: { color: "#FCA5A5", fontSize: 12, lineHeight: 17, marginTop: 9 },
});
