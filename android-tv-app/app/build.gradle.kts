plugins { id("com.android.application") }
android {
    namespace = "app.rentoplay.tv"
    compileSdk = 35
    defaultConfig {
        applicationId = "app.rentoplay.tv"
        minSdk = 23
        targetSdk = 35
        versionCode = 8
        versionName = "1.5.1"
    }
    buildTypes { release { isMinifyEnabled = false } }
}
