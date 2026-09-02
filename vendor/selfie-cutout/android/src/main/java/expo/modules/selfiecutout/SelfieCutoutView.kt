package expo.modules.selfiecutout

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.util.Size
import android.view.View
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
import java.util.concurrent.atomic.AtomicLong

class SelfieCutoutView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private val onReady by EventDispatcher()
    private val onError by EventDispatcher()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val analysisExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val analyzing = AtomicBoolean(false)
    private val readyOnce = AtomicBoolean(false)
    private val isolatePerson = AtomicBoolean(false)
    private val analyzingSince = AtomicLong(0)
    private val lastAnalyzeAt = AtomicLong(0)
    private val personOnScreen = AtomicBoolean(false)
    private val pendingShow = AtomicBoolean(false)

    private val previewView = PreviewView(context).apply {
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        scaleType = PreviewView.ScaleType.FILL_CENTER
        visibility = View.VISIBLE
    }
    private val isolatedView = IsolatedPersonView(context).apply {
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        visibility = View.GONE
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
    private var savedAudioMode: Int? = null

    init {
        setBackgroundColor(Color.TRANSPARENT)
        setWillNotDraw(false)
        clipToOutline = false
        clipChildren = false
        clipToPadding = false
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        addView(previewView)
        addView(isolatedView)
        isolatedView.scaleX = -1f
        segmenter = Segmentation.getClient(
            SelfieSegmenterOptions.Builder()
                .setDetectorMode(SelfieSegmenterOptions.STREAM_MODE)
                .enableRawSizeMask()
                .build()
        )
    }

    fun setIsolatePerson(enabled: Boolean) {
        isolatePerson.set(enabled)
        personOnScreen.set(false)
        mainHandler.post {
            isolatedView.person = null
            displayedBitmap?.let { if (!it.isRecycled) it.recycle() }
            displayedBitmap = null
            previewView.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
            previewView.alpha = 1f
            previewView.visibility = View.VISIBLE
            isolatedView.visibility = View.GONE
            applyPreviewMode()
            if (!enabled && cameraProvider != null) {
                bindAttempts = 0
                bindCamera()
            }
        }
    }

    fun setFacing(nextFacing: String) {
        val normalized = if (nextFacing == "back") "back" else "front"
        if (facing == normalized) return
        facing = normalized
        isolatedView.scaleX = if (normalized == "front") -1f else 1f
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
        personOnScreen.set(false)
        mainHandler.post {
            applyPreviewMode()
            startProvider()
        }
    }

    override fun onDetachedFromWindow() {
        if (active === this) active = null
        stopRecordingInternal(errorMessage = "Cutout camera closed.")
        restoreMediaAudio()
        cameraProvider?.unbindAll()
        isolatedView.person = null
        displayedBitmap?.let { if (!it.isRecycled) it.recycle() }
        displayedBitmap = null
        super.onDetachedFromWindow()
    }

    private fun applyPreviewMode() {
        val cutoutReady = isolatePerson.get() && personOnScreen.get() &&
            displayedBitmap != null && displayedBitmap?.isRecycled == false
        previewView.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        if (cutoutReady) {
            previewView.alpha = 0f
            isolatedView.visibility = View.VISIBLE
            isolatedView.bringToFront()
            isolatedView.invalidate()
        } else {
            previewView.alpha = 1f
            previewView.visibility = View.VISIBLE
            previewView.bringToFront()
            isolatedView.visibility = View.GONE
        }
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
            .setTargetResolution(Size(240, 240))
            .build()
            .also { useCase ->
                useCase.setAnalyzer(analysisExecutor, ::analyzeFrame)
            }
        val recorder = Recorder.Builder()
            .setQualitySelector(
                QualitySelector.fromOrderedList(
                    listOf(Quality.SD, Quality.LOWEST, Quality.HD),
                    FallbackStrategy.lowerQualityOrHigherThan(Quality.LOWEST)
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
                try {
                    provider.bindToLifecycle(lifecycleOwner, selector, preview, analysis)
                    videoCapture = capture
                    try {
                        provider.unbindAll()
                        provider.bindToLifecycle(lifecycleOwner, selector, preview, analysis, capture)
                    } catch (_: Exception) {
                        videoCapture = capture
                    }
                } catch (_: Exception) {
                    provider.unbindAll()
                    provider.bindToLifecycle(lifecycleOwner, selector, preview, analysis, capture)
                }
            }
            bindAttempts = 0
            applyPreviewMode()
            if (readyOnce.compareAndSet(false, true)) {
                onReady(mapOf("ready" to true))
            }
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
        if (!isolatePerson.get()) {
            imageProxy.close()
            return
        }
        val now = SystemClock.uptimeMillis()
        if (analyzing.get() && now - analyzingSince.get() > 700L) {
            analyzing.set(false)
        }
        if (now - lastAnalyzeAt.get() < 66L || !analyzing.compareAndSet(false, true)) {
            imageProxy.close()
            return
        }
        lastAnalyzeAt.set(now)
        analyzingSince.set(now)

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
        val scaled = PersonCutout.scaleToMax(square, 192)
        if (scaled !== square) square.recycle()
        val working = PersonCutout.asSoftwareArgb(scaled)
        if (working !== scaled) scaled.recycle()

        val client = segmenter
        if (client == null) {
            working.recycle()
            analyzing.set(false)
            return
        }
        client.process(InputImage.fromBitmap(working, 0))
            .addOnSuccessListener { mask ->
                val cutout = PersonCutout.applyConfidenceMask(working, mask.buffer, mask.width, mask.height)
                val display = if (cutout === working) {
                    cutout.copy(Bitmap.Config.ARGB_8888, false) ?: cutout
                } else {
                    cutout
                }
                if (display !== working && !working.isRecycled) working.recycle()
                if (isolatePerson.get() && PersonCutout.hasVisiblePerson(display)) {
                    showIsolatedBitmap(display)
                } else {
                    if (display !== working && !display.isRecycled) display.recycle()
                    if (!personOnScreen.get()) {
                        mainHandler.post { applyPreviewMode() }
                    }
                }
            }
            .addOnFailureListener { error ->
                if (!working.isRecycled) working.recycle()
                Log.w(TAG, "Segmentation failed", error)
            }
            .addOnCompleteListener {
                analyzing.set(false)
            }
    }

    private fun showIsolatedBitmap(display: Bitmap) {
        if (!pendingShow.compareAndSet(false, true)) {
            if (!display.isRecycled) display.recycle()
            return
        }
        mainHandler.post {
            pendingShow.set(false)
            if (display.isRecycled || !isolatePerson.get()) {
                if (!display.isRecycled) display.recycle()
                return@post
            }
            val previous = displayedBitmap
            displayedBitmap = display
            val firstFrame = !personOnScreen.get()
            personOnScreen.set(true)
            isolatedView.person = display
            if (firstFrame) applyPreviewMode() else isolatedView.invalidate()
            if (previous != null && previous !== display && !previous.isRecycled) {
                previous.recycle()
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
        prepareMediaAudio()
        try {
            val pending = capture.output
                .prepareRecording(activity, FileOutputOptions.Builder(output).build())
                .withAudioEnabled()
                .start(ContextCompat.getMainExecutor(context)) { event ->
                    if (event is VideoRecordEvent.Finalize) {
                        restoreMediaAudio()
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
            restoreMediaAudio()
            recordingPromise = null
            promise.reject("CUTOUT_RECORDING", error.message ?: "Could not start cutout recording.", error)
        }
    }

    fun stopRecording() {
        stopRecordingInternal()
    }

    private fun prepareMediaAudio() {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        savedAudioMode = audioManager.mode
        try {
            audioManager.mode = AudioManager.MODE_NORMAL
            audioManager.isMicrophoneMute = false
            audioManager.isSpeakerphoneOn = true
        } catch (_: Exception) {
        }
    }

    private fun restoreMediaAudio() {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        val previous = savedAudioMode ?: return
        try {
            audioManager.mode = previous
        } catch (_: Exception) {
        }
        savedAudioMode = null
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

private class IsolatedPersonView(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val dest = RectF()

    var person: Bitmap? = null
        set(value) {
            field = value
            invalidate()
        }

    init {
        setWillNotDraw(false)
        setBackgroundColor(Color.TRANSPARENT)
        setLayerType(LAYER_TYPE_SOFTWARE, null)
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    override fun hasOverlappingRendering(): Boolean = false

    override fun onDraw(canvas: Canvas) {
        val bmp = person ?: return
        if (bmp.isRecycled || width <= 0 || height <= 0) return
        val viewW = width.toFloat()
        val viewH = height.toFloat()
        val bitmapW = bmp.width.toFloat().coerceAtLeast(1f)
        val bitmapH = bmp.height.toFloat().coerceAtLeast(1f)
        val scale = maxOf(viewW / bitmapW, viewH / bitmapH)
        val drawW = bitmapW * scale
        val drawH = bitmapH * scale
        dest.set(
            (viewW - drawW) / 2f,
            (viewH - drawH) / 2f,
            (viewW + drawW) / 2f,
            (viewH + drawH) / 2f
        )
        canvas.drawBitmap(bmp, null, dest, paint)
    }
}
