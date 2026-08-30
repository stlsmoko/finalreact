import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import axios from "axios";
import { instagramGetUrl } from "instagram-url-direct";
import ruhend from "ruhend-scraper";

export type ExtractedVideo = {
  url: string;
  title: string;
  thumbnail?: string;
  platform: string;
  duration?: number;
};

const COMMON_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const BOT_USER_AGENT = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

const VIDEO_STORAGE_DIR = path.resolve(process.cwd(), "storage/videos");

/**
 * Downloads social media video directly using yt-dlp binary for 100% reliable local streaming & zero CORS issues
 */
export async function downloadWithYtDlp(targetUrl: string): Promise<ExtractedVideo | null> {
  try {
    fs.mkdirSync(VIDEO_STORAGE_DIR, { recursive: true });

    const candidates = [
      path.resolve(process.cwd(), "bin/yt-dlp"),
      "/usr/local/bin/yt-dlp",
      "/usr/bin/yt-dlp",
    ];
    const ytdlpBin = candidates.find((p) => fs.existsSync(p));
    if (!ytdlpBin) {
      return null;
    }

    const id = Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
    const outputTemplate = path.join(VIDEO_STORAGE_DIR, `${id}.%(ext)s`);

    const args = [
      "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
      "--no-playlist",
      "--max-filesize", "150M",
      "--print-json",
      "--no-warnings",
      "-o", outputTemplate,
      targetUrl,
    ];

    return await new Promise<ExtractedVideo | null>((resolve) => {
      const proc = spawn(ytdlpBin, args);
      let stdout = "";
      let stderr = "";

      const timeoutTimer = setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {}
        resolve(null);
      }, 45000);

      proc.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      proc.on("close", (code) => {
        clearTimeout(timeoutTimer);
        if (code !== 0) {
          console.warn("[yt-dlp download failed]", stderr || stdout);
          return resolve(null);
        }
        try {
          const jsonLines = stdout.trim().split("\n").filter((l) => l.startsWith("{"));
          const json = jsonLines.length > 0 ? JSON.parse(jsonLines[jsonLines.length - 1]) : {};
          const files = fs.readdirSync(VIDEO_STORAGE_DIR).filter((f) => f.startsWith(id));
          if (!files.length) {
            return resolve(null);
          }
          const filename = files[0];
          const platformName = json.extractor_key || json.extractor || "Social Video";
          resolve({
            url: `/api/media/${filename}`,
            title: json.title || "Social Video Clip",
            thumbnail: json.thumbnail,
            duration: json.duration ? Math.round(json.duration) : undefined,
            platform: platformName,
          });
        } catch (err) {
          console.warn("[yt-dlp parse error]", err);
          resolve(null);
        }
      });
    });
  } catch (err) {
    console.warn("[yt-dlp error]", err);
    return null;
  }
}

/**
 * Normalizes input URLs (Google Drive, Dropbox, Imgur, Giphy, Streamable, etc.) into direct video stream URLs
 */
function normalizeDirectMediaUrl(rawUrl: string): { url: string; platform: string; title?: string } | null {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;

    // 1. Google Drive direct download
    if (host.includes("drive.google.com")) {
      const match = path.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || parsed.searchParams.get("id");
      const fileId = typeof match === "string" ? match : match ? match[1] : null;
      if (fileId) {
        return {
          url: `https://drive.google.com/uc?export=download&id=${fileId}`,
          platform: "Google Drive",
          title: "Google Drive Video",
        };
      }
    }

    // 2. Dropbox direct download
    if (host.includes("dropbox.com")) {
      parsed.searchParams.set("dl", "1");
      return {
        url: parsed.toString(),
        platform: "Dropbox",
        title: "Dropbox Video",
      };
    }

    // 3. Imgur direct video
    if (host.includes("imgur.com")) {
      const idMatch = path.match(/\/([a-zA-Z0-9]+)(?:\.[a-z0-9]+)?$/);
      if (idMatch && idMatch[1] && !path.includes("gallery")) {
        return {
          url: `https://i.imgur.com/${idMatch[1]}.mp4`,
          platform: "Imgur",
          title: "Imgur Video",
        };
      }
    }

    // 4. Giphy direct MP4
    if (host.includes("giphy.com")) {
      const idMatch = path.match(/gifs\/(?:.*-)?([a-zA-Z0-9]+)$/);
      if (idMatch && idMatch[1]) {
        return {
          url: `https://media.giphy.com/media/${idMatch[1]}/giphy.mp4`,
          platform: "Giphy",
          title: "Giphy Animation",
        };
      }
    }

    // 5. Catbox.moe / Streamable
    if (host.includes("catbox.moe") || host.includes("streamable.com")) {
      if (/\.(mp4|webm|mov|m4v)$/i.test(path)) {
        return {
          url: rawUrl,
          platform: "Video Host",
          title: "Hosted Video",
        };
      }
    }

    // 6. Direct video extensions
    if (/\.(mp4|webm|mov|m4v|ogv)(?:\?.*)?$/i.test(path)) {
      const filename = path.split("/").pop() || "Direct Video Clip";
      return {
        url: rawUrl,
        platform: "Direct Video",
        title: decodeURIComponent(filename),
      };
    }
  } catch {
    // Ignore URL parse error
  }
  return null;
}

/**
 * Resolves short links to their canonical destination URL without throwing
 */
async function resolveCanonicalUrl(url: string): Promise<string> {
  try {
    const res = await axios.get(url, {
      maxRedirects: 5,
      timeout: 5000,
      headers: { "User-Agent": COMMON_USER_AGENT },
      validateStatus: (status) => status < 400,
    });
    return res.request?.res?.responseUrl || res.config?.url || url;
  } catch {
    return url;
  }
}

export async function extractSocialVideo(rawUrl: string): Promise<ExtractedVideo> {
  const inputUrl = rawUrl.trim();
  if (!inputUrl) {
    throw new Error("Please provide a valid video link.");
  }

  // Resolve short links (vm.tiktok.com, t.co, bit.ly, youtu.be, fb.watch)
  let url = inputUrl;
  try {
    url = await resolveCanonicalUrl(inputUrl);
  } catch {
    url = inputUrl;
  }

  // 1. First priority: High-fidelity yt-dlp downloader engine
  const ytdlpResult = await downloadWithYtDlp(url);
  if (ytdlpResult) {
    return ytdlpResult;
  }

  // 2. Check direct links (Google Drive, Dropbox, Imgur, Giphy, .mp4, .webm)
  const normalized = normalizeDirectMediaUrl(inputUrl);
  if (normalized) {
    return {
      url: normalized.url,
      title: normalized.title || "Direct Video Clip",
      platform: normalized.platform,
    };
  }

  let hostname = "";
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    hostname = "";
  }

  // 1. X / Twitter (x.com / twitter.com)
  if (hostname.includes("twitter.com") || hostname.includes("x.com") || hostname.includes("t.co")) {
    const match = url.match(/(?:status|statuses)\/(\d+)/i);
    if (match && match[1]) {
      const tweetId = match[1];
      // Try FxTwitter API
      try {
        const resp = await axios.get(`https://api.fxtwitter.com/status/${tweetId}`, {
          timeout: 7000,
          headers: { "User-Agent": BOT_USER_AGENT },
        });
        const tweet = resp.data?.tweet;
        if (tweet?.media?.videos && tweet.media.videos.length > 0) {
          const video = tweet.media.videos[0];
          return {
            url: video.url,
            title: tweet.text ? tweet.text.slice(0, 80) : "X / Twitter Post",
            thumbnail: video.thumbnail_url || tweet.media.photos?.[0]?.url,
            platform: "X / Twitter",
            duration: video.duration,
          };
        }
      } catch {
        // Continue to fallback
      }

      // Try VxTwitter API
      try {
        const resp = await axios.get(`https://api.vxtwitter.com/Twitter/status/${tweetId}`, {
          timeout: 7000,
          headers: { "User-Agent": BOT_USER_AGENT },
        });
        const tweet = resp.data;
        if (tweet?.media_extended && tweet.media_extended.length > 0) {
          const video = tweet.media_extended.find((m: { type: string; url: string }) => m.type === "video");
          if (video && video.url) {
            return {
              url: video.url,
              title: tweet.text ? tweet.text.slice(0, 80) : "X / Twitter Post",
              thumbnail: video.thumbnail_url,
              platform: "X / Twitter",
              duration: video.duration_millis ? Math.round(video.duration_millis / 1000) : undefined,
            };
          }
        }
      } catch {
        // Continue to fallback
      }
    }
  }

  // 2. TikTok (tiktok.com / vm.tiktok.com)
  if (hostname.includes("tiktok.com")) {
    // Try TikWM API
    try {
      const resp = await axios.post(
        "https://www.tikwm.com/api/",
        new URLSearchParams({ url, hd: "1" }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": COMMON_USER_AGENT,
          },
          timeout: 9000,
        }
      );
      if (resp.data && resp.data.data && (resp.data.data.play || resp.data.data.wmplay)) {
        const data = resp.data.data;
        const playUrl = data.play || data.wmplay;
        const videoUrl = playUrl.startsWith("http") ? playUrl : `https://www.tikwm.com${playUrl}`;
        return {
          url: videoUrl,
          title: data.title || "TikTok Video",
          thumbnail: data.cover,
          platform: "TikTok",
          duration: data.duration,
        };
      }
    } catch {
      // Continue to fallback
    }

    // Try ruhend ttdl
    try {
      if (typeof ruhend.ttdl === "function") {
        const ttData = await ruhend.ttdl(url);
        const vUrl =
          (Array.isArray(ttData?.video) && ttData.video[0]) ||
          ttData?.video ||
          ttData?.url ||
          ttData?.result;
        if (vUrl && typeof vUrl === "string") {
          return {
            url: vUrl,
            title: ttData.title || "TikTok Video",
            thumbnail: ttData.thumbnail,
            platform: "TikTok",
          };
        }
      }
    } catch {
      // Continue to fallback
    }

    // Try Lovetik API
    try {
      const resp = await axios.post(
        "https://lovetik.com/api/ajax/search",
        new URLSearchParams({ query: url }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": COMMON_USER_AGENT,
          },
          timeout: 7000,
        }
      );
      if (resp.data && resp.data.links && resp.data.links.length > 0) {
        const linkObj = resp.data.links.find((l: { a: string }) => l.a) || resp.data.links[0];
        const vUrl = linkObj?.a;
        if (vUrl) {
          return {
            url: vUrl,
            title: resp.data.desc || "TikTok Video",
            thumbnail: resp.data.cover,
            platform: "TikTok",
          };
        }
      }
    } catch {
      // Continue to fallback
    }
  }

  // 3. Instagram (instagram.com / instagr.am)
  if (hostname.includes("instagram.com") || hostname.includes("instagr.am")) {
    // Try instagram-url-direct
    try {
      const directResult = await instagramGetUrl(url);
      if (directResult?.url_list && directResult.url_list.length > 0) {
        return {
          url: directResult.url_list[0],
          title: "Instagram Reel",
          platform: "Instagram",
        };
      }
    } catch {
      // Continue to fallback
    }

    // Try ruhend igdl / igdl2
    try {
      if (typeof ruhend.igdl === "function") {
        const igData = await ruhend.igdl(url);
        const mediaUrl = Array.isArray(igData)
          ? igData[0]?.url || igData[0]?.video
          : igData?.url || igData?.video || igData?.result;
        if (mediaUrl && typeof mediaUrl === "string") {
          return {
            url: mediaUrl,
            title: "Instagram Reel",
            platform: "Instagram",
          };
        }
      }
    } catch {
      // Continue to fallback
    }

    try {
      if (typeof ruhend.igdl2 === "function") {
        const igData2 = await ruhend.igdl2(url);
        const mediaUrl = Array.isArray(igData2)
          ? igData2[0]?.url || igData2[0]?.video
          : igData2?.url || igData2?.video || igData2?.result;
        if (mediaUrl && typeof mediaUrl === "string") {
          return {
            url: mediaUrl,
            title: "Instagram Reel",
            platform: "Instagram",
          };
        }
      }
    } catch {
      // Continue to fallback
    }

    // Try ddinstagram metadata parser
    try {
      const ddUrl = url.replace("instagram.com", "ddinstagram.com");
      const ddRes = await axios.get(ddUrl, {
        headers: { "User-Agent": BOT_USER_AGENT },
        timeout: 7000,
        validateStatus: (s) => s < 400,
      });
      const html = typeof ddRes.data === "string" ? ddRes.data : "";
      const ogVideo = html.match(/<meta\s+property=["']og:video(?::secure_url)?["']\s+content=["']([^"']+)["']/i);
      if (ogVideo && ogVideo[1]) {
        return {
          url: ogVideo[1].replace(/&amp;/g, "&"),
          title: "Instagram Reel",
          platform: "Instagram",
        };
      }
    } catch {
      // Continue to fallback
    }
  }

  // 4. Facebook (facebook.com / fb.watch)
  if (hostname.includes("facebook.com") || hostname.includes("fb.watch")) {
    // Try ruhend fbdl
    try {
      if (typeof ruhend.fbdl === "function") {
        const fbData = await ruhend.fbdl(url);
        const fbUrl =
          fbData?.hd ||
          fbData?.sd ||
          fbData?.url ||
          (Array.isArray(fbData) ? fbData[0]?.url || fbData[0]?.video : null);
        if (fbUrl && typeof fbUrl === "string") {
          return {
            url: fbUrl,
            title: fbData?.title || "Facebook Video",
            platform: "Facebook",
          };
        }
      }
    } catch {
      // Continue to fallback
    }

    // Try ruhend fbdl2
    try {
      if (typeof ruhend.fbdl2 === "function") {
        const fbData2 = await ruhend.fbdl2(url);
        const fbUrl =
          fbData2?.hd ||
          fbData2?.sd ||
          fbData2?.url ||
          (Array.isArray(fbData2) ? fbData2[0]?.url || fbData2[0]?.video : null);
        if (fbUrl && typeof fbUrl === "string") {
          return {
            url: fbUrl,
            title: fbData2?.title || "Facebook Video",
            platform: "Facebook",
          };
        }
      }
    } catch {
      // Continue to fallback
    }

    // Try direct Facebook HTML metadata extraction with safe bot user agent
    try {
      const fbRes = await axios.get(url, {
        headers: {
          "User-Agent": BOT_USER_AGENT,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: 8000,
        validateStatus: (s) => s < 400,
      });
      const html = typeof fbRes.data === "string" ? fbRes.data : "";
      
      // Check for HD/SD source in script payloads
      const hdMatch = html.match(/"browser_native_hd_url":"([^"]+)"/) || html.match(/"playable_url_quality_hd":"([^"]+)"/);
      const sdMatch = html.match(/"browser_native_sd_url":"([^"]+)"/) || html.match(/"playable_url":"([^"]+)"/);
      const targetMatch = hdMatch || sdMatch;
      if (targetMatch && targetMatch[1]) {
        const cleanUrl = targetMatch[1].replace(/\\u0025/g, "%").replace(/\\u0026/g, "&").replace(/\\\//g, "/");
        return {
          url: cleanUrl,
          title: "Facebook Reel",
          platform: "Facebook",
        };
      }

      const ogVideo = html.match(/<meta\s+property=["']og:video(?::secure_url)?["']\s+content=["']([^"']+)["']/i);
      if (ogVideo && ogVideo[1]) {
        return {
          url: ogVideo[1].replace(/&amp;/g, "&"),
          title: "Facebook Video",
          platform: "Facebook",
        };
      }
    } catch {
      // Continue to fallback
    }
  }

  // 5. Reddit (reddit.com / redd.it)
  if (hostname.includes("reddit.com") || hostname.includes("redd.it")) {
    try {
      const cleanUrl = url.split("?")[0].replace(/\/$/, "");
      const jsonUrl = `${cleanUrl}.json`;
      const res = await axios.get(jsonUrl, {
        headers: { "User-Agent": COMMON_USER_AGENT },
        timeout: 7000,
        validateStatus: (s) => s < 400,
      });
      const post = res.data?.[0]?.data?.children?.[0]?.data;
      const media = post?.media?.reddit_video || post?.secure_media?.reddit_video;
      if (media?.fallback_url) {
        return {
          url: media.fallback_url,
          title: post.title || "Reddit Video",
          thumbnail: post.thumbnail,
          duration: media.duration,
          platform: "Reddit",
        };
      }
    } catch {
      // Continue to fallback
    }
  }

  // 6. Universal HTML5 & OpenGraph video scraper (works for blogs, news sites, direct media pages, video CDN sites)
  try {
    const res = await axios.get(url, {
      headers: {
        "User-Agent": COMMON_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,video/*;q=0.8,*/*;q=0.7",
      },
      timeout: 8000,
      maxRedirects: 5,
      validateStatus: (status) => status < 400,
    });

    if (res.status === 200) {
      const contentType = res.headers["content-type"] || "";
      if (contentType.includes("video/")) {
        return {
          url,
          title: "Direct Video",
          platform: "Direct Video",
        };
      }

      const html = typeof res.data === "string" ? res.data : "";
      const ogVideoMatch =
        html.match(/<meta\s+(?:property|name)=["'](?:og:video|og:video:url|og:video:secure_url|twitter:player:stream)["']\s+content=["']([^"']+)["']/i) ||
        html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["'](?:og:video|og:video:url|og:video:secure_url|twitter:player:stream)["']/i);
      const ogTitleMatch =
        html.match(/<meta\s+(?:property|name)=["'](?:og:title|twitter:title)["']\s+content=["']([^"']+)["']/i) ||
        html.match(/<title>([^<]+)<\/title>/i);

      if (ogVideoMatch && ogVideoMatch[1]) {
        const decodedUrl = ogVideoMatch[1].replace(/&amp;/g, "&");
        const absUrl = decodedUrl.startsWith("http") ? decodedUrl : new URL(decodedUrl, url).toString();
        return {
          url: absUrl,
          title: ogTitleMatch ? ogTitleMatch[1].replace(/&amp;/g, "&").trim() : "Online Video",
          platform: hostname || "Web Video",
        };
      }

      // Check for raw HTML5 video / source tags in the page
      const videoTagMatch =
        html.match(/<video[^>]*\ssrc=["']([^"']+)["']/i) ||
        html.match(/<source[^>]*\ssrc=["']([^"']+\.(?:mp4|webm|mov|m4v))["']/i);
      if (videoTagMatch && videoTagMatch[1]) {
        const rawSrc = videoTagMatch[1].replace(/&amp;/g, "&");
        const absUrl = rawSrc.startsWith("http") ? rawSrc : new URL(rawSrc, url).toString();
        return {
          url: absUrl,
          title: ogTitleMatch ? ogTitleMatch[1].replace(/&amp;/g, "&").trim() : "Web Video",
          platform: hostname || "Web Video",
        };
      }
    }
  } catch {
    // Safe failover
  }

  // Clear, helpful guidance for the user
  const displayHost = hostname.replace(/^www\./, "") || "social network";
  throw new Error(
    `Could not download video from this link (${displayHost}). The post may be private, expired, or restricted by the platform. You can paste a direct video link (.mp4 / Google Drive / Dropbox) or select a saved video from your device.`
  );
}
