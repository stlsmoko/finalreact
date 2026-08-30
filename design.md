# Reel Reactor — Mobile Interface Design

## Product intent

Reel Reactor is a **private, portrait-first reaction-video studio** for one creator. It begins with a video that is already accessible on the device, then layers a live front-camera reaction over that source video. The first MVP is designed for one-handed iPhone and Android use, with a familiar native layout, large controls, and no account setup or cloud dependency.

The initial app will accept a **locally selected video** as the reliable input path. A shared social link may be captured as a draft reference when another app exposes it through the operating system share sheet, but a social platform does not necessarily grant access to its underlying video file. The reaction studio will therefore make the available source explicit before recording.

## Screen list

| Screen | Primary content and functionality |
|---|---|
| **Start** | A clear starting point with “Choose a video” and “Paste shared link” actions. It displays the most recent local project when available. |
| **Source setup** | A selected video preview, its source label, trim placeholder, and a primary action to open the reaction studio. It should explain when a shared link needs a locally saved clip before recording. |
| **Reaction studio** | A full-screen, 9:16 source-video preview with a resizable, draggable front-camera overlay; a large bottom recording control; sound, flip-camera, and close controls; a compact elapsed-time indicator. |
| **Review** | A completed recording preview with Save to Library, Share, Record Again, and Discard controls. The earliest build may expose this workflow as a clear capability boundary until true compositing/export is wired in. |
| **Settings / permissions** | Camera, microphone, and photo-library access state, plus a short privacy note stating that footage stays on the device in the MVP. |

## Key user flows

| Flow | Steps |
|---|---|
| **React to a saved clip** | User opens Reel Reactor → taps **Choose a video** → selects an existing video from the device → confirms source setup → moves and resizes their camera bubble → taps the main record control → records → reviews and saves/shares. |
| **Start from a shared post** | User taps Share in a social app → selects Reel Reactor when the operating system offers it → the app captures the shared URL or file as a draft → user either proceeds if a video file was supplied or selects a locally saved copy of the clip → enters the studio. |
| **First use** | User opens studio → the app requests camera and microphone permission at the moment they tap Record → camera preview appears → the user can flip the lens and record. |

## Layout and interaction

The app uses a **single-column 9:16 composition**. The source video occupies the full canvas, with black letterboxing when required so its original framing is never cropped unexpectedly. The reaction overlay begins in the upper-right quadrant, away from typical short-video captions and controls. It has a subtle white outline and shadow to remain visible on bright video. Dragging moves it; a visible corner handle resizes it, with an accessible reset action returning it to the default upper-right placement.

The bottom control deck is deliberately simple. A large 68–76 point circular record button sits within thumb reach, while sound and camera-flip controls sit on either side. Tapping record provides light haptic feedback and changes the button to a square stop symbol. The top bar contains Back, title/status, and a close action. Controls maintain high contrast over video through a dark translucent treatment.

## Color choices

| Role | Color | Rationale |
|---|---|---|
| **Brand accent** | `#FF5C35` — Reactor Orange | Energetic, creator-oriented call-to-action color that distinguishes recording state. |
| **Studio canvas** | `#0C1018` — Graphite | Reduces glare and keeps source footage visually primary. |
| **Surface** | `#171E2B` — Midnight Slate | Provides layered, iOS-like floating panels without pure black monotony. |
| **Primary text** | `#F7F8FA` — Cloud | Ensures legibility on dark studio surfaces. |
| **Secondary text** | `#AAB3C2` — Cool Grey | Supports instruction and source metadata without competing with controls. |
| **Success** | `#36C98A` — Signal Green | Reserved for saved/export-ready status. |

## MVP capability boundary

The product must export **one clean native MP4** containing the selected local source video, the user-positioned camera reaction overlay, source audio, and reaction microphone audio. The app must never direct the owner to record the device screen or treat a camera-only file as a finished reaction. Direct playback/downloading of Instagram, Facebook, and TikTok content is not assumed: the owner should only use videos they have rights to reuse and import a local copy where the social platform does not provide a shareable file.
