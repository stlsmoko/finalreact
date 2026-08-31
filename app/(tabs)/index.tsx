import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { normalizeSharedLink, validateSourceVideo } from "@/lib/reaction-project";
import { setCurrentSharedLink, setCurrentSource } from "@/lib/reaction-session";

type IngestTab = "upload" | "link" | "sample";

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState<IngestTab>("upload");
  const [isChoosing, setIsChoosing] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isLoadingSample, setIsLoadingSample] = useState(false);

  async function handleSelectAsset(asset: ImagePicker.ImagePickerAsset) {
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
      router.push("/reaction-record" as never);
      return;
    }

    if (!FileSystem.cacheDirectory) {
      Alert.alert(
        "Video storage unavailable",
        "Reel Reactor could not prepare this clip on your phone. Close the app, reopen it, and try again."
      );
      return;
    }

    const extension = asset.fileName?.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? ".mp4";
    const localUri = `${FileSystem.cacheDirectory}reel-reactor-source-${Date.now()}${extension}`;
    try {
      let readableSourceUri = asset.uri;
      if (Platform.OS === "ios" && readableSourceUri.startsWith("ph://")) {
        if (!asset.assetId) {
          throw new Error("The photo library did not provide a readable video reference.");
        }
        const MediaLibrary = await import("expo-media-library");
        const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.assetId, {
          shouldDownloadFromNetwork: true,
        });
        if (!assetInfo.localUri) {
          throw new Error(
            "The selected video is not available locally yet. Download it from iCloud, then choose it again."
          );
        }
        readableSourceUri = assetInfo.localUri;
      }
      await FileSystem.copyAsync({ from: readableSourceUri, to: localUri });
      const localInfo = await FileSystem.getInfoAsync(localUri);
      if (!localInfo.exists || !localInfo.size) {
        throw new Error("The selected clip was empty after copying.");
      }
    } catch {
      Alert.alert(
        "Could not prepare that video",
        "Reel Reactor needs a local copy of the selected clip before it can mix your reaction. Try selecting the clip again."
      );
      return;
    }

    setCurrentSource({
      uri: localUri,
      name: asset.fileName ?? "Selected video",
      durationMs: asset.duration,
      width: asset.width,
      height: asset.height,
    });
    router.push("/reaction-record" as never);
  }

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
        pickerOptions.preferredAssetRepresentationMode =
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible;
      }
      const result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
      if (result.canceled) return;

      const asset = result.assets[0];
      await handleSelectAsset(asset);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please try selecting a video again.";
      setPickerError(`Could not open your videos: ${message}`);
      Alert.alert("Could not open your videos", message);
    } finally {
      setIsChoosing(false);
    }
  }

  function importByLink(urlToImport?: string) {
    const targetUrl = urlToImport ?? linkDraft;
    const sharedUrl = normalizeSharedLink(targetUrl);
    if (!sharedUrl) {
      setLinkError("Paste a full public link beginning with https://.");
      return;
    }
    setLinkError(null);
    setCurrentSharedLink({ url: sharedUrl, capturedAt: Date.now() });
    router.push({ pathname: "/shared-link", params: { url: sharedUrl } } as never);
  }

  async function loadSample(name: string, sampleUri: string) {
    setIsLoadingSample(true);
    try {
      if (Platform.OS === "web") {
        setCurrentSource({
          uri: sampleUri,
          name,
          durationMs: 15000,
          width: 720,
          height: 1280,
        });
        router.push("/reaction-record" as never);
        return;
      }

      if (sampleUri.startsWith("http://") || sampleUri.startsWith("https://")) {
        const localUri = `${FileSystem.cacheDirectory}sample-${Date.now()}.mp4`;
        const downloadRes = await FileSystem.downloadAsync(sampleUri, localUri);
        setCurrentSource({
          uri: downloadRes.uri,
          name,
          durationMs: 15000,
          width: 720,
          height: 1280,
        });
        router.push("/reaction-record" as never);
        return;
      }

      setCurrentSource({
        uri: sampleUri,
        name,
        durationMs: 15000,
        width: 720,
        height: 1280,
      });
      router.push("/reaction-record" as never);
    } catch {
      Alert.alert("Sample unavailable", "Could not load sample video. Try choosing a video from your library.");
    } finally {
      setIsLoadingSample(false);
    }
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-black" safeAreaClassName="bg-black">
      <View style={styles.appContainer}>
        {/* Minimal Top Bar */}
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <View style={styles.brandDot} />
            <Text style={styles.brandText}>Reel Reactor</Text>
          </View>
        </View>

        {/* Viewfinder Wrapper / Centered Stage Area */}
        <View style={styles.viewportWrapper}>
          <ScrollView
            contentContainerStyle={styles.scrollCenter}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Ingest Card (Apple Modal Screen matching website) */}
            <View style={styles.ingestCard}>
              <Text style={styles.ingestTitle}>Select Reaction Clip</Text>
              <Text style={styles.ingestDesc}>
                Choose a video from your library, paste a social link, or test with a sample.
              </Text>

              {/* Segmented Ingest Picker */}
              <View style={styles.segmentedControl}>
                <Pressable
                  onPress={() => setActiveTab("upload")}
                  style={[styles.segBtn, activeTab === "upload" && styles.segBtnActive]}
                >
                  <Text style={[styles.segBtnText, activeTab === "upload" && styles.segBtnTextActive]}>
                    Upload
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setActiveTab("link")}
                  style={[styles.segBtn, activeTab === "link" && styles.segBtnActive]}
                >
                  <Text style={[styles.segBtnText, activeTab === "link" && styles.segBtnTextActive]}>
                    Link
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setActiveTab("sample")}
                  style={[styles.segBtn, activeTab === "sample" && styles.segBtnActive]}
                >
                  <Text style={[styles.segBtnText, activeTab === "sample" && styles.segBtnTextActive]}>
                    Demo
                  </Text>
                </Pressable>
              </View>

              {/* Tab Bodies */}
              <View style={styles.ingestBody}>
                {activeTab === "upload" ? (
                  <View style={styles.panelUpload}>
                    <Pressable
                      onPress={chooseVideo}
                      disabled={isChoosing}
                      style={({ pressed }) => [styles.btnApplePrimary, (pressed || isChoosing) && styles.btnPressed]}
                    >
                      <MaterialIcons name="file-upload" size={20} color="#000000" />
                      <Text style={styles.btnApplePrimaryText}>
                        {isChoosing ? "Opening videos…" : "Choose Video File"}
                      </Text>
                    </Pressable>
                    {pickerError ? <Text style={styles.errorText}>{pickerError}</Text> : null}
                  </View>
                ) : null}

                {activeTab === "link" ? (
                  <View style={styles.panelLink}>
                    <View style={styles.linkInputGroup}>
                      <TextInput
                        value={linkDraft}
                        onChangeText={(val) => {
                          setLinkDraft(val);
                          if (linkError) setLinkError(null);
                        }}
                        onSubmitEditing={() => importByLink()}
                        placeholder="Paste link (TikTok, X, MP4, Drive)…"
                        placeholderTextColor="#515154"
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                        returnKeyType="go"
                        style={styles.appleInput}
                      />
                      <Pressable
                        onPress={() => importByLink()}
                        style={({ pressed }) => [styles.btnInputSubmit, pressed && styles.btnPressed]}
                      >
                        <Text style={styles.btnInputSubmitText}>Import</Text>
                      </Pressable>
                    </View>
                    {linkError ? <Text style={styles.errorText}>{linkError}</Text> : null}

                    <View style={styles.sampleRow}>
                      <Pressable
                        onPress={() =>
                          importByLink(
                            "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
                          )
                        }
                        style={({ pressed }) => [styles.btnSampleChipSmall, pressed && styles.btnPressed]}
                      >
                        <Text style={styles.btnSampleChipTextSmall}>🌸 Sample MP4</Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          importByLink(
                            "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4"
                          )
                        }
                        style={({ pressed }) => [styles.btnSampleChipSmall, pressed && styles.btnPressed]}
                      >
                        <Text style={styles.btnSampleChipTextSmall}>🛹 Action Clip</Text>
                      </Pressable>
                    </View>

                    <Text style={styles.linkHelpText}>
                      Supports Direct MP4, Google Drive, Dropbox, X/Twitter, TikTok, & web video links.
                    </Text>
                  </View>
                ) : null}

                {activeTab === "sample" ? (
                  <View style={styles.panelSample}>
                    <View style={styles.sampleRow}>
                      <Pressable
                        disabled={isLoadingSample}
                        onPress={() =>
                          loadSample(
                            "🛹 Skate Clip",
                            "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
                          )
                        }
                        style={({ pressed }) => [styles.btnSampleChip, (pressed || isLoadingSample) && styles.btnPressed]}
                      >
                        <Text style={styles.btnSampleChipText}>🛹 Skate</Text>
                      </Pressable>
                      <Pressable
                        disabled={isLoadingSample}
                        onPress={() =>
                          loadSample(
                            "🎮 Gaming Play",
                            "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4"
                          )
                        }
                        style={({ pressed }) => [styles.btnSampleChip, (pressed || isLoadingSample) && styles.btnPressed]}
                      >
                        <Text style={styles.btnSampleChipText}>🎮 Gaming</Text>
                      </Pressable>
                      <Pressable
                        disabled={isLoadingSample}
                        onPress={() =>
                          loadSample(
                            "🌊 Ocean Vista",
                            "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4"
                          )
                        }
                        style={({ pressed }) => [styles.btnSampleChip, (pressed || isLoadingSample) && styles.btnPressed]}
                      >
                        <Text style={styles.btnSampleChipText}>🌊 Ocean</Text>
                      </Pressable>
                    </View>
                    {isLoadingSample ? (
                      <Text style={styles.loadingSampleText}>Preparing sample clip…</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    backgroundColor: "#000000",
    flex: 1,
    paddingHorizontal: 16,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    height: 48,
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  brand: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  brandDot: {
    backgroundColor: "#FF3B30",
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  brandText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  viewportWrapper: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    width: "100%",
  },
  scrollCenter: {
    alignItems: "center",
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 20,
    width: "100%",
  },
  ingestCard: {
    alignItems: "center",
    backgroundColor: "#18181C",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 28,
    borderWidth: 1,
    gap: 18,
    maxWidth: 340,
    paddingHorizontal: 20,
    paddingVertical: 28,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.8,
    shadowRadius: 36,
    width: "100%",
  },
  ingestTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  ingestDesc: {
    color: "#86868B",
    fontSize: 13,
    lineHeight: 18,
    maxWidth: 280,
    textAlign: "center",
  },
  segmentedControl: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 14,
    flexDirection: "row",
    maxWidth: 300,
    padding: 3,
    width: "100%",
  },
  segBtn: {
    alignItems: "center",
    borderRadius: 11,
    flex: 1,
    justifyContent: "center",
    paddingVertical: 8,
  },
  segBtnActive: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  segBtnText: {
    color: "#86868B",
    fontSize: 13,
    fontWeight: "600",
  },
  segBtnTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  ingestBody: {
    maxWidth: 300,
    width: "100%",
  },
  panelUpload: {
    alignItems: "center",
    width: "100%",
  },
  btnApplePrimary: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    height: 48,
    justifyContent: "center",
    width: "100%",
  },
  btnApplePrimaryText: {
    color: "#000000",
    fontSize: 15,
    fontWeight: "700",
  },
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  panelLink: {
    gap: 10,
    width: "100%",
  },
  linkInputGroup: {
    flexDirection: "row",
    gap: 8,
    width: "100%",
  },
  appleInput: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    color: "#FFFFFF",
    flex: 1,
    fontSize: 13,
    height: 46,
    paddingHorizontal: 12,
  },
  btnInputSubmit: {
    alignItems: "center",
    backgroundColor: "#0A84FF",
    borderRadius: 12,
    height: 46,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  btnInputSubmitText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  sampleRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    width: "100%",
  },
  btnSampleChipSmall: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    paddingVertical: 8,
  },
  btnSampleChipTextSmall: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
  linkHelpText: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
    textAlign: "center",
  },
  panelSample: {
    gap: 10,
    width: "100%",
  },
  btnSampleChip: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    paddingVertical: 12,
  },
  btnSampleChipText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  loadingSampleText: {
    color: "#86868B",
    fontSize: 11,
    marginTop: 4,
    textAlign: "center",
  },
  errorText: {
    color: "#FF453A",
    fontSize: 12,
    marginTop: 6,
    textAlign: "center",
  },
});
