package expo.modules.selfiecutout

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Matrix
import java.nio.ByteBuffer
import java.nio.ByteOrder

internal object PersonCutout {
    fun centerCropSquare(source: Bitmap): Bitmap {
        val side = minOf(source.width, source.height).coerceAtLeast(1)
        if (source.width == side && source.height == side) return source
        val x = (source.width - side) / 2
        val y = (source.height - side) / 2
        return Bitmap.createBitmap(source, x, y, side, side)
    }

    fun rotate(source: Bitmap, degrees: Int): Bitmap {
        if (degrees % 360 == 0) return source
        val matrix = Matrix()
        matrix.postRotate(degrees.toFloat())
        return Bitmap.createBitmap(source, 0, 0, source.width, source.height, matrix, true)
    }

    fun asSoftwareArgb(source: Bitmap): Bitmap {
        if (!source.isMutable || source.config != Bitmap.Config.ARGB_8888) {
            return source.copy(Bitmap.Config.ARGB_8888, true)
                ?: throw IllegalStateException("Could not copy a camera frame for cutout.")
        }
        return source
    }

    fun applyConfidenceMask(frame: Bitmap, buffer: ByteBuffer, maskWidth: Int, maskHeight: Int): Bitmap {
        val width = frame.width.coerceAtLeast(1)
        val height = frame.height.coerceAtLeast(1)
        val safeMaskWidth = maskWidth.coerceAtLeast(1)
        val safeMaskHeight = maskHeight.coerceAtLeast(1)
        val out = if (frame.isMutable && frame.config == Bitmap.Config.ARGB_8888) {
            frame
        } else {
            frame.copy(Bitmap.Config.ARGB_8888, true) ?: frame
        }

        val pixels = IntArray(width * height)
        out.getPixels(pixels, 0, width, 0, 0, width, height)

        val ordered = buffer.duplicate()
        ordered.order(ByteOrder.nativeOrder())
        ordered.rewind()
        val maskCount = safeMaskWidth * safeMaskHeight
        val remaining = ordered.remaining()
        val confidences = FloatArray(maskCount)
        when {
            remaining >= maskCount * 4 -> {
                ordered.asFloatBuffer().get(confidences)
            }
            remaining >= maskCount -> {
                val bytes = ByteArray(maskCount)
                ordered.get(bytes)
                for (i in 0 until maskCount) {
                    confidences[i] = (bytes[i].toInt() and 0xFF) / 255f
                }
            }
        }

        var personPixels = 0
        for (y in 0 until height) {
            val maskY = (y * safeMaskHeight) / height
            val maskRow = maskY * safeMaskWidth
            val row = y * width
            for (x in 0 until width) {
                val maskX = (x * safeMaskWidth) / width
                val confidence = confidences.getOrElse(maskRow + maskX) { 0f }.coerceIn(0f, 1f)
                val color = pixels[row + x]
                val alpha = when {
                    confidence < 0.22f -> 0
                    confidence < 0.62f -> ((confidence - 0.22f) / 0.40f * 255f).toInt().coerceIn(0, 255)
                    else -> 255
                }
                if (alpha > 16) personPixels += 1
                pixels[row + x] = (alpha shl 24) or (color and 0x00FFFFFF)
            }
        }

        // If ML Kit didn't see a person, keep the original frame so the bubble is never an empty hole.
        if (personPixels < (width * height) / 80) {
            return out
        }

        out.setPixels(pixels, 0, width, 0, 0, width, height)
        return out
    }

    fun hasVisiblePerson(bitmap: Bitmap): Boolean {
        val sample = minOf(bitmap.width, bitmap.height, 64).coerceAtLeast(8)
        val stepX = (bitmap.width / sample).coerceAtLeast(1)
        val stepY = (bitmap.height / sample).coerceAtLeast(1)
        var visible = 0
        var y = 0
        while (y < bitmap.height) {
            var x = 0
            while (x < bitmap.width) {
                if (Color.alpha(bitmap.getPixel(x, y)) > 24) visible += 1
                x += stepX
            }
            y += stepY
        }
        return visible > 4
    }
}
