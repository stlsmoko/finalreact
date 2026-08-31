import { describe, expect, it } from "vitest";

import { buildCompositeCommand, getOutputOverlay, normalizeSourcePauses } from "../lib/video-compositor-command";

describe("composite command geometry", () => {
  it("maps the bubble through the same contained-video rectangle used by the studio preview", () => {
    expect(getOutputOverlay({
      overlay: { x: 236, y: 126, size: 132 },
      studioSize: { width: 390, height: 844 },
      sourceSize: { width: 720, height: 1280 },
    })).toEqual({ x: 436, y: 94, size: 244 });
  });

  it("retains only monotonic pause markers and merges repeated taps at one source frame", () => {
    expect(normalizeSourcePauses([
      { sourceTimeSec: 2, durationSec: 1 },
      { sourceTimeSec: 2.04, durationSec: 2 },
      { sourceTimeSec: 1, durationSec: 5 },
      { sourceTimeSec: 4, durationSec: 0.01 },
    ])).toEqual([{ sourceTimeSec: 2, durationSec: 3 }]);
  });
});

describe("composite command", () => {
  it("contains both inputs, a positioned circular picture-in-picture overlay, and a reaction-forward audio mix", () => {
    const command = buildCompositeCommand({
      sourcePath: "file:///cache/source.mp4",
      reactionPath: "file:///cache/reaction.mp4",
      outputPath: "file:///cache/output.mp4",
      overlay: { x: 20, y: 80, size: 132 },
      studioSize: { width: 390, height: 844 },
    });

    expect(command.args).toEqual(expect.arrayContaining([
      "-i", "file:///cache/source.mp4",
      "-i", "file:///cache/reaction.mp4",
      "-map", "[video]",
      "-map", "[audio]",
      "file:///cache/output.mp4",
    ]));
    expect(command.filter).toContain("[background][reaction]overlay=");
    expect(command.filter).toContain("[reaction_rgba][reaction_alpha]alphamerge[reaction]");
    expect(command.filter).toContain("[source_audio]volume=0.12[source_audio_scaled]");
    expect(command.filter).toContain("[1:a]aresample=48000,volume=2.8,alimiter=limit=0.95[reaction_audio]");
    expect(command.filter).toContain("amix=inputs=2:duration=shortest:dropout_transition=0:normalize=0,alimiter=limit=0.96[audio]");
    expect(command.filter).toContain("pad=720:1280");
    expect(command.filter).toContain("[0:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[background]");
    expect(command.filter).toContain("[1:v]scale=244:244:force_original_aspect_ratio=increase,crop=244:244,setsar=1,format=rgba[reaction_rgba]");
    expect(command.filter).not.toContain(";setsar=1");
    expect(command.filter).toContain("overlay=37:9:eof_action=endall:repeatlast=0:format=auto[video]");
    expect(command.args).toContain("-shortest");
  });

  it("uses the selected background gain and clamps unsafe values", () => {
    const baseRequest = {
      sourcePath: "file:///cache/source.mp4",
      reactionPath: "file:///cache/reaction.mp4",
      outputPath: "file:///cache/output.mp4",
      overlay: { x: 20, y: 80, size: 132 },
      studioSize: { width: 390, height: 844 },
    };

    expect(buildCompositeCommand({ ...baseRequest, sourceAudioGain: 0.24 }).filter).toContain("[source_audio]volume=0.24[source_audio_scaled]");
    expect(buildCompositeCommand({ ...baseRequest, sourceAudioGain: 0.9 }).filter).toContain("[source_audio]volume=0.9[source_audio_scaled]");
    expect(buildCompositeCommand({ ...baseRequest, sourceAudioGain: -0.1 }).filter).toContain("[source_audio]volume=0[source_audio_scaled]");
    expect(buildCompositeCommand({ ...baseRequest, sourceAudioGain: 2 }).filter).toContain("[source_audio]volume=1[source_audio_scaled]");
    expect(buildCompositeCommand({ ...baseRequest, sourceAudioGain: 0.24 }).filter).toContain("volume=2.8");
  });

  it("trims the final video and audio to the captured Stop time", () => {
    const command = buildCompositeCommand({
      sourcePath: "file:///cache/source.mp4",
      reactionPath: "file:///cache/reaction.mp4",
      outputPath: "file:///cache/output.mp4",
      overlay: { x: 20, y: 80, size: 132 },
      studioSize: { width: 390, height: 844 },
      stopDurationSec: 3.25,
    });

    expect(command.filter).toContain("[background]trim=duration=3.25,setpts=PTS-STARTPTS[background_trimmed]");
    expect(command.filter).toContain("[reaction]trim=duration=3.25,setpts=PTS-STARTPTS[reaction_trimmed]");
    expect(command.filter).toContain("[source_audio]atrim=duration=3.25,asetpts=PTS-STARTPTS[source_audio_trimmed]");
    expect(command.filter).toContain("[1:a]atrim=duration=3.25,aresample=48000");
    expect(command.filter).toContain("overlay=37:9:eof_action=pass:repeatlast=0:format=auto[video]");
    expect(command.filter).toContain("amix=inputs=2:duration=longest");
    expect(command.args).toEqual(expect.arrayContaining(["-t", "3.25"]));
    expect(command.args).not.toContain("-shortest");
  });

  it("can render a square or a green-screen keyed reaction layer without the circular alpha mask", () => {
    const baseRequest = {
      sourcePath: "file:///cache/source.mp4",
      reactionPath: "file:///cache/reaction.mp4",
      outputPath: "file:///cache/output.mp4",
      overlay: { x: 20, y: 80, size: 132 },
      studioSize: { width: 390, height: 844 },
    };

    expect(buildCompositeCommand({ ...baseRequest, overlayStyle: "square" }).filter).toContain("setsar=1[reaction]");
    expect(buildCompositeCommand({ ...baseRequest, overlayStyle: "green-screen" }).filter).toContain("chromakey=0x00FF00:0.32:0.12[reaction]");
  });

  it("uses a person mask input for cutout instead of green-screen chromakey", () => {
    const baseRequest = {
      sourcePath: "file:///cache/source.mp4",
      reactionPath: "file:///cache/reaction.mp4",
      outputPath: "file:///cache/output.mp4",
      overlay: { x: 20, y: 80, size: 132 },
      studioSize: { width: 390, height: 844 },
    };

    const masked = buildCompositeCommand({
      ...baseRequest,
      overlayStyle: "cutout",
      maskPattern: "file:///cache/masks/mask_%05d.png",
      maskFps: 8,
    });
    expect(masked.filter).toContain("[2:v]fps=30,setpts=PTS-STARTPTS,scale=244:244:force_original_aspect_ratio=increase,crop=244:244,setsar=1,format=rgba[reaction]");
    expect(masked.filter).not.toContain("[1:v]scale=244:244");
    expect(masked.filter).not.toContain("chromakey=0x00FF00");
    expect(masked.filter).toContain("repeatlast=1");
    expect(masked.args).toEqual(expect.arrayContaining([
      "-f", "image2",
      "-framerate", "8",
      "-start_number", "1",
      "-i", "/cache/masks/mask_%05d.png",
      "-r", "30",
      "-bf", "0",
    ]));

    const fallback = buildCompositeCommand({ ...baseRequest, overlayStyle: "cutout" });
    expect(fallback.filter).toContain("alphamerge[reaction]");
    expect(fallback.filter).not.toContain("chromakey=0x00FF00");
    expect(fallback.args).not.toContain("-f");
  });

  it("freezes the background and inserts silent source audio when the creator pauses the reel to talk", () => {
    const command = buildCompositeCommand({
      sourcePath: "file:///cache/source.mp4",
      reactionPath: "file:///cache/reaction.mp4",
      outputPath: "file:///cache/output.mp4",
      overlay: { x: 20, y: 80, size: 132 },
      studioSize: { width: 390, height: 844 },
      sourcePauses: [{ sourceTimeSec: 4.25, durationSec: 3.5 }],
    });

    expect(command.filter).toContain("trim=start=0:end=4.25");
    expect(command.filter).toContain("tpad=stop_mode=clone:stop_duration=3.5");
    expect(command.filter).toContain("anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=3.5");
    expect(command.filter).toContain("concat=n=2:v=1:a=0[background]");
    expect(command.filter).toContain("concat=n=3:v=0:a=1[source_audio]");
  });
});
