export type CompositeGeometry = {
  overlay: { x: number; y: number; size: number };
  studioSize: { width: number; height: number };
  sourceSize?: { width?: number; height?: number };
  overlayStyle?: "circle" | "square" | "green-screen" | "cutout";
  maskPattern?: string;
  maskFps?: number;
  sourcePauses?: { sourceTimeSec: number; durationSec: number }[];
  stopDurationSec?: number;
  sourceAudioGain?: number;
  reactionAudioGain?: number;
};

function toFfmpegPath(uri: string) {
  return uri.replace(/^file:\/\//, "");
}

const OUTPUT_WIDTH = 720;
const OUTPUT_HEIGHT = 1280;

function seconds(value: number) {
  return Math.max(0, Math.round(value * 1_000) / 1_000).toString();
}

function backgroundChain(input: string, output: string) {
  return `${input}scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},setsar=1${output}`;
}

function studioStageSize(studioSize: { width: number; height: number }) {
  const width = Math.max(1, studioSize.width);
  const height = Math.max(1, studioSize.height);
  if (Math.abs(width / height - 9 / 16) <= 0.05) {
    return { width, height };
  }
  const innerWidth = Math.max(1, width - 24);
  const innerHeight = Math.max(1, height - 218);
  const fromWidth = innerWidth * (16 / 9);
  if (fromWidth <= innerHeight) {
    return { width: innerWidth, height: fromWidth };
  }
  return { width: innerHeight * (9 / 16), height: innerHeight };
}

export function normalizeSourcePauses(pauses: CompositeGeometry["sourcePauses"] = []) {
  const normalized: { sourceTimeSec: number; durationSec: number }[] = [];
  for (const pause of pauses) {
    if (!Number.isFinite(pause.sourceTimeSec) || !Number.isFinite(pause.durationSec) || pause.sourceTimeSec < 0 || pause.durationSec <= 0.05) {
      continue;
    }
    const last = normalized.at(-1);
    if (last && pause.sourceTimeSec < last.sourceTimeSec - 0.08) {
      continue;
    }
    if (last && Math.abs(pause.sourceTimeSec - last.sourceTimeSec) <= 0.08) {
      last.durationSec += pause.durationSec;
      continue;
    }
    normalized.push({ sourceTimeSec: pause.sourceTimeSec, durationSec: pause.durationSec });
  }
  return normalized;
}

function buildSourceTimelineFilters(pauses: CompositeGeometry["sourcePauses"] = []) {
  const validPauses = normalizeSourcePauses(pauses);

  if (validPauses.length === 0) {
    return [
      backgroundChain("[0:v]", "[background]"),
      "[0:a]anull[source_audio]",
    ];
  }

  const filters: string[] = [];
  const videoParts: string[] = [];
  const audioParts: string[] = [];
  let sourceStart = 0;
  let part = 0;

  for (const pause of validPauses) {
    if (pause.sourceTimeSec <= sourceStart) continue;
    const sourceEnd = seconds(pause.sourceTimeSec);
    const duration = seconds(pause.durationSec);
    const videoPart = `source_video_${part}`;
    const freezePart = `source_freeze_${part}`;
    const audioPart = `source_audio_${part}`;
    const silencePart = `source_silence_${part}`;

    filters.push(backgroundChain(`[0:v]trim=start=${seconds(sourceStart)}:end=${sourceEnd},setpts=PTS-STARTPTS,`, `[${videoPart}]`));
    filters.push(`[${videoPart}]tpad=stop_mode=clone:stop_duration=${duration},setpts=PTS-STARTPTS[${freezePart}]`);
    filters.push(`[0:a]atrim=start=${seconds(sourceStart)}:end=${sourceEnd},asetpts=PTS-STARTPTS[${audioPart}]`);
    filters.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${duration},asetpts=PTS-STARTPTS[${silencePart}]`);
    videoParts.push(`[${freezePart}]`);
    audioParts.push(`[${audioPart}]`, `[${silencePart}]`);
    sourceStart = pause.sourceTimeSec;
    part += 1;
  }

  const tailVideo = "source_video_tail";
  const tailAudio = "source_audio_tail";
  filters.push(backgroundChain(`[0:v]trim=start=${seconds(sourceStart)},setpts=PTS-STARTPTS,`, `[${tailVideo}]`));
  filters.push(`[0:a]atrim=start=${seconds(sourceStart)},asetpts=PTS-STARTPTS[${tailAudio}]`);
  videoParts.push(`[${tailVideo}]`);
  audioParts.push(`[${tailAudio}]`);
  filters.push(`${videoParts.join("")}concat=n=${videoParts.length}:v=1:a=0[background]`);
  filters.push(`${audioParts.join("")}concat=n=${audioParts.length}:v=0:a=1[source_audio]`);
  return filters;
}

export function getOutputOverlay({ overlay, studioSize }: CompositeGeometry) {
  const stage = studioStageSize(studioSize);
  const scaleX = OUTPUT_WIDTH / stage.width;
  const scaleY = OUTPUT_HEIGHT / stage.height;
  const maxX = Math.max(0, OUTPUT_WIDTH - 80);
  const maxY = Math.max(0, OUTPUT_HEIGHT - 80);

  return {
    x: Math.max(0, Math.min(maxX, Math.round(overlay.x * scaleX))),
    y: Math.max(0, Math.min(maxY, Math.round(overlay.y * scaleY))),
    size: Math.max(80, Math.round(overlay.size * scaleX)),
  };
}

function buildReactionFilters(
  overlayStyle: NonNullable<CompositeGeometry["overlayStyle"]>,
  overlaySize: number,
  hasPersonMask: boolean,
) {
  const reactionBase = `[1:v]scale=${overlaySize}:${overlaySize}:force_original_aspect_ratio=increase,crop=${overlaySize}:${overlaySize},setsar=1`;

  if (overlayStyle === "circle") {
    return [
      `${reactionBase},format=rgba[reaction_rgba]`,
      `color=c=black:s=${overlaySize}x${overlaySize},format=gray,geq=lum='if(lte(hypot(X-W/2\\,Y-H/2)\\,W/2-3)\\,255\\,0)'[reaction_alpha]`,
      "[reaction_rgba][reaction_alpha]alphamerge[reaction]",
    ];
  }

  if (overlayStyle === "green-screen") {
    return [`${reactionBase},format=rgba,chromakey=0x00FF00:0.32:0.12[reaction]`];
  }

  if (overlayStyle === "cutout" && hasPersonMask) {
    return [
      `[2:v]fps=30,setpts=PTS-STARTPTS,scale=${Math.round(overlaySize * 1.22)}:${Math.round(overlaySize * 1.22)}:force_original_aspect_ratio=increase,crop=${overlaySize}:${overlaySize},setsar=1,format=rgba[reaction]`,
    ];
  }

  if (overlayStyle === "cutout") {
    return [
      `${reactionBase},format=rgba[reaction_rgba]`,
      `color=c=black:s=${overlaySize}x${overlaySize},format=gray,geq=lum='if(lte(hypot((X-W/2)/(W/2-2)\\,(Y-H*0.46)/(H*0.46-2))\\,1)\\,255\\,0)'[reaction_alpha]`,
      "[reaction_rgba][reaction_alpha]alphamerge[reaction]",
    ];
  }

  return [`${reactionBase}[reaction]`];
}

export function buildCompositeCommand(
  request: CompositeGeometry & { sourcePath: string; reactionPath: string; outputPath: string },
) {
  const overlay = getOutputOverlay(request);
  const overlayStyle = request.overlayStyle ?? "circle";
  const maskPattern = request.maskPattern?.trim();
  const hasPersonMask = overlayStyle === "cutout" && Boolean(maskPattern);
  const maskFps = Number.isFinite(request.maskFps) && (request.maskFps as number) > 0
    ? seconds(request.maskFps as number)
    : "12";
  const stopDurationSec = Number.isFinite(request.stopDurationSec) && (request.stopDurationSec ?? 0) > 0.05
    ? seconds(request.stopDurationSec as number)
    : null;
  const sourceAudioGain = Number.isFinite(request.sourceAudioGain)
    ? seconds(Math.max(0, Math.min(1, request.sourceAudioGain as number)))
    : "0.12";
  const reactionAudioGain = Number.isFinite(request.reactionAudioGain)
    ? seconds(Math.max(0, Math.min(6, request.reactionAudioGain as number)))
    : "3";
  const reactionFilters = buildReactionFilters(overlayStyle, overlay.size, hasPersonMask);
  const timelineFilters = stopDurationSec
    ? [
        `[background]tpad=stop=-1:stop_mode=clone,trim=duration=${stopDurationSec},setpts=PTS-STARTPTS[background_trimmed]`,
        `[reaction]tpad=stop=-1:stop_mode=clone,trim=duration=${stopDurationSec},setpts=PTS-STARTPTS[reaction_trimmed]`,
      ]
    : [];
  const backgroundLabel = stopDurationSec ? "[background_trimmed]" : "[background]";
  const reactionLabel = stopDurationSec ? "[reaction_trimmed]" : "[reaction]";
  const filter = [
    ...buildSourceTimelineFilters(request.sourcePauses),
    ...reactionFilters,
    ...timelineFilters,
    `${backgroundLabel}${reactionLabel}overlay=${overlay.x}:${overlay.y}:eof_action=pass:repeatlast=1:format=auto[video]`,
    `[source_audio]volume=${sourceAudioGain}[source_audio_scaled]`,
    `[1:a]volume=${reactionAudioGain},alimiter=limit=0.89:level=1[reaction_audio]`,
    `[source_audio_scaled][reaction_audio]amix=inputs=2:weights=1 1:duration=longest:dropout_transition=2:normalize=0,volume=0.36[audio]`,
  ].join(";");

  const args = [
    "-y",
    "-i", request.sourcePath,
    "-i", request.reactionPath,
    ...(hasPersonMask && maskPattern
      ? ["-f", "image2", "-framerate", maskFps, "-start_number", "1", "-i", toFfmpegPath(maskPattern)]
      : []),
    "-filter_complex", filter,
    "-map", "[video]",
    "-map", "[audio]",
    "-c:v", "mpeg4",
    "-q:v", "5",
    "-bf", "0",
    "-r", "30",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-c:a", "aac",
    "-b:a", "192k",
    ...(stopDurationSec ? ["-t", stopDurationSec] : ["-shortest"]),
    request.outputPath,
  ];

  return { filter, args };
}
