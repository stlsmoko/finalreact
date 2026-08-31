import * as FileSystem from "expo-file-system/legacy";

import { buildCompositeCommand } from "@/lib/video-compositor-command";

export type CompositeRequest = {
  sourceUri: string;
  reactionUri: string;
  overlay: { x: number; y: number; size: number };
  studioSize: { width: number; height: number };
  sourceSize?: { width?: number; height?: number };
  overlayStyle?: "circle" | "square" | "green-screen" | "cutout";
  sourcePauses?: { sourceTimeSec: number; durationSec: number }[];
  stopDurationSec?: number;
  sourceAudioGain?: number;
  reactionAudioGain?: number;
  onProgress?: (processedMs: number) => void;
};

const MIN_MEDIA_BYTES = 1_024;
const MAX_LOG_LINES = 18;

function getCacheDirectory() {
  if (!FileSystem.cacheDirectory) {
    throw new Error("The device cache directory is unavailable for the merged video.");
  }
  return FileSystem.cacheDirectory;
}

function safeExtension(uri: string) {
  const candidate = uri.split("?")[0].match(/\.([a-z0-9]{2,5})$/i)?.[1];
  return candidate ? `.${candidate.toLowerCase()}` : ".mp4";
}

async function ensureReadableMedia(label: string, uri: string) {
  if (!uri) {
    throw new Error(`${label} video path is missing.`);
  }

  let localUri = uri;
  if (uri.startsWith("ph://")) {
    throw new Error(`${label} video is still a photo-library reference. Choose the video again so Reel Reactor can prepare a local copy before rendering.`);
  }
  if (uri.startsWith("content://")) {
    localUri = `${getCacheDirectory()}reel-reactor-${label.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}${safeExtension(uri)}`;
    try {
      await FileSystem.copyAsync({ from: uri, to: localUri });
    } catch {
      throw new Error(`${label} video could not be copied from Android media storage. Choose the video again and try recording once more.`);
    }
  }

  if (!localUri.startsWith("file://")) {
    throw new Error(`${label} video must be a local file before it can be rendered.`);
  }

  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists || !info.size || info.size < MIN_MEDIA_BYTES) {
    throw new Error(`${label} video is not readable on this device. Choose or record it again, then retry.`);
  }

  return localUri;
}

async function createCutoutMask(reactionPath: string) {
  try {
    const selfieCutout = await import("selfie-cutout");
    const createPersonMask = selfieCutout.createPersonMask ?? selfieCutout.default?.createPersonMask;
    if (typeof createPersonMask !== "function") {
      return null;
    }
    const mask = await createPersonMask(reactionPath);
    if (!mask?.pattern || !mask.frameCount) {
      return null;
    }
    return {
      pattern: mask.pattern,
      fps: Number.isFinite(mask.fps) ? Number(mask.fps) : 8,
    };
  } catch {
    return null;
  }
}

export async function composeReactionVideo(request: CompositeRequest) {
  const sourcePath = await ensureReadableMedia("Source", request.sourceUri);
  const reactionPath = await ensureReadableMedia("Reaction", request.reactionUri);
  const outputPath = `${getCacheDirectory()}reel-reactor-composite-${Date.now()}.mp4`;
  const personMask = request.overlayStyle === "cutout" ? await createCutoutMask(reactionPath) : null;
  const command = buildCompositeCommand({
    ...request,
    sourcePath,
    reactionPath,
    outputPath,
    maskPattern: personMask?.pattern,
    maskFps: personMask?.fps,
  });
  const logLines: string[] = [];
  let ffmpeg: typeof import("ffmpeg-expo");

  try {
    ffmpeg = await import("ffmpeg-expo");
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown native module error";
    throw new Error(`The video engine could not load on this device: ${message}`);
  }

  try {
    await ffmpeg.execute(["-v", "error", "-i", reactionPath, "-map", "0:a:0", "-f", "null", "-"], { logLevel: "error" });
  } catch {
    throw new Error("The recorded camera video contains no microphone audio, so Reel Reactor stopped before creating a misleading silent reaction export. Re-record after confirming microphone permission.");
  }

  try {
    await ffmpeg.execute(command.args, {
      onProgress: (progress) => request.onProgress?.(progress.time),
      onLog: (log) => {
        if (log.message.trim()) {
          logLines.push(log.message.trim());
          if (logLines.length > MAX_LOG_LINES) logLines.shift();
        }
      },
      logLevel: "info",
    });
  } catch (error) {
    const nativeOutput = error instanceof ffmpeg.FFmpegError ? error.output.trim() : "";
    const diagnostic = nativeOutput || logLines.join("\n");
    throw new Error(diagnostic.slice(-1_200) || "The device could not render the merged reaction video.");
  }

  const outputInfo = await FileSystem.getInfoAsync(outputPath);
  if (!outputInfo.exists || !outputInfo.size || outputInfo.size < MIN_MEDIA_BYTES) {
    throw new Error("The renderer completed without creating a usable merged MP4 on the device.");
  }

  return outputPath;
}
