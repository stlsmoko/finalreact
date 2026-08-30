# Reel Reactor — Independent Codex Review Brief

## Goal

This is an Android-first Expo / React Native app. It must create one local MP4 containing a selected source reel, a movable/resizable front-camera reaction overlay, source audio, and microphone audio. During **pause and talk**, the source frame must freeze and its audio must be silent while camera/microphone recording continues.

## Release state

The current source is **v1.0.12 / Android versionCode 13**. It is deliberately held: no APK is claimed, and no Android v1.0.12 export has been inspected. The hosted build UI has blocked builds with an Expo quota message, so this repository is for code review—not evidence that a device build succeeded.

## Important architecture

| Location | Responsibility |
| --- | --- |
| `app/(tabs)/index.tsx` | Picks a local source video, resolves/copies it to a readable cache URI, and opens the studio. |
| `app/reaction-record.tsx` | Camera, source player, overlay gestures, pause markers, source monitoring, and render invocation. |
| `lib/video-compositor.ts` | Native input validation, microphone-stream preflight, `ffmpeg-expo` execution, and output verification. |
| `lib/video-compositor-command.ts` | FFmpeg filter graph: 720×1280 source, circular/square/green-key reaction layer, pauses, audio mix. |
| `vendor/ffmpeg-expo/` | Vendored native arm64-only Android FFmpeg module. Do not replace it with Expo Go or a screen-recording fallback. |
| `plugins/with-legacy-android-architecture.js` | Persists Android low-memory and legacy-architecture settings across prebuilds. |

## Evidence already obtained

`pnpm test`, `pnpm check`, `pnpm lint`, `npx expo config --type public`, and `CI=1 npx expo prebuild --platform android --no-install` pass. Tests cover source validation, overlay geometry, pause normalization, filter construction, styles, and audio command structure.

A local FFmpeg smoke render with a 4-second source and a 2-second inserted pause produced a 6.010-second output. Cropped background frames at two points inside the pause had equal SHA-256 hashes. This proves the desktop FFmpeg graph, not the Android runtime.

## Main concerns to review

1. **Native Android parity.** Verify that the vendored arm64 module includes and correctly invokes every filter/format used in the command graph: `overlay`, `amix`, `tpad`, `concat`, `chromakey`, `alphamerge`, `alimiter`, and `null` muxer.
2. **Camera and source audio coexistence.** The source player uses `mixWithOthers` during camera capture. Confirm that this is correct for Expo 57 / Android and that `CameraView.recordAsync` produces a microphone stream under the configured permissions.
3. **FFmpeg input guarantees.** Review the `content://` and photo-library URI handling plus cache lifetime. The renderer must never pass an inaccessible URI to native FFmpeg.
4. **Overlay coordinate parity.** The studio and renderer now use contained-video mapping, including landscape sources. Check it against the actual `VideoView` layout behavior on Android.
5. **Build failure.** Local Gradle repeatedly terminates with `DaemonDisappearedException` before task execution in this sandbox. Prebuild works; no local APK exists. Treat this as unproven platform/build behavior, not a successful compile.

## Non-negotiable product requirements

- Do not accept camera-only output as final review/export.
- Do not use screen recording as the primary combined export.
- Preserve Bubble, Square, and real Green key mode in output.
- Preserve a visible source freeze and silent source audio during pause-and-talk.
- Keep source duration unrestricted by arbitrary application caps.
- Keep small-phone controls reachable with an independently scrollable dock.

## Validation commands

```bash
pnpm test
pnpm check
pnpm lint
npx expo config --type public
CI=1 npx expo prebuild --platform android --no-install
```

See `audit/v1.0.12-release-gate.md` for the exact distinction between code/deterministic evidence and required physical-device evidence.
