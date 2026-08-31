package expo.modules.reelimporter

import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLException
import com.yausername.youtubedl_android.YoutubeDLRequest
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class ReelImporterModule : Module() {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private fun isFacebookUrl(url: java.net.URL): Boolean {
        val host = url.host.lowercase()
        return host == "facebook.com" || host.endsWith(".facebook.com") || host == "fb.watch"
    }

    private fun isInstagramUrl(url: java.net.URL): Boolean {
        val host = url.host.lowercase()
        return host == "instagram.com" || host.endsWith(".instagram.com") || host == "instagr.am"
    }

    private fun isTikTokUrl(url: java.net.URL): Boolean {
        val host = url.host.lowercase()
        return host == "tiktok.com" || host.endsWith(".tiktok.com") || host == "vt.tiktok.com" || host == "vm.tiktok.com"
    }

    private fun isYouTubeUrl(url: java.net.URL): Boolean {
        val host = url.host.lowercase()
        return host == "youtube.com" || host.endsWith(".youtube.com") || host == "youtu.be"
    }

    private fun isTwitterOrXUrl(url: java.net.URL): Boolean {
        val host = url.host.lowercase()
        return host == "twitter.com" || host.endsWith(".twitter.com") || host == "x.com" || host.endsWith(".x.com") || host == "t.co"
    }

    private fun importFormatFor(url: java.net.URL): String {
        return when {
            isFacebookUrl(url) -> "hd/sd/best[ext=mp4]/best"
            isInstagramUrl(url) -> "best[ext=mp4]/b/bv*+ba/best"
            isTikTokUrl(url) -> "download_addr/h264/best[ext=mp4]/best"
            isYouTubeUrl(url) -> "18/22/best[ext=mp4]/b/bv*+ba/best"
            isTwitterOrXUrl(url) -> "http-720/http-480/best[ext=mp4]/best"
            else -> "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/b/bv*+ba/best"
        }
    }

    private fun downloadDetail(error: YoutubeDLException): String {
        val detail = error.message
            ?.lineSequence()
            ?.map { it.trim() }
            ?.lastOrNull { it.isNotBlank() }
            ?.take(300)
            ?: return ""
        return " Details: $detail"
    }

    private fun unescapeMediaUrl(value: String): String {
        return value
            .replace("\\/", "/")
            .replace("\\u0026", "&")
            .replace("\\u0025", "%")
            .replace("\\u002F", "/")
            .replace("&" + "amp;", "&")
            .trim()
    }

    private fun extractDirectVideoUrl(html: String): String? {
        val patterns = listOf(
            Regex("\"browser_native_hd_url\"\\s*:\\s*\"([^\"]+)\""),
            Regex("\"playable_url_quality_hd\"\\s*:\\s*\"([^\"]+)\""),
            Regex("\"browser_native_sd_url\"\\s*:\\s*\"([^\"]+)\""),
            Regex("\"playable_url\"\\s*:\\s*\"([^\"]+)\""),
            Regex("property=[\"']og:video(?::secure_url)?[\"']\\s+content=[\"']([^\"']+)[\"']", RegexOption.IGNORE_CASE),
            Regex("content=[\"']([^\"']+)[\"']\\s+property=[\"']og:video(?::secure_url)?[\"']", RegexOption.IGNORE_CASE)
        )
        for (pattern in patterns) {
            val match = pattern.find(html) ?: continue
            val candidate = unescapeMediaUrl(match.groupValues[1])
            if (candidate.startsWith("http") && (candidate.contains(".mp4") || candidate.contains("fbcdn.net") || candidate.contains("video"))) {
                return candidate
            }
        }
        return null
    }

    private fun fetchHtml(pageUrl: String, userAgent: String): String? {
        val connection = (URL(pageUrl).openConnection() as HttpURLConnection)
        connection.instanceFollowRedirects = true
        connection.connectTimeout = 12_000
        connection.readTimeout = 12_000
        connection.setRequestProperty("User-Agent", userAgent)
        connection.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        connection.setRequestProperty("Accept-Language", "en-US,en;q=0.9")
        connection.requestMethod = "GET"
        return try {
            if (connection.responseCode >= 400) null
            else connection.inputStream.bufferedReader().use { it.readText() }
        } catch (_: Exception) {
            null
        } finally {
            connection.disconnect()
        }
    }

    private fun downloadDirectVideo(videoUrl: String, outputFile: File, referer: String): Boolean {
        val connection = (URL(videoUrl).openConnection() as HttpURLConnection)
        connection.instanceFollowRedirects = true
        connection.connectTimeout = 15_000
        connection.readTimeout = 30_000
        connection.setRequestProperty("User-Agent", BROWSER_USER_AGENT)
        connection.setRequestProperty("Referer", referer)
        connection.setRequestProperty("Accept", "video/mp4,video/*,*/*;q=0.8")
        connection.requestMethod = "GET"
        return try {
            if (connection.responseCode >= 400) return false
            connection.inputStream.use { input ->
                outputFile.outputStream().use { output ->
                    input.copyTo(output)
                }
            }
            outputFile.exists() && outputFile.length() > 8_192L
        } catch (_: Exception) {
            false
        } finally {
            connection.disconnect()
        }
    }

    private fun importFromPageHtml(pageUrl: String, outputFile: File): Boolean {
        val agents = listOf(FACEBOOK_BOT_USER_AGENT, BROWSER_USER_AGENT)
        for (agent in agents) {
            val html = fetchHtml(pageUrl, agent) ?: continue
            val direct = extractDirectVideoUrl(html) ?: continue
            if (downloadDirectVideo(direct, outputFile, pageUrl)) {
                return true
            }
        }
        return false
    }

    override fun definition() = ModuleDefinition {
        Name("ReelImporter")

        AsyncFunction("downloadPublicVideo") { url: String, promise: Promise ->
            scope.launch {
                try {
                    val parsedUrl = java.net.URL(url)
                    if (parsedUrl.protocol != "https" && parsedUrl.protocol != "http") {
                        throw IllegalArgumentException("Use a public http or https video link.")
                    }

                    val context = appContext.reactContext
                        ?: throw IllegalStateException("Reel Reactor is still opening. Try importing the link again in a moment.")

                    val importsDirectory = File(context.cacheDir, "reel-reactor-imports")
                    if (!importsDirectory.exists() && !importsDirectory.mkdirs()) {
                        throw IllegalStateException("Reel Reactor could not create local video storage.")
                    }

                    val startedAt = System.currentTimeMillis()
                    val htmlOutput = File(importsDirectory, "reaction-source-$startedAt.mp4")
                    if ((isFacebookUrl(parsedUrl) || isInstagramUrl(parsedUrl)) && importFromPageHtml(url, htmlOutput)) {
                        promise.resolve(mapOf(
                            "uri" to "file://${htmlOutput.absolutePath}",
                            "fileName" to htmlOutput.name,
                            "size" to htmlOutput.length()
                        ))
                        return@launch
                    }

                    YoutubeDL.getInstance().init(context)
                    try {
                        YoutubeDL.getInstance().updateYoutubeDL(context, YoutubeDL.UpdateChannel._STABLE)
                    } catch (updateError: Exception) {
                        Log.w("ReelImporter", "Could not refresh yt-dlp; using the bundled extractor.", updateError)
                    }

                    val outputTemplate = File(importsDirectory, "reaction-source-$startedAt.%(ext)s").absolutePath
                    val request = YoutubeDLRequest(url)
                    request.addOption("--no-playlist")
                    request.addOption("--no-mtime")
                    request.addOption("--restrict-filenames")
                    request.addOption("--user-agent", BROWSER_USER_AGENT)
                    request.addOption("--referer", url)
                    request.addOption("-f", importFormatFor(parsedUrl))
                    request.addOption("-o", outputTemplate)
                    YoutubeDL.getInstance().execute(request)

                    val imported = importsDirectory.listFiles()
                        ?.filter { it.isFile && it.lastModified() >= startedAt - 2_000L && it.length() > 0L }
                        ?.maxByOrNull { it.lastModified() }
                        ?: throw IllegalStateException("The shared link did not produce a playable local video.")

                    promise.resolve(mapOf(
                        "uri" to "file://${imported.absolutePath}",
                        "fileName" to imported.name,
                        "size" to imported.length()
                    ))
                } catch (error: YoutubeDLException) {
                    try {
                        val context = appContext.reactContext
                        if (context != null) {
                            val importsDirectory = File(context.cacheDir, "reel-reactor-imports")
                            val fallback = File(importsDirectory, "reaction-source-${System.currentTimeMillis()}.mp4")
                            if (importFromPageHtml(url, fallback)) {
                                promise.resolve(mapOf(
                                    "uri" to "file://${fallback.absolutePath}",
                                    "fileName" to fallback.name,
                                    "size" to fallback.length()
                                ))
                                return@launch
                            }
                        }
                    } catch (_: Exception) {
                    }
                    promise.reject(
                        "PUBLIC_LINK_UNAVAILABLE",
                        "Reel Reactor could not download a playable public video from this link. It may be private, require a Facebook login, or no longer expose a downloadable video.${downloadDetail(error)} Choose a saved copy instead.",
                        error
                    )
                } catch (error: Exception) {
                    promise.reject("PUBLIC_LINK_IMPORT_FAILED", error.message ?: "The public link could not be imported.", error)
                }
            }
        }

        OnDestroy {
            scope.cancel()
        }
    }

    companion object {
        private const val FACEBOOK_BOT_USER_AGENT =
            "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
        private const val BROWSER_USER_AGENT =
            "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
    }
}
