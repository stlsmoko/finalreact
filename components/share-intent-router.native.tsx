import { useShareIntent } from "expo-share-intent";
import { router } from "expo-router";
import { useEffect, useRef } from "react";

import { normalizeSharedLink } from "@/lib/reaction-project";
import { setCurrentSharedLink, setCurrentSource } from "@/lib/reaction-session";

export function ShareIntentRouter() {
  const { hasShareIntent, isReady, shareIntent, resetShareIntent } = useShareIntent({ resetOnBackground: false });
  const handledSignature = useRef<string | null>(null);

  useEffect(() => {
    if (!isReady || !hasShareIntent || !shareIntent) return;

    const video = shareIntent.files?.find((file) => file.mimeType?.startsWith("video/"));
    if (video) {
      const signature = `video:${video.path}:${video.size ?? "unknown"}`;
      if (handledSignature.current === signature) return;
      handledSignature.current = signature;
      setCurrentSource({
        uri: video.path,
        name: video.fileName || "Shared video",
        durationMs: video.duration,
        width: video.width ?? undefined,
        height: video.height ?? undefined,
      });
      resetShareIntent();
      router.replace("/source-setup" as never);
      return;
    }

    const sharedUrl = normalizeSharedLink(shareIntent.webUrl ?? shareIntent.text ?? "");
    if (!sharedUrl) return;
    const signature = `url:${sharedUrl}`;
    if (handledSignature.current === signature) return;
    handledSignature.current = signature;
    setCurrentSharedLink({ url: sharedUrl, capturedAt: Date.now() });
    resetShareIntent();
    router.replace({ pathname: "/shared-link", params: { url: sharedUrl } } as never);
  }, [hasShareIntent, isReady, resetShareIntent, shareIntent]);

  return null;
}
