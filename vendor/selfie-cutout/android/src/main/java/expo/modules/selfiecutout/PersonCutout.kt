package expo.modules.selfiecutout

import android.graphics.Bitmap
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

        val ordered = buffer.duplicate().order(ByteOrder.nativeOrder())
        ordered.rewind()
        val maskCount = safeMaskWidth * safeMaskHeight
        val remaining = ordered.remaining()
        val floatMask = remaining >= maskCount * 4
        val byteMask = if (floatMask) null else ByteArray(maskCount.coerceAtMost(remaining))
        byteMask?.let { ordered.get(it) }

        for (y in 0 until height) {
            val maskY = (y * safeMaskHeight) / height
            val maskRow = maskY * safeMaskWidth
            val row = y * width
            for (x in 0 until width) {
                val maskX = (x * safeMaskWidth) / width
                val index = maskRow + maskX
                val confidence = if (floatMask) {
                    ordered.getFloat(index * 4).coerceIn(0f, 1f)
                } else {
                    val raw = byteMask?.getOrNull(index)?.toInt()?.and(0xFF) ?: 0
                    raw / 255f
                }
                val color = pixels[row + x]
                val alpha = when {
                    confidence < 0.28f -> 0
                    confidence < 0.72f -> (confidence * 255f).toInt().coerceIn(0, 255)
                    else -> 255
                }
                pixels[row + x] = (alpha shl 24) or (color and 0x00FFFFFF)
            }
        }
        out.setPixels(pixels, 0, width, 0, 0, width, height)
        return out
    }
}
