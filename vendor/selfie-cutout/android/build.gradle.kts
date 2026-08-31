import expo.modules.plugin.gradle.ExpoModuleExtension

plugins {
    id("com.android.library")
    id("expo-module-gradle-plugin")
}

group = "expo.modules.selfiecutout"
version = "0.1.0"

extensions.configure<ExpoModuleExtension>("expoModule") {
    canBePublished = false
}

android {
    namespace = "expo.modules.selfiecutout"
    defaultConfig {
        minSdk = 24
        ndk {
            abiFilters.clear()
            abiFilters += "arm64-v8a"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("com.google.mlkit:segmentation-selfie:16.0.0-beta6")
    implementation("androidx.camera:camera-core:1.4.2")
    implementation("androidx.camera:camera-camera2:1.4.2")
    implementation("androidx.camera:camera-lifecycle:1.4.2")
    implementation("androidx.camera:camera-video:1.4.2")
    implementation("androidx.camera:camera-view:1.4.2")
    implementation("androidx.core:core-ktx:1.13.1")
}
