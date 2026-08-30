import expo.modules.plugin.gradle.ExpoModuleExtension

plugins {
    id("com.android.library")
    id("expo-module-gradle-plugin")
}

group = "expo.modules.reelimporter"
version = "0.1.0"

extensions.configure<ExpoModuleExtension>("expoModule") {
    canBePublished = false
}

android {
    namespace = "expo.modules.reelimporter"
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
    implementation("io.github.junkfood02.youtubedl-android:library:0.18.1")
}
