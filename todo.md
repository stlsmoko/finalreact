# Project TODO

- [x] Create the Reel Reactor Start and Source Setup flows for local video selection.
- [x] Build the portrait reaction studio with source-video playback, a draggable/resizable camera overlay, and clear recording states.
- [x] Request and surface camera, microphone, and media-library permissions only when needed.
- [x] Capture a reaction-camera recording locally and keep its output available for review.
- [x] Add a review screen with re-record, local save, and share actions.
- [x] Add a clean-scene system screen-recording path for an immediately usable merged personal export.
- [ ] Build file-level native composition that merges source video, camera video, and audio into one exported file without using the device screen recorder.
- [x] Add a copied-link fallback that captures a shared post URL as a session draft.
- [ ] Receive content directly from the operating-system Share menu through native iOS and Android share extensions.
- [x] Document the direct-social-video limitations and rights-aware import path in the app.
- [x] Add automated tests for source validation and reaction-studio state transitions.
- [x] Generate and configure a dedicated Reel Reactor icon and app branding.
- [x] Validate source handling and studio state transitions with unit tests, type checking, and linting.
- [ ] Test camera capture, source audio, microphone input, and clean-scene screen recording on a physical iPhone or Android device.
- [ ] Install Reel Reactor on the owner’s Android phone and complete the first physical-device test.
- [ ] Resolve Expo Go’s “Failed to download remote update” error on the owner’s Android preview session.
- [ ] Create and install the standalone Android build through the project Publish workflow as the reliable phone-test fallback.
- [x] Fix the source-setup layout so “Open reaction studio” is always visible and tappable on a 9:16 Android screen.
- [x] Verify the preview service has completed a fresh Metro bundle after the layout repair.
- [x] Replace the ambiguous Camera take control with a prominent Start recording button that clearly changes to Stop recording.
- [x] Make the live camera bubble pass Android touch drags through the camera preview to the parent move gesture.
- [ ] Confirm the revised record button, drag gesture, and resize handle on the owner’s Android device.
- [x] Remove every Expo VideoPlayer pause call that could run after a native player is released during navigation or record completion.
- [x] Replace the ineffective overlay PanResponder behavior with native gesture-handler dragging on Android.
- [x] Build an Android JavaScript bundle successfully after the crash and overlay interaction repairs.
- [x] Repair the Android camera preview lifecycle with immediate permission request, camera mount status, and a native retry control.
- [x] Build an Android bundle successfully after the camera preview lifecycle repair.
- [ ] Confirm the repaired camera opens and can record a short take on the owner’s Android device.
- [x] Replace the silent record-start path with explicit camera/microphone preparation, camera-ready status, and actionable retry feedback.
- [x] Build an Android bundle successfully after the record-start control repair.
- [ ] Confirm Start recording changes to Stop recording and produces a saved short take on the owner’s Android device.
- [x] Replace the persistent non-recording reaction flow with explicit permission, camera-ready, recording, stopping, save, and native-error status feedback.
- [x] Build an Android bundle successfully after the observable recording-state repair.
- [ ] Confirm the live device progresses through Ready to react → Recording reaction → saved review after one short take.
- [ ] Select and validate a maintained native render engine or a compatible Expo/React Native upgrade before implementing true picture-in-picture export.
- [ ] Deliver one exported MP4 that visibly contains the chosen source video, the user-positioned front-camera reaction overlay, source audio, and reaction microphone audio.
- [x] Upgrade the project to Expo 56 / React Native 0.85 and register the supported ffmpeg-expo native compositor plugin.
- [x] Implement the on-device source scaling, positioned overlay, audio-mixing, composite MP4 review, save, and share flow.
- [x] Verify the prebuild configuration includes the compositor plugin plus Android camera and microphone permissions.
- [ ] Complete a standalone Android APK build and confirm a physical device renders the combined MP4 end to end.
- [x] Complete cloud or local APK compilation: the Android SDK is installed, but this sandbox terminates Gradle before task configuration; native prebuild and direct NDK compilation of the compositor now succeed. A GitHub-hosted runner built and archived the v1.0.13/code 14 debug APK successfully.
- [x] Diagnose the camera-only review ambiguity and add explicit merged-render status plus a version bump so the next APK is distinguishable.
- [x] Add concurrent native two-finger pinch resizing and one-finger drag movement for the floating reaction camera.
- [ ] Confirm physical Android rendering opens only a combined reaction video review or shows a specific native merged-render error.
- [x] Replace the camera-overlay gesture surface with a non-interactive camera preview beneath a dedicated native pan-and-pinch control layer.
- [x] Block camera-only reaction data from ever entering the final review route; only a flagged composite output can be reviewed, saved, or shared.
- [x] Add explicit native render-stage status and hard render-failure messaging to the recorder.
- [ ] Reproduce the full camera, gesture, recording, and composite-export workflow in an executable Android environment before sending another build claim.
- [ ] Do not issue further implementation-complete claims until a real merged MP4 has been inspected from the native runtime.
- [x] Remove direct React Navigation dependencies that prevent Expo Router from starting under Expo 56.
- [x] Install Expo Asset and align all remaining Expo 56 peer and toolchain versions before native APK validation.
- [x] Upgrade to Expo 57 and React Native 0.86.2+ to remove the diagnosed Hermes memory regression and Metro dependency override.
- [x] Replace the Android overlay input layer with an independently verifiable responder-based drag and pinch implementation that does not depend on the native camera view receiving gestures.
- [ ] Validate real source and camera URI accessibility, FFmpeg command construction, output creation, and recorded durations before navigating to review.
- [ ] Compile the refreshed Expo 57 Android native project locally, including ffmpeg-expo, before requesting any further owner-device test.
- [x] Replace the installed remux-only FFmpeg bridge with a reproducible full-command native implementation that can execute overlay and audio-mix filter graphs.
- [x] Compile the vendored arm64 FFmpeg JNI bridge directly with the Android NDK and verify the required overlay, crop, pad, scale, setsar, and amix filters are enabled.
- [x] Diagnose the owner-reported v1.0.3 Android regression from code and build artifacts before requesting another phone test.
- [x] Remove any unverified native dependency or interaction-layer change that can prevent the recorder from opening or responding on the owner’s Android phone.
- [x] Do not ask for another publish or device test until the standalone APK path itself has been compiled and inspected.
- [x] Prevent the review screen from importing Android-only media-library code in the web bundle, which currently produces a server error during preview loading.

- [ ] Checkpoint the web-safe source selection and persistent preview startup repairs before restarting the managed development service.

- [x] Diagnose and repair the no-op source-video selection action reported in the preview.

- [x] Diagnose and repair the no-op source-video selection action reported in the preview.

- [ ] Surface web picker failures inline and restrict iOS-only picker options to iOS so source selection cannot appear to do nothing.
- [x] Surface web picker failures inline and restrict iOS-only picker options to iOS so source selection cannot appear to do nothing.

- [x] Diagnose and repair the no-op record action reported after entering the reaction recorder.

- [ ] Reproduce the owner-reported continued no-op Start recording interaction in the exact preview or Android runtime and repair the active path.

- [ ] Diagnose and repair the native Android reaction camera record invocation that fails to start a recording.

- [x] Produce and inspect a custom Android development or standalone build because Expo Go cannot load the required ffmpeg-expo native module.

- [ ] Diagnose and repair the owner-reported phone-side recording failure where tapping record does not produce a reaction video.

- [ ] Remove the camera-only review and screen-recording fallback; export one clean MP4 with source reel, positioned reaction overlay, source audio, and microphone audio.

- [ ] Diagnose why the owner’s completed APK build displays stale version 1.0.1 instead of the current v1.0.5 / code 6 checkpoint.

- [ ] Verify the deployed build artifact after the owner’s completed build continues to display stale version 1.0.1.

- [ ] Build a desktop-browser reaction recorder with local source playback, webcam/microphone capture, movable overlay, and an exported combined video.

- [ ] Verify and complete automatic one-file composition of the selected reel, positioned reaction camera, source audio, and microphone audio.

- [ ] Support desktop composition through Web APIs and determine whether Electron packaging is needed for reliable local MP4 export.

- [ ] Build an installable Reel Reactor desktop application with reliable local MP4 composition and export.

- [ ] Make the current mobile build automatically produce a verified combined reel-and-reaction video instead of any camera-only or screen-recording result.

- [ ] Diagnose and fix the Android APK build failure that flashes near 60 percent in the project build interface.

- [x] Fix the demonstrated FFmpeg `setsar` filter-chain error that prevents the mobile combined MP4 renderer from initializing.

- [x] Preserve the selected reaction bubble shape in the rendered MP4 instead of exporting a square overlay.
- [x] Correct composite audio mixing so source and reaction audio are normalized before the exported video is encoded.
- [x] Let the creator pause and resume source-video playback while the reaction camera continues recording.
- [x] Support larger local source videos without unnecessary app-level size rejection.
- [x] Add selectable reaction styles, including non-circular shapes and a green-screen/keyed overlay mode.
- [x] Make reaction-studio controls vertically reachable on small phones with appropriate scrolling and safe bottom spacing.
- [x] Complete and regression-check every current output and studio refinement before requesting one consolidated replacement APK.

- [x] Remove the device-observed duplicate source playback/audio during final review playback.
- [x] Ensure the selected Bubble, Square, or Green key style reaches the native renderer request and render command.
- [ ] Validate v1.0.8 on a physical phone: review has one playback/audio track, Bubble is round, and Green key removes a real green backdrop.

- [ ] Complete and report a pre-download v1.0.8 audit of review isolation, audio routing, overlay styles, renderer command, tests, and Android prebuild.

- [ ] Diagnose the current APK build/download failure and identify the version actually installed on the owner’s phone.
- [ ] Prove with an inspectable native render that Bubble, Square, and Green key style selections change the final exported MP4 before another owner test.

- [x] Make the current reaction studio genuinely scrollable by using a bounded scroll region above the bottom system area.
- [x] Restore audible source playback during reaction recording at a lower monitoring volume.
- [x] Rebalance final audio to favor the front-camera microphone while retaining reduced source audio.
- [x] Repair the Green key command and clarify that it requires an evenly lit real green backdrop.
- [ ] Validate v1.0.10 on the phone: controls scroll, reel audio is audible while recording, reaction speech is intelligible in export, and Green key removes a real green backdrop.

- [x] Use an independent code review to diagnose why recorded pause events are absent from the exported timeline.
- [x] Repair the exported audio path so the front-camera microphone reaction is clearly audible over the source track.
- [ ] Validate v1.0.11 on the phone: a pause marker shows a source freeze in export and reaction speech is clearly audible over reduced source audio.

- [x] Hold the v1.0.11 APK build until a consolidated audit covers all recurring mobile output, controls, review, and packaging failures.
- [x] Produce a single remaining-issues checklist that distinguishes device-proven fixes from unverified code paths before the next release candidate.
- [x] Normalize every selected source and recorded reaction URI to a verified local compositor-readable file, including iOS photo-library assets.
- [x] Map the movable reaction overlay against the actual contained source-video rectangle so exported position and size match the studio preview for landscape and portrait clips.
- [x] Harden pause marker capture and source-timeline construction against stale player readings, duplicate markers, and non-monotonic timing.
- [x] Add a tested safe reaction-audio fallback and dynamics guard so exports do not fail or clip when a camera recording lacks an audio track or has uneven loudness.
- [x] Eliminate remaining review and studio player-overlap paths by pausing players on navigation focus changes and leaving exactly one intended playback owner.
- [x] Make the control dock scroll independently of the movable camera overlay on small Android screens without gesture interception.
- [x] Audit custom FFmpeg Android packaging and Gradle configuration for reproducible native dependency preparation before a new cloud build is requested.
- [x] Publish the held v1.0.12/code 13 source and release-gate audit to a private GitHub repository for independent Codex review.
- [x] Synchronize Claude's updated GitHub revision and independently verify its claimed mobile-composition repairs before any APK is described as working; the GitHub update adds only a standalone browser `index.html`, not Expo or Android source changes.
- [x] Port Claude's browser-flow interaction concepts into the real Expo Router Android studio while preserving native camera recording and FFmpeg MP4 composition.
- [x] Add and run a private GitHub Actions Android APK build so the owner can proceed without the blocked hosted Expo build quota.
- [ ] Repair the device-observed review page so its Save and Share controls scroll above the Android navigation area on a 9:16 phone.
- [x] Provide a coherent APK installation path when a GitHub debug build is blocked by the existing Expo-signed Reel Reactor package: GitHub now builds a distinct `com.app.reelreactor.test` release APK named Reel Reactor Test.
- [x] Inspect a real owner-device combined output: source video and reaction bubble reach the review screen in one rendered video; final output audio, pause, Green key, and scrolling remain separately unverified.
- [x] Diagnose and repair the device-observed startup stall in the installed side-by-side GitHub Android APK before requesting any further installation: the debug APK omitted the embedded JavaScript bundle and awaited Metro; the successful release workflow includes `:app:createBundleReleaseJsAndAssets`.
- [x] Keep GitHub Actions as the independent Android APK path while the Expo hosted build quota remains exceeded.
- [ ] Confirm on the owner's Android phone that Reel Reactor Test opens past the splash screen and its review Save and Share controls scroll into reach.
- [x] Make the source video and floating-head positioning surface full-height in the reaction studio; replace the always-open lower controls with a compact collapsible sheet without changing recording or composition behavior.
- [x] Remove the visible Paste copied post link option and shared-link route because Facebook links are only saved as URLs and cannot supply a source video file.
- [x] Assess and add an Android Share to Reel Reactor entry point that accepts a video file or public reel URL while preserving Choose a video as the reliable local-file fallback.
- [x] Determine whether a maintained public-reel downloader can support Facebook links without a fragile or credential-dependent always-on service; otherwise keep URL importing unavailable.
- [x] Replace the server-based URL-import proposal with an on-device Android-native public-link downloader that accepts Share to Reel Reactor URLs, saves supported public clips locally, and falls back clearly for private or blocked links.
- [ ] Confirm on the owner's Android phone that Share → Reel Reactor appears for a public Facebook URL, opens the local downloader page, and either imports a playable source or shows its explicit fallback message.

- [ ] Fix the Home screen safe-area/scroll layout so content and instructions are reachable above the fixed Android tab bar.
- [ ] Remove the unintended roughly eight-second reaction-recording cutoff while preserving the working recording and composition behavior.

- [x] Restore a visible Home-screen import-by-link control and verify it starts the local public-link downloader
- [ ] Preserve and verify Android Share → Reel Reactor URL import behavior
- [x] Re-run automated checks and validate the updated manual-link flow before the next APK build

- [x] Lower composed background-reel audio beneath the reaction microphone while preserving pause-and-talk silence sections
- [x] Re-run audio/compositor tests and render validation for the revised mix

- [ ] Diagnose why the downloaded Reel Reactor Test APK is reported as having no app after uninstalling the previous installation
- [ ] Verify or replace the standalone APK delivery path and document exact Android reinstall steps

- [ ] Build and verify a replacement v1.0.18/code 19 APK because the installed v1.0.17 build does not contain the visible paste-link control

- [x] Make early reaction stop end only the talking-head layer while the exported background reel continues to completion
- [x] Render and test a short reaction take against a longer source clip before the next APK build

- [x] Resolve public Facebook share-link redirects before invoking the Android on-device downloader
- [x] Surface bounded actionable downloader diagnostics instead of the current generic public-link failure
- [x] Validate the downloader repair and package it into a new standalone Android APK

- [x] Remove pause-and-talk echo or duplicate-audio capture while preserving the paused background freeze
- [x] Make Stop recording terminate the entire exported video instead of extending the background beyond the reaction
- [x] Validate both fixes in a standalone Android APK without regressing working Facebook link imports
- [ ] Build and install v1.0.22/code 23 to verify pause audio no longer echoes and Stop recording ends the whole export on the owner’s Android phone

- [x] Restore audible source monitoring during normal reaction recording while keeping it muted only during pause
- [x] Make exported output duration follow the actual Stop time instead of the full background source duration
- [x] Validate both regressions and package the repair into a new standalone Android APK

- [x] Add a reachable background-reel volume slider to the reaction studio
- [x] Use the selected background volume for live monitoring and the exported FFmpeg mix while preserving reaction microphone gain
- [ ] Validate slider bounds, compositor audio output, and package the feature into a new standalone Android APK

- [x] Make the Background Reel Audio slider apply its value during live monitoring and final export, not just update its label
- [x] Generalize on-device public-link downloading beyond Facebook to Instagram, TikTok, YouTube, X/Twitter, and other yt-dlp-supported sites
- [ ] Add multi-site link validation and package the repair into a new standalone Android APK
