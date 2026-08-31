package expo.modules.selfiecutout

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Matrix
import java.nio.ByteBuffer

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
        if (source.config == Bitmap.Config.ARGB_8888) return source
        return source.copy(Bitmap.Config.ARGB_8888, true)
            ?: throw IllegalStateException("Could not copy a camera frame for cutout.")
    }

    fun applyConfidenceMask(frame: Bitmap, buffer: ByteBuffer, maskWidth: Int, maskHeight: Int): Bitmap {
        val width = frame.width
        val height = frame.height
        val out = if (frame.isMutable && frame.config == Bitmap.Config.ARGB_8888) {
            frame
        } else {
            frame.copy(Bitmap.Config.ARGB_8888, true) ?: frame
        }
        val pixels = IntArray(width * height)
        out.getPixels(pixels, 0, width, 0, 0, width, height)
        buffer.rewind()
        val maskBytes = ByteArray(maskWidth * maskHeight)
        buffer.get(maskBytes)

        for (y in 0 until height) {
            val maskY = y * maskHeight / height
            val maskRow = maskY * maskWidth
            val row = y * width
            for (x in 0 until width) {
                val maskX = x * maskWidth / width
                val confidence = maskBytes[maskRow + maskX].toInt() and 0xFF
                if (confidence < 28) {
                    pixels[row + x] = Color.TRANSPARENT
                } else if (confidence < 250) {
                    val color = pixels[row + x]
                    val alpha = (confidence * (color ushr 24 and 0xFF)) / 255
                    pixels[row + x] = (alpha shl 24) or (color and 0x00FFFFFF)
                }
            }
        }
        out.setPixels(pixels, 0, width, 0, 0, width, height)
        return out
    }
}
