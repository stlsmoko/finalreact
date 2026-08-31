import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildCompositeCommand } from "../lib/video-compositor-command";

function run(command: string, args: string[], capture = false) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

function measureProcessedMean(inputPath: string, filter: string) {
  const result = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "info", "-i", inputPath, "-af", `${filter},volumedetect`, "-f", "null", "-",
  ], { encoding: "utf8" });
  const logs = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const match = logs.match(/mean_volume:\s*(-?\d+(?:\.\d+)?) dB/);
  if (result.status !== 0 || !match) {
    throw new Error(`FFmpeg volume measurement failed: ${logs.slice(-1_000)}`);
  }
  return Number(match[1]);
}

const workDir = mkdtempSync(join(tmpdir(), "reel-reactor-audio-smoke-"));
const sourcePath = join(workDir, "source.mp4");
const reactionPath = join(workDir, "reaction.mp4");
const outputPath = join(workDir, "composite.mp4");
const pauseReactionPath = join(workDir, "pause-reaction.mp4");
const pauseOutputPath = join(workDir, "pause-composite.mp4");
const pauseSourcePath = join(workDir, "pause-source.wav");

try {
  run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=0x26324A:s=720x1280:r=30:d=6",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=6",
    "-c:v", "mpeg4", "-q:v", "8", "-c:a", "aac", "-shortest", sourcePath,
  ]);
  run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=0xFF5C35:s=480x480:r=30:d=2",
    "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=2",
    "-c:v", "mpeg4", "-q:v", "8", "-c:a", "aac", "-shortest", reactionPath,
  ]);

  const command = buildCompositeCommand({
    sourcePath,
    reactionPath,
    outputPath,
    overlay: { x: 20, y: 80, size: 132 },
    studioSize: { width: 390, height: 844 },
    stopDurationSec: 2,
  });
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", ...command.args]);

  const duration = Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", outputPath], true).trim());
  const sourceDb = measureProcessedMean(sourcePath, "volume=0.08");
  const reactionDb = measureProcessedMean(reactionPath, "volume=8.5,alimiter=limit=0.98");

  if (!Number.isFinite(duration) || duration < 1.8 || duration > 2.4) {
    throw new Error(`Composite did not stop with the two-second reaction recording: ${duration}`);
  }
  if (!(reactionDb > sourceDb + 3)) {
    throw new Error(`Reaction level was not clearly above source level: source ${sourceDb} dB, reaction ${reactionDb} dB`);
  }

  run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=0xFF5C35:s=480x480:r=30:d=6",
    "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=6",
    "-c:v", "mpeg4", "-q:v", "8", "-c:a", "aac", "-shortest", pauseReactionPath,
  ]);
  const pauseCommand = buildCompositeCommand({
    sourcePath,
    reactionPath: pauseReactionPath,
    outputPath: pauseOutputPath,
    overlay: { x: 20, y: 80, size: 132 },
    studioSize: { width: 390, height: 844 },
    sourcePauses: [{ sourceTimeSec: 2, durationSec: 2 }],
    stopDurationSec: 6,
  });
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", ...pauseCommand.args]);
  const pauseDuration = Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", pauseOutputPath], true).trim());
  const sourceTimelineFilter = pauseCommand.filter.slice(0, pauseCommand.filter.indexOf(";[1:v]"));
  run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", sourcePath, "-filter_complex", sourceTimelineFilter, "-map", "[source_audio]", "-c:a", "pcm_s16le", pauseSourcePath, "-map", "[background]", "-f", "null", "-"]);
  const sourceBeforePauseDb = measureProcessedMean(pauseSourcePath, "atrim=start=1:duration=0.5");
  const sourceDuringPauseDb = measureProcessedMean(pauseSourcePath, "atrim=start=2.5:duration=0.5");
  if (!Number.isFinite(pauseDuration) || pauseDuration < 5.8 || pauseDuration > 6.2) {
    throw new Error(`Pause composite did not stop with the six-second reaction recording: ${pauseDuration}`);
  }
  if (!(sourceBeforePauseDb > -50 && sourceDuringPauseDb < -70)) {
    throw new Error(`Source audio was not silent during the pause window: before ${sourceBeforePauseDb} dB, during ${sourceDuringPauseDb} dB`);
  }

  console.log(JSON.stringify({ duration, sourceDb, reactionDb, pauseDuration, sourceBeforePauseDb, sourceDuringPauseDb, outputPath }, null, 2));
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
