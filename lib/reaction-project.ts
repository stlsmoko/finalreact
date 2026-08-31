export type OverlayPosition = {
  x: number;
  y: number;
};

export type VideoRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function validateSourceVideo(input: {
  uri?: string | null;
  type?: string | null;
  duration?: number | null;
}): string | null {
  if (!input.uri) return "Choose a video before opening the studio.";
  if (input.type && input.type !== "video") return "Choose a video file rather than an image.";
  return null;
}

const BARE_SOCIAL_PATH =
  /(?:www\.)?(?:facebook\.com|fb\.watch|fb\.com|instagram\.com|instagr\.am|tiktok\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|threads\.net|reddit\.com|redd\.it)\/[^\s<>"']+/i;

function cleanUrlCandidate(raw: string): string {
  return raw
    .trim()
    .replace(/^[\'"`<(]+/, "")
    .replace(/[\'"`)>]+$/, "")
    .replace(/[),.;!?]+$/g, "")
    .replace(/\\+$/g, "")
    .trim();
}

function asHttpUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Accepts a bare URL or messy share text from Facebook, Instagram, TikTok, X, YouTube, and similar apps.
 */
export function normalizeSharedLink(value: string): string | null {
  const text = value.replace(/\u00a0/g, " ").trim();
  if (!text) return null;

  const candidates: string[] = [];
  const matches = text.match(/https?:\/\/[^\s<>"']+/gi);
  if (matches) candidates.push(...matches);

  if (!candidates.length) {
    const bare = text.match(BARE_SOCIAL_PATH);
    if (bare?.[0]) candidates.push(`https://${bare[0].replace(/^\/\//, "")}`);
  }

  if (!candidates.length) {
    const direct = asHttpUrl(cleanUrlCandidate(text));
    if (direct) return direct;
    return null;
  }

  for (const raw of candidates) {
    const direct = asHttpUrl(cleanUrlCandidate(raw));
    if (direct) return direct;
  }
  return null;
}

export function getRecordingStartBlocker(input: {
  platform: string;
  cameraReady: boolean;
  hasCameraRef: boolean;
}): string | null {
  if (input.platform === "web") {
    return "Browser preview cannot record a reaction. Open Reel Reactor in the Android or iPhone build to record with camera and microphone.";
  }
  if (!input.cameraReady || !input.hasCameraRef) {
    return "Camera preview is not ready yet. Wait for Ready to react, then tap Start recording.";
  }
  return null;
}

export function beginReactionCameraRecording<T>(input: {
  startCameraRecording: () => Promise<T>;
  startSourcePlayback: () => void | Promise<void>;
  onSourcePlaybackIssue: () => void;
}): Promise<T> {
  const recordingPromise = input.startCameraRecording();
  try {
    Promise.resolve(input.startSourcePlayback()).catch(input.onSourcePlaybackIssue);
  } catch {
    input.onSourcePlaybackIssue();
  }
  return recordingPromise;
}

export function shouldStopReactionForSourceEnd(input: {
  isRecording: boolean;
  isCompositing: boolean;
  stopAlreadyRequested: boolean;
}) {
  return input.isRecording && !input.isCompositing && !input.stopAlreadyRequested;
}

export function clampOverlay(
  position: OverlayPosition,
  bounds: { width: number; height: number },
  overlaySize: number,
): OverlayPosition {
  const horizontalInset = 16;
  const topInset = 96;
  const bottomInset = 140;
  return {
    x: Math.max(horizontalInset, Math.min(position.x, Math.max(horizontalInset, bounds.width - overlaySize - horizontalInset))),
    y: Math.max(topInset, Math.min(position.y, Math.max(topInset, bounds.height - overlaySize - bottomInset))),
  };
}

export function getContainedVideoRect(
  container: { width: number; height: number },
  video: { width?: number; height?: number },
): VideoRect {
  const containerWidth = Math.max(1, container.width);
  const containerHeight = Math.max(1, container.height);
  const videoWidth = video.width && video.width > 0 ? video.width : 720;
  const videoHeight = video.height && video.height > 0 ? video.height : 1280;
  const scale = Math.min(containerWidth / videoWidth, containerHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;

  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  };
}

export function clampOverlayToRect(position: OverlayPosition, rect: VideoRect, size: number): OverlayPosition {
  const maxX = Math.max(rect.x, rect.x + rect.width - size);
  const maxY = Math.max(rect.y, rect.y + rect.height - size);
  return {
    x: Math.max(rect.x, Math.min(position.x, maxX)),
    y: Math.max(rect.y, Math.min(position.y, maxY)),
  };
}
