import java.io.FileInputStream
import java.util.Properties
import com.android.build.OutputFile
import com.android.build.gradle.api.ApkVariantOutput
import org.gradle.api.GradleException

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val frontendVersionName = run {
    val packageJson = project.file("src/main/assets/app/package.json")
    if (!packageJson.exists()) {
        throw GradleException("Missing frontend package.json at ${packageJson.path}")
    }

    val versionRegex = Regex("\"version\"\\s*:\\s*\"([^\"]+)\"")
    val match = versionRegex.find(packageJson.readText())
        ?: throw GradleException("Unable to determine version from ${packageJson.path}")

    match.groupValues[1]
}

android {
    namespace = "com.fitnessmomentum"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.fitnessmomentum"
        minSdk = 24
        targetSdk = 34
        versionCode = 10504
        versionName = frontendVersionName
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        create("release") {
            val keystorePropertiesFile = rootProject.file("keystore.properties")
            if (keystorePropertiesFile.exists()) {
                val props = Properties()
                props.load(FileInputStream(keystorePropertiesFile))
                
                storeFile = rootProject.file(props.getProperty("storeFile"))
                storePassword = props.getProperty("storePassword")
                keyAlias = props.getProperty("keyAlias")
                keyPassword = props.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            val releaseSigning = signingConfigs.getByName("release")
            if (releaseSigning.storeFile != null) {
                signingConfig = releaseSigning
            }
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    
    kotlinOptions {
        jvmTarget = "1.8"
    }

    applicationVariants.all {
        if (buildType.name != "release") return@all

        val flavorSegment = flavorName
            ?.takeIf { it.isNotBlank() }
            ?.let { "$it-" }
            ?: ""

        val appSlug = "fitness-momentum"

        outputs
            .filterIsInstance<ApkVariantOutput>()
            .forEach { output ->
                val abiFilter = output.filters
                    .find { it.filterType == OutputFile.ABI }
                    ?.identifier
                    ?: "universal"

                output.outputFileName =
                    "${appSlug}-${flavorSegment}${buildType.name}-${abiFilter}.apk"
            }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.webkit:webkit:1.8.0")
    
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    androidTestImplementation("androidx.test:runner:1.5.2")
    androidTestImplementation("androidx.test:rules:1.5.0")
}

tasks.register<Exec>("buildFrontend") {
    group = "build"
    description = "Builds the Svelte frontend assets"
    
    workingDir = file("src/main/assets/app")
    
    val isWindows = System.getProperty("os.name").toLowerCase().contains("windows")
    val npmCmd = if (isWindows) "npm.cmd" else "npm"
    
    commandLine(npmCmd, "run", "build:android")
    
    inputs.files(fileTree("src/main/assets/app/src"))
    inputs.file("src/main/assets/app/package.json")
    inputs.file("src/main/assets/app/package-lock.json")
    inputs.file("src/main/assets/app/vite.config.ts")
    inputs.file("src/main/assets/app/tsconfig.json")
    inputs.file("src/main/assets/app/svelte.config.js")
    inputs.file("src/main/assets/app/index.html")
    
    outputs.dir("src/main/assets/www")
}

tasks.named("preBuild") {
    dependsOn("buildFrontend")
}

