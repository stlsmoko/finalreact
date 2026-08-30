const { withGradleProperties } = require("@expo/config-plugins");

/**
 * The custom compositor is a classic React Native module and does not need
 * Fabric/TurboModules. Keeping this false reduces the native build surface
 * and avoids compiling an unused architecture path in cloud APK builds.
 */
module.exports = function withLegacyAndroidArchitecture(config) {
  return withGradleProperties(config, (androidConfig) => {
    const properties = {
      newArchEnabled: "false",
      "org.gradle.parallel": "false",
      "org.gradle.workers.max": "1",
      "kotlin.incremental": "false",
    };

    for (const [key, value] of Object.entries(properties)) {
      const existing = androidConfig.modResults.find(
        (item) => item.type === "property" && item.key === key,
      );

      if (existing) {
        existing.value = value;
      } else {
        androidConfig.modResults.push({ type: "property", key, value });
      }
    }

    return androidConfig;
  });
};
