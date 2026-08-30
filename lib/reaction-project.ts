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

export function normalizeSharedLink(value: string): string | null {
  const candidate = value.trim();
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
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

/**
 * The browser prototype stops its recording when the source clip ends. The
 * native studio keeps the same rule, but only while the camera recorder is
 * active and a stop has not already been requested by the creator.
 */
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

/**
 * Matches expo-video's `contentFit="contain"` rectangle. Keeping this mapping
 * pure means the mobile preview and the FFmpeg export can use the same geometry.
 */
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
