package expo.modules.selfiecutout

import android.graphics.Bitmap
import android.graphics.Color
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

class SelfieCutoutModule : Module() {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun definition() = ModuleDefinition {
        Name("SelfieCutout")

        AsyncFunction("createPersonMask") { videoUri: String, promise: Promise ->
            scope.launch {
                try {
                    promise.resolve(createPersonMask(videoUri))
                } catch (error: Exception) {
                    Log.e(TAG, "Person mask failed", error)
                    promise.reject(
                        "SELFIE_CUTOUT_FAILED",
                        error.message ?: "Could not isolate the person from this camera recording.",
                        error
                    )
                }
            }
        }

        OnDestroy {
            scope.cancel()
        }
    }

    private fun createPersonMask(videoUri: String): Map<String, Any> {
        val context = appContext.reactContext
            ?: throw IllegalStateException("Reel Reactor is still opening. Try recording again in a moment.")

        val retriever = MediaMetadataRetriever()
        val options = SelfieSegmenterOptions.Builder()
            .setDetectorMode(SelfieSegmenterOptions.SINGLE_IMAGE_MODE)
            .enableRawSizeMask()
            .build()
        val segmenter = Segmentation.getClient(options)

        try {
            setRetrieverSource(retriever, videoUri)

            val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
                ?.toLongOrNull()
                ?.coerceAtLeast(0L)
                ?: 0L
            val fps = if (durationMs >= 4_000L) MASK_FPS_LONG else MASK_FPS_SHORT
            val frameIntervalUs = (1_000_000.0 / fps).toLong().coerceAtLeast(80_000L)
            val lastTimeUs = if (durationMs <= 0L) 0L else durationMs * 1_000L

            val outputDir = File(context.cacheDir, "reel-reactor-cutout-${System.currentTimeMillis()}")
            if (!outputDir.mkdirs()) {
                throw IllegalStateException("Could not create a folder for the cutout mask.")
            }

            var frameIndex = 0
            var timeUs = 0L
            var lastMask: Bitmap? = null

            while (timeUs <= lastTimeUs || frameIndex == 0) {
                val frame = getFrame(retriever, timeUs)
                if (frame != null) {
                    val working = scaleForModel(frame)
                    if (working !== frame) {
                        frame.recycle()
                    }
                    lastMask = segmentToMask(segmenter, working, lastMask)
                    working.recycle()
                } else if (lastMask == null) {
                    throw IllegalStateException("The camera recording could not be decoded for cutout.")
                }

                frameIndex += 1
                val maskFile = File(outputDir, "mask_%05d.png".format(frameIndex))
                writePng(lastMask!!, maskFile)

                if (lastTimeUs == 0L) break
                val nextTime = timeUs + frameIntervalUs
                if (nextTime > lastTimeUs && timeUs < lastTimeUs) {
                    timeUs = lastTimeUs
                } else {
                    timeUs = nextTime
                }
                if (frameIndex >= MAX_FRAMES) break
            }

            if (frameIndex == 0) {
                throw IllegalStateException("Cutout did not produce any person masks.")
            }

            return mapOf(
                "directory" to "file://${outputDir.absolutePath}",
                "pattern" to "${outputDir.absolutePath}/mask_%05d.png",
                "fps" to fps,
                "frameCount" to frameIndex
            )
        } finally {
            try {
                segmenter.close()
            } catch (_: Exception) {
            }
            try {
                retriever.release()
            } catch (_: Exception) {
            }
        }
    }

    private fun setRetrieverSource(retriever: MediaMetadataRetriever, videoUri: String) {
        val context = appContext.reactContext
        val path = videoUri.removePrefix("file://")
        try {
            retriever.setDataSource(path)
            return
        } catch (_: Exception) {
        }
        if (context != null) {
            retriever.setDataSource(context, Uri.parse(videoUri))
            return
        }
        throw IllegalStateException("Could not open the camera recording for cutout.")
    }

    private fun getFrame(retriever: MediaMetadataRetriever, timeUs: Long): Bitmap? {
        return if (Build.VERSION.SDK_INT >= 27) {
            retriever.getScaledFrameAtTime(
                timeUs,
                MediaMetadataRetriever.OPTION_CLOSEST,
                MODEL_SIZE,
                MODEL_SIZE
            )
        } else {
            retriever.getFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST)
        }
    }

    private fun scaleForModel(source: Bitmap): Bitmap {
        val needsCopy = source.config != Bitmap.Config.ARGB_8888 ||
            (Build.VERSION.SDK_INT >= 26 && source.config == Bitmap.Config.HARDWARE)
        val converted = if (!needsCopy) {
            source
        } else {
            source.copy(Bitmap.Config.ARGB_8888, false)
                ?: throw IllegalStateException("Could not copy a camera frame for cutout.")
        }
        val side = maxOf(converted.width, converted.height).coerceAtLeast(1)
        if (converted.width <= MODEL_SIZE && converted.height <= MODEL_SIZE && converted === source) {
            return converted
        }
        val scaled = Bitmap.createScaledBitmap(
            converted,
            (converted.width * MODEL_SIZE) / side,
            (converted.height * MODEL_SIZE) / side,
            true
        )
        if (converted !== source && converted !== scaled) {
            converted.recycle()
        }
        return scaled
    }

    private fun segmentToMask(segmenter: com.google.mlkit.vision.segmentation.Segmenter, frame: Bitmap, previous: Bitmap?): Bitmap {
        val image = InputImage.fromBitmap(frame, 0)
        val result = Tasks.await(segmenter.process(image), 8, TimeUnit.SECONDS)
        val buffer = result.buffer
        buffer.rewind()
        val width = result.width
        val height = result.height
        val pixels = IntArray(width * height)
        var personPixels = 0
        for (index in pixels.indices) {
            val confidence = buffer.get().toInt() and 0xFF
            if (confidence > 24) personPixels += 1
            pixels[index] = Color.argb(255, confidence, confidence, confidence)
        }
        val coverage = personPixels.toFloat() / pixels.size.toFloat()
        if (coverage < 0.02f && previous != null) {
            return previous
        }

        val mask = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        mask.setPixels(pixels, 0, width, 0, 0, width, height)
        previous?.recycle()
        return mask
    }

    private fun writePng(bitmap: Bitmap, file: File) {
        FileOutputStream(file).use { stream ->
            if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)) {
                throw IllegalStateException("Could not write a cutout mask frame.")
            }
        }
    }

    companion object {
        private const val TAG = "SelfieCutout"
        private const val MODEL_SIZE = 256
        private const val MASK_FPS_SHORT = 12.0
        private const val MASK_FPS_LONG = 8.0
        private const val MAX_FRAMES = 360
    }
}
