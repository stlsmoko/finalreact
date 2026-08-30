# Facebook Importer Evidence

- User-reported share URL: `https://www.facebook.com/share/r/1LyABp9fRZ/`
- Browser resolution observed: `https://www.facebook.com/reel/1759796775270217`
- Upstream downloader reference: https://github.com/yausername/youtubedl-android
- Upstream sample confirms the supported `YoutubeDL.getInstance().updateYoutubeDL(context, YoutubeDL.UpdateChannel._STABLE)` call.
- Current yt-dlp inspection of the exact URL found playable Facebook `hd` and `sd` progressive MP4 formats plus separate DASH streams. The existing selector requiring `acodec` and `vcodec` metadata returned `Requested format is not available`, while `-f hd` downloaded a valid 9.08 MiB 720x1280 H.264/AAC MP4.
- The native repair therefore uses `hd/sd` for Facebook URLs, attempts the stable extractor update, and includes a bounded native error detail when access remains blocked.
