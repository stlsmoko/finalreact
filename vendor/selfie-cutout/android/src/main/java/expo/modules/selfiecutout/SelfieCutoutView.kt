package expo.modules.selfiecutout

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.Size
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.Segmenter
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class SelfieCutoutView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private val onReady by EventDispatcher()
    private val onError by EventDispatcher()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val analysisExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val analyzing = AtomicBoolean(false)
    private val readyOnce = AtomicBoolean(false)

    // Keep a live 1px TextureView so CameraX always has a surface. Hidden off the overlay.
    private val previewView = PreviewView(context).apply {
        layoutParams = FrameLayout.LayoutParams(2, 2, Gravity.TOP or Gravity.START)
        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        scaleType = PreviewView.ScaleType.FILL_CENTER
        visibility = View.VISIBLE
        alpha = 0.01f
        translationX = -8f
        translationY = -8f
    }
    private val outputView = ImageView(context).apply {
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        scaleType = ImageView.ScaleType.CENTER_CROP
        setBackgroundColor(Color.TRANSPARENT)
        setLayerType(LAYER_TYPE_SOFTWARE, null)
        adjustViewBounds = false
    }

    private var cameraProvider: ProcessCameraProvider? = null
    private var videoCapture: VideoCapture<Recorder>? = null
    private var recording: Recording? = null
    private var recordingPromise: Promise? = null
    private var recordingFile: File? = null
    private var segmenter: Segmenter? = null
    private var facing = "front"
    private var bindAttempts = 0
    private var displayedBitmap: Bitmap? = null

    init {
        setBackgroundColor(Color.TRANSPARENT)
        setLayerType(LAYER_TYPE_SOFTWARE, null)
        clipToOutline = false
        clipChildren = false
        clipToPadding = false
        setWillNotDraw(false)
        addView(previewView)
        addView(outputView)
        outputView.scaleX = -1f
        segmenter = Segmentation.getClient(
            SelfieSegmenterOptions.Builder()
                .setDetectorMode(SelfieSegmenterOptions.STREAM_MODE)
                .enableRawSizeMask()
                .build()
        )
    }

    fun setFacing(nextFacing: String) {
        val normalized = if (nextFacing == "back") "back" else "front"
        if (facing == normalized) return
        facing = normalized
        outputView.scaleX = if (normalized == "front") -1f else 1f
        if (isAttachedToWindow) {
            bindAttempts = 0
            bindCamera()
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        active = this
        bindAttempts = 0
        readyOnce.set(false)
        mainHandler.postDelayed({ startProvider() }, 80)
    }

    override fun onDetachedFromWindow() {
        if (active === this) active = null
        stopRecordingInternal(errorMessage = "Cutout camera closed.")
        cameraProvider?.unbindAll()
        super.onDetachedFromWindow()
    }

    private fun startProvider() {
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            try {
                cameraProvider = future.get()
                bindCamera()
            } catch (error: Exception) {
                Log.e(TAG, "Camera provider failed", error)
                onError(mapOf("message" to (error.message ?: "Cutout camera failed to open.")))
            }
        }, ContextCompat.getMainExecutor(context))
    }

    private fun bindCamera() {
        val provider = cameraProvider ?: return
        val lifecycleOwner = appContext.currentActivity as? LifecycleOwner ?: return
        val selector = if (facing == "back") {
            CameraSelector.DEFAULT_BACK_CAMERA
        } else {
            CameraSelector.DEFAULT_FRONT_CAMERA
        }
        val preview = Preview.Builder().build().also { previewUseCase ->
            previewUseCase.surfaceProvider = previewView.surfaceProvider
        }
        val analysis = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
            .setTargetResolution(Size(360, 480))
            .build()
            .also { useCase ->
                useCase.setAnalyzer(analysisExecutor, ::analyzeFrame)
            }
        val recorder = Recorder.Builder()
            .setQualitySelector(
                QualitySelector.fromOrderedList(
                    listOf(Quality.HD, Quality.SD, Quality.LOWEST),
                    FallbackStrategy.lowerQualityOrHigherThan(Quality.SD)
                )
            )
            .build()
        val capture = VideoCapture.withOutput(recorder)
        videoCapture = capture

        try {
            provider.unbindAll()
            try {
                provider.bindToLifecycle(lifecycleOwner, selector, preview, analysis, capture)
            } catch (_: Exception) {
                provider.unbindAll()
                provider.bindToLifecycle(lifecycleOwner, selector, preview, analysis)
                videoCapture = capture
                try {
                    provider.unbindAll()
                    provider.bindToLifecycle(lifecycleOwner, selector, preview, analysis, capture)
                } catch (_: Exception) {
                    provider.unbindAll()
                    provider.bindToLifecycle(lifecycleOwner, selector, analysis, capture)
                }
            }
            bindAttempts = 0
        } catch (error: Exception) {
            Log.w(TAG, "Bind failed, retrying", error)
            if (bindAttempts < 6) {
                bindAttempts += 1
                mainHandler.postDelayed({ bindCamera() }, 350L * bindAttempts)
            } else {
                onError(mapOf("message" to (error.message ?: "Could not open the cutout camera.")))
            }
        }
    }

    private fun analyzeFrame(imageProxy: ImageProxy) {
        if (!analyzing.compareAndSet(false, true)) {
            imageProxy.close()
            return
        }
        val rotation = imageProxy.imageInfo.rotationDegrees
        val raw = try {
            imageProxy.toBitmap()
        } catch (error: Exception) {
            analyzing.set(false)
            imageProxy.close()
            Log.w(TAG, "Frame convert failed", error)
            return
        }
        imageProxy.close()
        val bitmap = PersonCutout.rotate(raw, rotation)
        if (bitmap !== raw) raw.recycle()

        val square = PersonCutout.centerCropSquare(bitmap)
        if (square !== bitmap) bitmap.recycle()
        val working = PersonCutout.asSoftwareArgb(square)
        if (working !== square) square.recycle()
        val image = InputImage.fromBitmap(working, 0)
        val client = segmenter
        if (client == null) {
            showBitmap(working)
            analyzing.set(false)
            return
        }
        client.process(image)
            .addOnSuccessListener { mask ->
                val cutout = PersonCutout.applyConfidenceMask(working, mask.buffer, mask.width, mask.height)
                val display = if (cutout === working) {
                    cutout.copy(Bitmap.Config.ARGB_8888, false) ?: cutout
                } else {
                    cutout
                }
                if (cutout !== working) working.recycle()
                else if (display !== cutout) working.recycle()
                showBitmap(display)
            }
            .addOnFailureListener { error ->
                showBitmap(working)
                Log.w(TAG, "Segmentation failed", error)
            }
            .addOnCompleteListener {
                analyzing.set(false)
            }
    }

    private fun showBitmap(display: Bitmap) {
        mainHandler.post {
            val previous = displayedBitmap
            displayedBitmap = display
            outputView.setImageBitmap(display)
            outputView.invalidate()
            if (previous != null && previous !== display && !previous.isRecycled) previous.recycle()
            if (readyOnce.compareAndSet(false, true)) {
                onReady(mapOf("ready" to true))
            }
        }
    }

    @SuppressLint("MissingPermission")
    fun startRecording(promise: Promise) {
        if (recording != null) {
            promise.reject("CUTOUT_RECORDING", "Cutout is already recording.", null)
            return
        }
        val capture = videoCapture
        val activity = appContext.currentActivity
        if (capture == null || activity == null) {
            promise.reject("CUTOUT_CAMERA", "Cutout camera is still opening.", null)
            return
        }
        val output = File(activity.cacheDir, "reel-reactor-cutout-${System.currentTimeMillis()}.mp4")
        recordingFile = output
        recordingPromise = promise
        try {
            val pending = capture.output
                .prepareRecording(activity, FileOutputOptions.Builder(output).build())
                .withAudioEnabled()
                .start(ContextCompat.getMainExecutor(context)) { event ->
                    if (event is VideoRecordEvent.Finalize) {
                        val pendingPromise = recordingPromise
                        recordingPromise = null
                        recording = null
                        if (event.hasError() || !output.exists() || output.length() < 1_024L) {
                            pendingPromise?.reject(
                                "CUTOUT_RECORDING",
                                event.cause?.message ?: "Cutout recording did not produce a video.",
                                event.cause
                            )
                        } else {
                            pendingPromise?.resolve(
                                mapOf(
                                    "uri" to "file://${output.absolutePath}",
                                    "fileName" to output.name,
                                    "size" to output.length()
                                )
                            )
                        }
                    }
                }
            recording = pending
        } catch (error: Exception) {
            recordingPromise = null
            promise.reject("CUTOUT_RECORDING", error.message ?: "Could not start cutout recording.", error)
        }
    }

    fun stopRecording() {
        stopRecordingInternal()
    }

    private fun stopRecordingInternal(errorMessage: String? = null) {
        val activeRecording = recording
        if (activeRecording == null) {
            if (errorMessage != null) {
                recordingPromise?.reject("CUTOUT_RECORDING", errorMessage, null)
                recordingPromise = null
            }
            return
        }
        try {
            activeRecording.stop()
        } catch (error: Exception) {
            recordingPromise?.reject("CUTOUT_RECORDING", error.message ?: errorMessage, error)
            recordingPromise = null
            recording = null
        }
    }

    companion object {
        private const val TAG = "SelfieCutoutView"

        @Volatile
        var active: SelfieCutoutView? = null
    }
}
