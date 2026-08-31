import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { normalizeSharedLink } from "@/lib/reaction-project";
import { getCurrentSharedLink, setCurrentSharedLink, setCurrentSource } from "@/lib/reaction-session";

export default function SharedLinkScreen() {
  const params = useLocalSearchParams<{ url?: string | string[] }>();
  const incomingUrl = Array.isArray(params.url) ? params.url[0] : params.url;
  const existingLink = getCurrentSharedLink();
  const normalizedIncoming = incomingUrl ? normalizeSharedLink(incomingUrl) : null;
  const sharedUrl = normalizedIncoming ?? existingLink?.url ?? null;
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    if (normalizedIncoming) {
      setCurrentSharedLink({ url: normalizedIncoming, capturedAt: Date.now() });
    }
  }, [normalizedIncoming]);

  const sourceName = useMemo(() => {
    if (!sharedUrl) return "Shared link";
    try {
      return new URL(sharedUrl).hostname.replace(/^www\./, "");
    } catch {
      return "Shared link";
    }
  }, [sharedUrl]);

  async function importPublicVideo() {
    if (!sharedUrl || isImporting) return;
    setImportError(null);
    setIsImporting(true);

    try {
      let importedUri: string | null = null;
      let importedName: string = "Imported Video";

      // 1. Try server-side extractor & high-performance streaming proxy (available everywhere, web + app)
      try {
        const resp = await fetch("/api/import-media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: sharedUrl }),
        });
        const data = await resp.json();
        if (resp.ok && data.success && (data.streamUrl || data.directUrl)) {
          importedUri = data.streamUrl || data.directUrl;
          importedName = data.title || `${sourceName} Clip`;
        }
      } catch {
        // Fall back to on-device extractors.
      }

      // 2. Public Facebook / social pages often expose a direct mp4. Scrape and download it on-device.
      if (!importedUri && Platform.OS !== "web") {
        try {
          const { importPublicVideoFromPage } = await import("@/lib/public-link-import");
          const scraped = await importPublicVideoFromPage(sharedUrl);
          if (scraped?.uri) {
            importedUri = scraped.uri;
            importedName = scraped.fileName || importedName;
          }
        } catch (scrapeErr) {
          console.warn("Page scrape importer error:", scrapeErr);
        }
      }

      // 3. Native yt-dlp extractor (ReelImporter)
      if (!importedUri && Platform.OS !== "web") {
        try {
          const ReelImporter = (await import("reel-importer")).default;
          if (ReelImporter && typeof ReelImporter.downloadPublicVideo === "function") {
            const nativeResult = await ReelImporter.downloadPublicVideo(sharedUrl);
            if (nativeResult?.uri) {
              importedUri = nativeResult.uri;
              importedName = nativeResult.fileName || importedName;
            }
          }
        } catch (nativeErr) {
          console.warn("Native importer fallback error:", nativeErr);
        }
      }

      if (!importedUri) {
        throw new Error(
          `Could not extract a playable video from ${sourceName}. The link may be private or restricted. You can choose a saved video from your device instead.`
        );
      }

      setCurrentSource({
        uri: importedUri,
        name: importedName,
        durationMs: undefined,
        width: undefined,
        height: undefined,
      });
      router.replace("/source-setup" as never);
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "This link could not be downloaded. Choose a saved clip instead."
      );
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5" containerClassName="bg-[#080B11]">
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/")} hitSlop={12} style={styles.iconButton}>
          <MaterialIcons name="close" size={22} color="#F7F8FA" />
        </Pressable>
        <Text style={styles.headerTitle}>Shared post</Text>
        <View style={styles.iconButton} />
      </View>

      <View style={styles.linkBadge}>
        <MaterialIcons name="link" size={26} color="#38BDF8" />
      </View>
      <Text style={styles.heading}>{sharedUrl ? "Link captured" : "No link found"}</Text>
      <Text style={styles.subtitle}>
        {sharedUrl
          ? `Reel Reactor received a video link from ${sourceName}.`
          : "Paste a video link or share a post into Reel Reactor."}
      </Text>

      {sharedUrl ? (
        <View style={styles.urlCard}>
          <Text style={styles.urlLabel}>SOURCE LINK</Text>
          <Text style={styles.urlValue} numberOfLines={3}>{sharedUrl}</Text>
        </View>
      ) : null}

      <View style={styles.explanationCard}>
        <MaterialIcons name="info-outline" size={20} color="#94A3B8" />
        <Text style={styles.explanationText}>
          Reel Reactor extracts the video stream directly into your reaction studio. If a link is private or protected, you can select any saved clip from your device instead.
        </Text>
      </View>

      <View style={styles.spacer} />
      {sharedUrl ? (
        <Pressable
          disabled={isImporting}
          onPress={importPublicVideo}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || isImporting) && styles.primaryPressed,
          ]}
        >
          {isImporting ? (
            <ActivityIndicator size="small" color="#080B11" />
          ) : (
            <MaterialIcons name="download" size={22} color="#080B11" />
          )}
          <Text style={styles.primaryLabel}>
            {isImporting ? "Importing video…" : "Download & react"}
          </Text>
        </Pressable>
      ) : null}
      {importError ? <Text style={styles.importError}>{importError}</Text> : null}
      <Pressable
        onPress={() => router.replace("/")}
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.primaryPressed]}
      >
        <MaterialIcons name="video-library" size={20} color="#38BDF8" />
        <Text style={styles.secondaryLabel}>Choose saved video instead</Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", flexDirection: "row", height: 58, justifyContent: "space-between" },
  iconButton: { alignItems: "center", height: 40, justifyContent: "center", width: 40 },
  headerTitle: { color: "#F7F8FA", fontSize: 17, fontWeight: "700" },
  linkBadge: { alignItems: "center", backgroundColor: "rgba(56, 189, 248, 0.12)", borderColor: "rgba(56, 189, 248, 0.28)", borderRadius: 24, borderWidth: 1, height: 48, justifyContent: "center", marginTop: 28, width: 48 },
  heading: { color: "#F7F8FA", fontSize: 28, fontWeight: "800", letterSpacing: -0.8, marginTop: 16 },
  subtitle: { color: "#94A3B8", fontSize: 15, lineHeight: 22, marginTop: 8 },
  urlCard: { backgroundColor: "rgba(255, 255, 255, 0.04)", borderColor: "rgba(255, 255, 255, 0.12)", borderRadius: 16, borderWidth: 1, marginTop: 22, padding: 14 },
  urlLabel: { color: "#64748B", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  urlValue: { color: "#F7F8FA", fontSize: 13, lineHeight: 19, marginTop: 6 },
  explanationCard: { alignItems: "flex-start", backgroundColor: "rgba(255, 255, 255, 0.03)", borderColor: "rgba(255, 255, 255, 0.08)", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 10, marginTop: 14, padding: 14 },
  explanationText: { color: "#94A3B8", flex: 1, fontSize: 13, lineHeight: 19 },
  spacer: { flex: 1 },
  primaryButton: { alignItems: "center", backgroundColor: "#38BDF8", borderRadius: 16, flexDirection: "row", gap: 9, height: 56, justifyContent: "center" },
  primaryPressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  primaryLabel: { color: "#080B11", fontSize: 16, fontWeight: "800" },
  secondaryButton: { alignItems: "center", borderColor: "rgba(255, 255, 255, 0.14)", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 8, height: 52, justifyContent: "center", marginTop: 10 },
  secondaryLabel: { color: "#38BDF8", fontSize: 14, fontWeight: "800" },
  importError: { color: "#FCA5A5", fontSize: 12, lineHeight: 18, marginTop: 12, textAlign: "center" },
});
