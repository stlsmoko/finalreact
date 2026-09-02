package expo.modules.selfiecutout

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
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

        View(SelfieCutoutView::class) {
            Events("onReady", "onError")
            Prop("facing") { view: SelfieCutoutView, facing: String? ->
                view.setFacing(facing ?: "front")
            }
            Prop("isolatePerson") { view: SelfieCutoutView, isolate: Boolean? ->
                view.setIsolatePerson(isolate == true)
            }
        }

        AsyncFunction("startRecording") { promise: Promise ->
            val view = SelfieCutoutView.active
            if (view == null) {
                promise.reject("CUTOUT_CAMERA", "Cutout camera is not open.", null)
            } else {
                view.startRecording(promise)
            }
        }

        AsyncFunction("stopRecording") {
            SelfieCutoutView.active?.stopRecording()
        }

        AsyncFunction("createPersonMask") { videoUri: String, promise: Promise ->
            scope.launch {
                try {
                    promise.resolve(createPersonMask(videoUri))
                } catch (error: Exception) {
                    Log.e(TAG, "Person cutout frames failed", error)
                    promise.reject(
                        "SELFIE_CUTOUT_FAILED",
                        error.message ?: "Could not isolate the person from this camera recording.",
                        error
                    )
                }
            }
        }

        AsyncFunction("warmUp") {
            scope.launch { warmUpModel() }
        }

        OnCreate {
            scope.launch { warmUpModel() }
        }

        OnDestroy {
            scope.cancel()
        }
    }

    private fun warmUpModel() {
        val dummy = Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888)
        val segmenter = Segmentation.getClient(
            SelfieSegmenterOptions.Builder()
                .setDetectorMode(SelfieSegmenterOptions.STREAM_MODE)
                .enableRawSizeMask()
                .build()
        )
        try {
            Tasks.await(segmenter.process(InputImage.fromBitmap(dummy, 0)), 45, TimeUnit.SECONDS)
            Log.i(TAG, "Cutout model is warm")
        } catch (error: Exception) {
            Log.w(TAG, "Cutout model warmup skipped", error)
        } finally {
            dummy.recycle()
            try { segmenter.close() } catch (_: Exception) {}
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
            val fps = if (durationMs >= 20_000L) MASK_FPS_LONG else MASK_FPS_SHORT
            val frameIntervalUs = (1_000_000.0 / fps).toLong().coerceAtLeast(40_000L)
            val lastTimeUs = if (durationMs <= 0L) 0L else durationMs * 1_000L

            val outputDir = File(context.cacheDir, "reel-reactor-cutout-${System.currentTimeMillis()}")
            if (!outputDir.mkdirs()) {
                throw IllegalStateException("Could not create a folder for the cutout frames.")
            }

            var frameIndex = 0
            var timeUs = 0L
            var lastCutout: Bitmap? = null

            while (timeUs <= lastTimeUs || frameIndex == 0) {
                val frame = getFrame(retriever, timeUs)
                if (frame != null) {
                    val scaled = PersonCutout.scaleToMax(frame, 224)
                    if (scaled !== frame) frame.recycle()
                    val working = PersonCutout.asSoftwareArgb(scaled)
                    if (working !== scaled) scaled.recycle()
                    val image = InputImage.fromBitmap(working, 0)
                    val mask = Tasks.await(segmenter.process(image), 8, TimeUnit.SECONDS)
                    val cutout = PersonCutout.applyConfidenceMask(working, mask.buffer, mask.width, mask.height)
                    if (cutout !== working) working.recycle()
                    lastCutout?.recycle()
                    lastCutout = cutout
                } else if (lastCutout == null) {
                    throw IllegalStateException("The camera recording could not be decoded for cutout.")
                }

                frameIndex += 1
                val cutoutFile = File(outputDir, "cutout_%05d.png".format(frameIndex))
                writePng(lastCutout!!, cutoutFile)

                if (lastTimeUs == 0L) break
                val nextTime = timeUs + frameIntervalUs
                timeUs = if (nextTime > lastTimeUs && timeUs < lastTimeUs) lastTimeUs else nextTime
                if (frameIndex >= MAX_FRAMES) break
            }

            if (frameIndex == 0) {
                throw IllegalStateException("Cutout did not produce any person frames.")
            }

            lastCutout?.recycle()
            return mapOf(
                "directory" to "file://${outputDir.absolutePath}",
                "pattern" to "${outputDir.absolutePath}/cutout_%05d.png",
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
        return retriever.getFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST)
    }

    private fun writePng(bitmap: Bitmap, file: File) {
        FileOutputStream(file).use { stream ->
            if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)) {
                throw IllegalStateException("Could not write a cutout frame.")
            }
        }
    }

    companion object {
        private const val TAG = "SelfieCutout"
        private const val MASK_FPS_SHORT = 18.0
        private const val MASK_FPS_LONG = 15.0
        private const val MAX_FRAMES = 1800
    }
}
