import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

val localProperties = Properties().apply {
    val localFile = rootProject.file("local.properties")
    if (localFile.isFile) {
        localFile.inputStream().use(::load)
    }
}

fun String.asBuildConfigString(): String = replace("\\", "\\\\").replace("\"", "\\\"")

android {
    namespace = "com.resqnet.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.resqnet.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "3.4.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        val backendUrl = providers.gradleProperty("RESQNET_BACKEND_URL")
            .orElse(providers.environmentVariable("RESQNET_BACKEND_URL"))
            .orElse("https://resqnet-backend-pyqc.onrender.com/")
            .get()
            .let { if (it.endsWith('/')) it else "$it/" }
        // Kept out of source control: local.properties is ignored by Git.
        val emergencyApiKey = localProperties.getProperty("RESQNET_API_KEY")
            ?: providers.environmentVariable("RESQNET_API_KEY").orNull
            ?: ""
        buildConfigField("String", "DEFAULT_BACKEND_URL", "\"$backendUrl\"")
        buildConfigField("String", "DEFAULT_SOCKET_URL", "\"${backendUrl.removeSuffix("/")}\"")
        buildConfigField("String", "RESQNET_API_KEY", "\"${emergencyApiKey.asBuildConfigString()}\"")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation("androidx.compose.material:material-icons-extended:1.7.0")

    // Play Services Location & Fused Location Provider
    implementation("com.google.android.gms:play-services-location:21.3.0")

    // Retrofit2 REST Networking & Gson
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Coroutines & Lifecycle
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")

    // Testing
    testImplementation(libs.junit)
}
