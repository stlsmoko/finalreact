import { describe, expect, it } from "vitest";

import { beginReactionCameraRecording, clampOverlay, clampOverlayToRect, getContainedVideoRect, getRecordingStartBlocker, normalizeSharedLink, shouldStopReactionForSourceEnd, validateSourceVideo } from "../lib/reaction-project";

describe("source video validation", () => {
  it("requires a local video URI", () => {
    expect(validateSourceVideo({ uri: null })).toBe("Choose a video before opening the studio.");
  });

  it("accepts long local source videos instead of enforcing an arbitrary duration cap", () => {
    expect(validateSourceVideo({ uri: "file:///clip.mov", type: "video", duration: 3_600_000 })).toBeNull();
  });

  it("accepts a valid local video", () => {
    expect(validateSourceVideo({ uri: "file:///clip.mov", type: "video", duration: 30_000 })).toBeNull();
  });
});

describe("reaction overlay bounds", () => {
  it("keeps the overlay inside the studio control-safe area", () => {
    expect(clampOverlay({ x: -20, y: 999 }, { width: 390, height: 844 }, 132)).toEqual({ x: 16, y: 572 });
  });

  it("maps a contained landscape source and constrains the bubble to its visible video rectangle", () => {
    const rect = getContainedVideoRect({ width: 390, height: 844 }, { width: 1920, height: 1080 });
    expect(rect).toEqual({ x: 0, y: 312.3125, width: 390, height: 219.375 });
    expect(clampOverlayToRect({ x: -20, y: 900 }, rect, 132)).toEqual({ x: 0, y: 399.6875 });
  });
});

describe("recording start availability", () => {
  it("explains that the browser preview cannot record rather than silently returning", () => {
    expect(getRecordingStartBlocker({ platform: "web", cameraReady: true, hasCameraRef: true })).toContain("Browser preview cannot record");
  });

  it("allows native recording only after the camera preview is ready", () => {
    expect(getRecordingStartBlocker({ platform: "android", cameraReady: false, hasCameraRef: false })).toContain("Camera preview is not ready");
    expect(getRecordingStartBlocker({ platform: "android", cameraReady: true, hasCameraRef: true })).toBeNull();
  });

  it("starts the camera before source playback and preserves the recording when playback fails", async () => {
    const events: string[] = [];
    const recording = beginReactionCameraRecording({
      startCameraRecording: async () => {
        events.push("camera");
        return "file:///reaction.mp4";
      },
      startSourcePlayback: () => {
        events.push("source");
        throw new Error("source unavailable");
      },
      onSourcePlaybackIssue: () => events.push("source-error"),
    });

    await expect(recording).resolves.toBe("file:///reaction.mp4");
    expect(events).toEqual(["camera", "source", "source-error"]);
  });

  it("stops the camera when the source completes, but never issues a duplicate stop during render", () => {
    expect(shouldStopReactionForSourceEnd({ isRecording: true, isCompositing: false, stopAlreadyRequested: false })).toBe(true);
    expect(shouldStopReactionForSourceEnd({ isRecording: false, isCompositing: false, stopAlreadyRequested: false })).toBe(false);
    expect(shouldStopReactionForSourceEnd({ isRecording: true, isCompositing: true, stopAlreadyRequested: false })).toBe(false);
    expect(shouldStopReactionForSourceEnd({ isRecording: true, isCompositing: false, stopAlreadyRequested: true })).toBe(false);
  });
});

describe("shared-link intake", () => {
  it("accepts copied public links from the supported social platforms", () => {
    const urls = [
      "https://www.facebook.com/reel/example",
      "https://www.instagram.com/reel/example",
      "https://www.tiktok.com/@creator/video/123",
      "https://www.youtube.com/watch?v=example",
      "https://x.com/creator/status/123",
    ];
    for (const url of urls) expect(normalizeSharedLink(` ${url} `)).toBe(url);
  });

  it("pulls the first social URL out of messy share-sheet text", () => {
    expect(
      normalizeSharedLink("Check this reel https://www.tiktok.com/@creator/video/123?_r=1 and react")
    ).toBe("https://www.tiktok.com/@creator/video/123?_r=1");
    expect(
      normalizeSharedLink('"https://www.instagram.com/reel/AbC123/?igsh=xyz"')
    ).toBe("https://www.instagram.com/reel/AbC123/?igsh=xyz");
    expect(
      normalizeSharedLink("www.facebook.com/share/r/1LyABp9fRZ/")
    ).toBe("https://www.facebook.com/share/r/1LyABp9fRZ/");
    expect(
      normalizeSharedLink("https://vm.tiktok.com/ZMhabcde/")
    ).toBe("https://vm.tiktok.com/ZMhabcde/");
  });

  it("does not treat non-web content as a shareable social link", () => {
    expect(normalizeSharedLink("reelreactor://shared-link")).toBeNull();
  });
});
