import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";

import { ScreenContainer } from "@/components/screen-container";
import { getCurrentSharedLink, getCurrentSource } from "@/lib/reaction-session";

export default function SourceSetupWebScreen() {
  const source = getCurrentSource();
  const sharedLink = getCurrentSharedLink();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(
    source?.durationMs ? Math.round(source.durationMs / 1000) : null
  );

  useEffect(() => {
    if (!source) {
      router.replace("/");
    }
    const videoEl = videoRef.current;
    return () => {
      if (videoEl) {
        try {
          videoEl.pause();
          videoEl.removeAttribute("src");
          videoEl.load();
        } catch {}
      }
    };
  }, [source]);

  if (!source) return null;

  function togglePlay() {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }

  function handleOpenStudio() {
    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {}
    }
    router.push("/reaction-record" as never);
  }

  function handleLoadedMetadata() {
    if (videoRef.current) {
      setIsLoaded(true);
      setLoadError(null);
      if (videoRef.current.duration && !isNaN(videoRef.current.duration)) {
        setVideoDuration(Math.round(videoRef.current.duration));
      }
    }
  }

  function handleVideoError() {
    console.warn("Video failed to load in setup:", source?.uri);
    setLoadError("Video stream is buffering or protected. You can still open the studio to test.");
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5" containerClassName="bg-[#080B11]">
      <main style={webStyles.page}>
        <header style={webStyles.header}>
          <button type="button" onClick={() => router.replace("/")} style={webStyles.backBtn}>
            <MaterialIcons name="arrow-back" size={20} color="#F7F8FA" />
            <span style={{ marginLeft: 6, fontSize: 14 }}>Change clip</span>
          </button>
          <div style={webStyles.headerTitle}>Reaction Setup</div>
          <div style={{ width: 90 }} />
        </header>

        <div style={webStyles.container}>
          <div style={webStyles.previewCard}>
            <div style={webStyles.videoWrapper}>
              <video
                ref={videoRef}
                src={source.uri}
                crossOrigin="anonymous"
                preload="auto"
                playsInline
                loop
                onLoadedMetadata={handleLoadedMetadata}
                onLoadedData={() => setIsLoaded(true)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onError={handleVideoError}
                style={webStyles.videoElement}
              />
              
              {!isLoaded && !loadError ? (
                <div style={webStyles.loadingOverlay}>
                  <div style={webStyles.spinner} />
                  <span style={webStyles.loadingText}>Loading video preview…</span>
                </div>
              ) : null}

              <button type="button" onClick={togglePlay} style={webStyles.playToggleBtn}>
                <MaterialIcons name={isPlaying ? "pause" : "play-arrow"} size={28} color="#FFFFFF" />
              </button>
            </div>

            {loadError ? (
              <div style={webStyles.warningBanner}>
                <MaterialIcons name="info" size={18} color="#FBBF24" />
                <span style={webStyles.warningText}>{loadError}</span>
              </div>
            ) : null}
          </div>

          <div style={webStyles.sourceCard}>
            <div style={webStyles.sourceIcon}>
              <MaterialIcons name="movie" size={24} color="#38BDF8" />
            </div>
            <div style={webStyles.sourceDetails}>
              <span style={webStyles.sourceTitle}>{source.name}</span>
              <span style={webStyles.sourceMeta}>
                {videoDuration ? `${videoDuration}s duration` : "Source clip"}
                {sharedLink ? ` · ${new URL(sharedLink.url).hostname.replace(/^www\./, "")}` : " · Local source"}
              </span>
            </div>
            <button type="button" onClick={() => router.replace("/")} style={webStyles.changeBtn}>
              Replace
            </button>
          </div>

          <div style={webStyles.tipCard}>
            <MaterialIcons name="auto-awesome" size={20} color="#38BDF8" />
            <div style={webStyles.tipCopy}>
              <strong>Apple Glass Studio Ready</strong>
              <p style={{ margin: "4px 0 0", color: "#94A3B8", fontSize: 13, lineHeight: 1.5 }}>
                In the reaction studio, your webcam bubble will float over this video. You can drag the camera, choose circular or green-screen cutout, and balance microphone levels in real time.
              </p>
            </div>
          </div>

          <div style={webStyles.dock}>
            <button
              type="button"
              onClick={handleOpenStudio}
              style={webStyles.primaryBtn}
            >
              <MaterialIcons name="video-camera-front" size={22} color="#080B11" />
              <span style={webStyles.primaryBtnText}>Open Reaction Studio</span>
            </button>
            <span style={webStyles.dockFootnote}>Step 2 of 3: Position camera bubble & record reaction</span>
          </div>
        </div>
      </main>
    </ScreenContainer>
  );
}

const webStyles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", display: "flex", flexDirection: "column", maxWidth: 680, margin: "0 auto", width: "100%", paddingBottom: 40 },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", height: 64, borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 20 },
  backBtn: { display: "flex", alignItems: "center", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#F7F8FA", padding: "8px 14px", borderRadius: 12, cursor: "pointer", fontWeight: 600 },
  headerTitle: { color: "#F7F8FA", fontSize: 17, fontWeight: 700 },
  container: { display: "flex", flexDirection: "column", gap: 16 },
  previewCard: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 24, padding: 14, boxShadow: "0 20px 50px rgba(0,0,0,0.5)" },
  videoWrapper: { position: "relative", width: "100%", aspectRatio: "16 / 9", maxHeight: 360, background: "#000000", borderRadius: 16, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" },
  videoElement: { width: "100%", height: "100%", objectFit: "contain", background: "#000000" },
  loadingOverlay: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(8,11,17,0.7)", gap: 10 },
  spinner: { width: 28, height: 28, border: "3px solid rgba(56,189,248,0.2)", borderTopColor: "#38BDF8", borderRadius: "50%", animation: "spin 1s linear infinite" },
  loadingText: { color: "#94A3B8", fontSize: 13, fontWeight: 500 },
  playToggleBtn: { position: "absolute", bottom: 12, right: 12, background: "rgba(8, 11, 17, 0.75)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 24, width: 44, height: 44, display: "grid", placeItems: "center", cursor: "pointer" },
  warningBanner: { display: "flex", alignItems: "center", gap: 8, background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: 12, padding: "10px 14px", marginTop: 12 },
  warningText: { color: "#FDE68A", fontSize: 12, lineHeight: 1.4 },
  sourceCard: { display: "flex", alignItems: "center", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: 14, gap: 14 },
  sourceIcon: { width: 44, height: 44, borderRadius: 12, background: "rgba(56, 189, 248, 0.12)", display: "grid", placeItems: "center", flexShrink: 0 },
  sourceDetails: { display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" },
  sourceTitle: { color: "#F7F8FA", fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  sourceMeta: { color: "#94A3B8", fontSize: 12, marginTop: 3 },
  changeBtn: { background: "transparent", border: 0, color: "#38BDF8", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: "6px 10px" },
  tipCard: { display: "flex", alignItems: "flex-start", gap: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, padding: 16 },
  tipCopy: { flex: 1, color: "#F7F8FA", fontSize: 14 },
  dock: { marginTop: 12, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" },
  primaryBtn: { width: "100%", background: "#38BDF8", border: 0, borderRadius: 18, height: 58, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer", boxShadow: "0 10px 30px rgba(56, 189, 248, 0.3)" },
  primaryBtnText: { color: "#080B11", fontSize: 16, fontWeight: 800 },
  dockFootnote: { color: "#64748B", fontSize: 12, fontWeight: 500 },
};
