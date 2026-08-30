import { router } from "expo-router";
import { useEffect, useState } from "react";

import { getCurrentReaction } from "@/lib/reaction-session";

export default function DesktopReviewScreen() {
  const take = getCurrentReaction();
  const takeUri = take?.uri;
  const outputUri = takeUri ?? "";
  const recordedAt = take?.recordedAt ?? 0;
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    if (!takeUri || !take?.isComposite) router.replace("/");
  }, [take?.isComposite, takeUri]);

  if (!takeUri || !take?.isComposite) return null;

  function download() {
    const anchor = document.createElement("a");
    anchor.href = outputUri;
    anchor.download = `reel-reactor-reaction-${new Date(recordedAt).toISOString().replace(/[:.]/g, "-")}.webm`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setDownloaded(true);
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.eyebrow}>DESKTOP EXPORT READY</div>
        <h1 style={styles.title}>Your combined reaction video is ready.</h1>
        <p style={styles.copy}>This recording was rendered in the browser from the source video, your webcam bubble, source audio, and microphone audio.</p>
        <video src={takeUri} controls style={styles.video} />
        <div style={styles.actions}>
          <button type="button" onClick={download} style={styles.primary}>{downloaded ? "Downloaded" : "Download reaction video"}</button>
          <button type="button" onClick={() => router.replace("/reaction-record" as never)} style={styles.secondary}>Record again</button>
        </div>
        <p style={styles.note}>Desktop browsers usually save this format as WebM. It is a complete combined video; no screen recording is required.</p>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", display: "grid", placeItems: "center", padding: 32, background: "#0C1018", color: "#F7F8FA", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" },
  card: { width: "min(860px, 100%)", background: "#171E2B", border: "1px solid #283244", borderRadius: 28, padding: "32px", boxSizing: "border-box" },
  eyebrow: { color: "#36C98A", fontSize: 11, fontWeight: 800, letterSpacing: "0.13em" },
  title: { margin: "10px 0", fontSize: "clamp(28px, 4vw, 44px)", letterSpacing: "-0.045em" },
  copy: { color: "#AAB3C2", fontSize: 15, lineHeight: 1.5, maxWidth: 650 },
  video: { width: "100%", maxHeight: "65vh", marginTop: 20, borderRadius: 18, background: "#000" },
  actions: { display: "flex", gap: 12, marginTop: 22, flexWrap: "wrap" },
  primary: { border: 0, background: "#FF5C35", color: "#FFFFFF", cursor: "pointer", borderRadius: 14, padding: "15px 19px", fontSize: 15, fontWeight: 900 },
  secondary: { border: "1px solid #465267", background: "transparent", color: "#F7F8FA", cursor: "pointer", borderRadius: 14, padding: "15px 19px", fontSize: 15, fontWeight: 800 },
  note: { color: "#8792A3", fontSize: 12, lineHeight: 1.5, marginTop: 18 },
};
