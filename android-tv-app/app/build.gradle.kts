plugins { id("com.android.application") }
android {
    namespace = "app.rentoplay.tv"
    compileSdk = 35
    defaultConfig {
        applicationId = "app.rentoplay.tv"
        minSdk = 23
        targetSdk = 35
        versionCode = 9
        versionName = "1.6.0"
    }
    buildTypes { release { isMinifyEnabled = false } }
}
