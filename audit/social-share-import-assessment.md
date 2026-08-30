# Social Share Import Assessment

## Android share target

The maintained `expo-share-intent` native Expo module documents Android and iOS receipt of shared URLs, text, video files, images, and other files. Its reported payload includes local file paths, MIME types, names, dimensions, and video duration. It requires a custom native build and cannot run in Expo Go, which is compatible with Reel Reactor’s existing custom FFmpeg build requirement.

Source: https://github.com/achorein/expo-share-intent

## Public-reel downloader

`yt-dlp` is maintained and widely used, but current public issue records demonstrate that Facebook/Reel extraction can fail as the platform changes its delivery and access rules. A reliable in-app URL importer would therefore need a maintained server-side downloader with a clear failure state and may require a public accessible URL or user-authenticated session. It cannot promise that every Facebook Share URL will turn into a usable video file.

Source: https://github.com/yt-dlp/yt-dlp

## On-device Android-native option

The maintained `youtubedl-android` wrapper packages the yt-dlp executable and a Python runtime in an Android library. Its project describes on-device yt-dlp execution and optional FFmpeg/Aria2 integration, meaning a small local Expo Android module could expose an import method without using an always-on server. It increases APK size and requires a custom Android build, but both are acceptable for Reel Reactor’s existing native FFmpeg architecture.

The documented Android integration uses Maven Central dependency `io.github.junkfood02.youtubedl-android:library:0.18.1`, requires `android:extractNativeLibs="true"`, and initializes the library in the native application lifecycle. Android scoped storage requires writing downloads to an app-accessible path or the public Downloads/Documents directories. Reel Reactor can instead use its app cache directory, then pass the resulting local file URI to the existing native compositor.

The first real GitHub Android compile reached the `reel-importer` module and identified only a Kotlin API-overload mismatch in the progress-call syntax. The wrapper’s synchronous `execute(request)` overload is now used. Its embedded Python archive caused symbol-strip warnings, but not the build failure; the APK was not produced and no installation was requested.

Source: https://github.com/yausername/youtubedl-android

## Assessment

Receiving a shared **video file** from Android’s Share sheet is a feasible native mobile addition. Receiving a shared **Facebook link** is also feasible, but downloading a protected reel from that link is not a reliable offline app feature. The local “Choose a video” route remains the dependable fallback.
