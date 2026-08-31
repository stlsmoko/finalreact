const { requireNativeModule } = require("expo-modules-core");

const native = requireNativeModule("SelfieCutout");

async function createPersonMask(videoUri) {
  return native.createPersonMask(videoUri);
}

module.exports = {
  createPersonMask,
  default: {
    createPersonMask,
  },
};
