// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

const rawBundleId = "com.app.reelreactor";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".")
    .replace(/[^a-zA-Z0-9.]/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase()
    .split(".")
    .map((segment) => {
      return /^[a-zA-Z]/.test(segment) ? segment : "x" + segment;
    })
    .join(".") || "space.manus.app";
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;
const isSideBySideDebugBuild = process.env.REEL_REACTOR_SIDE_BY_SIDE === "1";
const androidPackage = isSideBySideDebugBuild ? `${bundleId}.test` : bundleId;

const env = {
  appName: isSideBySideDebugBuild ? "Reel Reactor Test" : "Reel Reactor",
  appSlug: "reel-reactor",
  logoUrl: "/manus-storage/reel-reactor-icon_4113e11e.png",
  scheme: isSideBySideDebugBuild ? `${schemeFromBundleId}test` : schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.57",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#0C1018",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    package: androidPackage,
    versionCode: 58,
    permissions: ["POST_NOTIFICATIONS"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-asset",
    "expo-font",
    "expo-image",
    "expo-secure-store",
    "expo-sharing",
    "expo-status-bar",
    "expo-web-browser",
    "ffmpeg-expo",
    "selfie-cutout",
    "./plugins/with-legacy-android-architecture",
    "./plugins/with-ytdlp-native-extraction",
    [
      "expo-share-intent",
      {
        disableIOS: true,
        androidIntentFilters: ["text/plain", "text/*", "video/*"],
        androidMultiIntentFilters: ["video/*"],
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission: "Allow $(PRODUCT_NAME) to use your camera for reaction videos.",
        microphonePermission: "Allow $(PRODUCT_NAME) to use your microphone for reaction videos.",
        recordAudioAndroid: true,
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "Allow $(PRODUCT_NAME) to choose a source video for your reaction.",
      },
    ],
    [
      "expo-media-library",
      {
        photosPermission: "Allow $(PRODUCT_NAME) to access your videos.",
        savePhotosPermission: "Allow $(PRODUCT_NAME) to save your reaction takes.",
        granularPermissions: ["video"],
      },
    ],
    [
      "expo-audio",
      {
        microphonePermission: "Allow $(PRODUCT_NAME) to access your microphone.",
      },
    ],
    [
      "expo-video",
      {
        supportsBackgroundPlayback: true,
        supportsPictureInPicture: true,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#0C1018",
        dark: {
          backgroundColor: "#0C1018",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["arm64-v8a"],
          minSdkVersion: 24,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
