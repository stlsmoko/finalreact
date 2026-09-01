from pathlib import Path

kt = Path("vendor/selfie-cutout/android/src/main/java/expo/modules/selfiecutout/SelfieCutoutView.kt")
text = kt.read_text()
text = text.replace("previewView.visibility = View.GONE", "previewView.visibility = View.INVISIBLE")

old = """        val hasFrame = displayedBitmap != null && displayedBitmap?.isRecycled == false
        previewView.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        previewView.translationX = 0f
        previewView.translationY = 0f
        if (cutout && hasFrame) {
"""

new = """        previewView.translationX = 0f
        previewView.translationY = 0f
        if (cutout) {
            previewView.layoutParams = LayoutParams(1, 1)
            previewView.alpha = 0f
            previewView.visibility = View.VISIBLE
            outputView.visibility = View.VISIBLE
            outputView.bringToFront()
            setLayerType(LAYER_TYPE_SOFTWARE, null)
            previewView.requestLayout()
            outputView.requestLayout()
            return
        }
        if (false) {
"""

if old not in text:
    raise SystemExit("applyPreviewMode start not found")
text = text.replace(old, new, 1)
text = text.replace(
    """            if (!cutout) {
                outputView.setImageBitmap(null)
            }""",
    """            outputView.setImageBitmap(null)
            displayedBitmap = null
            setLayerType(LAYER_TYPE_NONE, null)""",
    1,
)
kt.write_text(text)

rec_path = Path("app/reaction-record.tsx")
rec = rec_path.read_text()
if len(rec) < 20000:
    raise SystemExit(f"recorder too small: {len(rec)}")
if "needsOffscreenAlphaCompositing" not in rec:
    rec = rec.replace(
        "                      collapsable={false}\n                      style={[styles.cameraView, overlayStyle === \"cutout\" ? styles.cutoutCamera : bubbleCustomRadiusStyle]}",
        "                      collapsable={false}\n                      needsOffscreenAlphaCompositing={overlayStyle === \"cutout\"}\n                      style={[styles.cameraView, overlayStyle === \"cutout\" ? styles.cutoutCamera : bubbleCustomRadiusStyle]}",
        1,
    )
rec_path.write_text(rec)

cfg = Path("app.config.ts")
cfg.write_text(
    cfg.read_text()
    .replace('version: "1.0.43"', 'version: "1.0.44"')
    .replace("versionCode: 44", "versionCode: 45")
)
print("patched", kt.stat().st_size, rec_path.stat().st_size)
