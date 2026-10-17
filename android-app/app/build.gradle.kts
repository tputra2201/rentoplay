plugins {
    id("com.android.application")
}

android {
    namespace = "app.lovable.cosmorentpro"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.lovable.cosmorentpro"
        minSdk = 23
        targetSdk = 35
        versionCode = 6
        versionName = "1.4.1"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}