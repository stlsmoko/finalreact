const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * youtubedl-android runs an embedded Python/yt-dlp executable. Android must
 * extract the bundled native libraries for that executable to be callable.
 */
module.exports = function withYtDlpNativeExtraction(config) {
  return withAndroidManifest(config, (androidConfig) => {
    const application = androidConfig.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error("Android application manifest was not available for the on-device public-link importer.");
    }
    application.$ = application.$ ?? {};
    application.$["android:extractNativeLibs"] = "true";
    return androidConfig;
  });
};
