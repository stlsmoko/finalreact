import * as FileSystem from "expo-file-system/legacy";

const BOT_USER_AGENT = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

const MIN_MEDIA_BYTES = 8_192;

export type ImportedPublicVideo = {
  uri: string;
  fileName: string;
};

function unescapeMediaUrl(value: string) {
  return value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(new RegExp("&" + "amp;", "g"), "&")
    .trim();
}

function isPlayableVideoUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (/\.(mp4|m4v|webm|mov)(?:$|\?)/i.test(parsed.pathname + parsed.search)) return true;
    return (
      host.includes("fbcdn.net") ||
      host.includes("cdninstagram.com") ||
      host.includes("tiktokcdn") ||
      host.includes("snssdk.com") ||
      host.includes("twimg.com") ||
      host.includes("video.twimg") ||
      host.includes("googlevideo.com") ||
      host.includes("scontent") ||
      path.includes("/video") ||
      path.includes("/reel")
    );
  } catch {
    return false;
  }
}

function extractDirectVideoUrl(html: string, pageUrl: string) {
  const patterns = [
    /"browser_native_hd_url"\s*:\s*"([^"]+)"/i,
    /"playable_url_quality_hd"\s*:\s*"([^"]+)"/i,
    /"browser_native_sd_url"\s*:\s*"([^"]+)"/i,
    /"playable_url"\s*:\s*"([^"]+)"/i,
    /"video_url"\s*:\s*"([^"]+)"/i,
    /"playAddr"\s*:\s*"([^"]+)"/i,
    /"downloadAddr"\s*:\s*"([^"]+)"/i,
    /"video_versions"\s*:\s*\[[^\]]*"url"\s*:\s*"([^"]+)"/i,
    /<meta\s+(?:property|name)=["'](?:og:video|og:video:url|og:video:secure_url|twitter:player:stream)["']\s+content=["']([^"']+)["']/i,
    /<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["'](?:og:video|og:video:url|og:video:secure_url|twitter:player:stream)["']/i,
    /<video[^>]*\ssrc=["']([^"']+)["']/i,
    /<source[^>]*\ssrc=["']([^"']+\.(?:mp4|webm|mov|m4v)[^"']*)["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;
    const raw = unescapeMediaUrl(match[1]);
    try {
      const absolute = raw.startsWith("http") ? raw : new URL(raw, pageUrl).toString();
      if (isPlayableVideoUrl(absolute)) return absolute;
    } catch {
      // Keep scanning other payload shapes.
    }
  }
  return null;
}

async function fetchHtml(url: string, userAgent: string) {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": userAgent,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("video/")) return null;
  return response.text();
}

async function scrapeDirectVideoUrl(pageUrl: string) {
  for (const userAgent of [BOT_USER_AGENT, BROWSER_USER_AGENT]) {
    try {
      const html = await fetchHtml(pageUrl, userAgent);
      if (!html) continue;
      const direct = extractDirectVideoUrl(html, pageUrl);
      if (direct) return direct;
    } catch {
      // Try the next user agent.
    }
  }
  return null;
}

export async function importPublicVideoFromPage(pageUrl: string): Promise<ImportedPublicVideo | null> {
  if (!FileSystem.cacheDirectory) return null;

  const directUrl = await scrapeDirectVideoUrl(pageUrl);
  if (!directUrl) return null;

  const destination = `${FileSystem.cacheDirectory}reel-reactor-import-${Date.now()}.mp4`;
  try {
    const downloaded = await FileSystem.downloadAsync(directUrl, destination, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Referer: pageUrl,
        Accept: "video/mp4,video/*,*/*;q=0.8",
      },
    });
    const info = await FileSystem.getInfoAsync(downloaded.uri);
    if (!info.exists || !info.size || info.size < MIN_MEDIA_BYTES) {
      return null;
    }
    return {
      uri: downloaded.uri,
      fileName: "Imported Video",
    };
  } catch {
    return null;
  }
}
