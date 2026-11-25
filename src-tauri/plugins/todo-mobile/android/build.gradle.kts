import org.jetbrains.kotlin.gradle.dsl.JvmTarget
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "com.weepwood.todo.mobile"
    compileSdk = 36
    defaultConfig { minSdk = 26; consumerProguardFiles("consumer-rules.pro") }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
}
kotlin { compilerOptions { jvmTarget = JvmTarget.JVM_1_8 } }
dependencies {
    implementation(project(":tauri-android"))
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.work:work-runtime:2.10.1")
}
