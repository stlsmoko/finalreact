const { requireNativeModule, requireNativeViewManager } = require("expo-modules-core");

let native = null;
try {
  native = requireNativeModule("SelfieCutout");
} catch (_error) {
  native = null;
}

let NativeView = null;
try {
  NativeView = requireNativeViewManager("SelfieCutout");
} catch (_error) {
  NativeView = null;
}

async function createPersonMask(videoUri) {
  if (!native || typeof native.createPersonMask !== "function") {
    throw new Error("Cutout engine is unavailable on this device.");
  }
  return native.createPersonMask(videoUri);
}

async function startRecording() {
  if (!native || typeof native.startRecording !== "function") {
    throw new Error("Cutout camera is unavailable on this device.");
  }
  return native.startRecording();
}

async function stopRecording() {
  if (!native || typeof native.stopRecording !== "function") {
    return;
  }
  return native.stopRecording();
}

async function warmUp() {
  if (!native || typeof native.warmUp !== "function") {
    return;
  }
  return native.warmUp();
}

const SelfieCutoutView = NativeView;

module.exports = {
  createPersonMask,
  startRecording,
  stopRecording,
  warmUp,
  SelfieCutoutView,
  default: {
    createPersonMask,
    startRecording,
    stopRecording,
    warmUp,
    SelfieCutoutView,
  },
};
