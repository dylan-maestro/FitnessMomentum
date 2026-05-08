package com.fitnessmomentum

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.updatePadding
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import org.json.JSONTokener
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import kotlin.math.roundToInt

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var webViewContainer: FrameLayout
    private lateinit var assetLoader: WebViewAssetLoader
    private var latestSystemBarInsets = Insets.NONE
    private var legacyStorageMigrationInProgress = false
    private var pendingLegacyStorageJson: String? = null

    // Import logic
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    
    private val fileChooserLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val data = result.data
            // WebChromeClient.FileChooserParams.parseResult works for normal file picking
            val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, data)
            fileChooserCallback?.onReceiveValue(uris)
        } else {
            fileChooserCallback?.onReceiveValue(null)
        }
        fileChooserCallback = null
    }

    // Export logic
    private var pendingBackupData: String? = null

    private val saveFileLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            result.data?.data?.let { uri ->
                writeBackupData(uri)
            }
        }
        // We do not clear pendingBackupData here if cancelled, 
        // effectively abandoning it unless we want to clear it explicitly.
        // But for safety, we could clear it or leave it to be overwritten next time.
        // It's just a string, so memory impact is minimal.
    }

    private val openBackupLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val uri = result.data?.data
            if (uri == null) {
                dispatchImportError("No file selected")
                return@registerForActivityResult
            }
            readBackupData(uri)
        }
    }

    private val notificationPermissionLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        dispatchNotificationPermissionResult(if (granted) "granted" else "denied")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        webView = WebView(this)
        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        webView.setBackgroundColor(Color.parseColor("#F5F5F5"))
        legacyStorageMigrationInProgress = shouldRunLegacyStorageMigration()
        if (legacyStorageMigrationInProgress) {
            webView.alpha = 0f
        }
        configureSystemBarInsets()
        configureWebView()
        configureBackNavigation()

        webViewContainer = FrameLayout(this)
        webViewContainer.addView(
            webView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        )
        setContentView(webViewContainer)
        installKeyboardResizeCallback()
        ViewCompat.requestApplyInsets(webViewContainer)
        ReminderScheduler.scheduleFromStored(this)
        
        webView.loadUrl(if (legacyStorageMigrationInProgress) LEGACY_APP_URL else APP_URL)
    }

    private fun configureSystemBarInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
            latestSystemBarInsets = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            applySystemBarInsetsToPage()
            insets
        }
    }

    private fun applySystemBarInsetsToPage() {
        val insets = latestSystemBarInsets
        val density = resources.displayMetrics.density
        val top = (insets.top / density).roundToInt()
        val right = (insets.right / density).roundToInt()
        val bottom = (insets.bottom / density).roundToInt()
        val left = (insets.left / density).roundToInt()

        webView.evaluateJavascript(
            """
            (() => {
              const root = document.documentElement;
              if (!root) return;
              root.style.setProperty('--android-safe-area-top', '${top}px');
              root.style.setProperty('--android-safe-area-right', '${right}px');
              root.style.setProperty('--android-safe-area-bottom', '${bottom}px');
              root.style.setProperty('--android-safe-area-left', '${left}px');
            })();
            """.trimIndent(),
            null
        )
    }

    /**
     * Physically resizes the WebView container in sync with the keyboard animation.
     * This is the only reliable approach on Android 15+ (edge-to-edge forced, adjustResize
     * has no effect). Shrinking the container changes window.innerHeight inside the WebView,
     * so fixed/flex layouts reflow naturally above the keyboard — identical to PWA behaviour.
     */
    private fun installKeyboardResizeCallback() {
        ViewCompat.setWindowInsetsAnimationCallback(
            webViewContainer,
            object : WindowInsetsAnimationCompat.Callback(DISPATCH_MODE_STOP) {
                override fun onProgress(
                    insets: WindowInsetsCompat,
                    runningAnimations: MutableList<WindowInsetsAnimationCompat>
                ): WindowInsetsCompat {
                    applyKeyboardPadding(insets)
                    return insets
                }

                override fun onEnd(animation: WindowInsetsAnimationCompat) {
                    super.onEnd(animation)
                    ViewCompat.getRootWindowInsets(webViewContainer)
                        ?.let { applyKeyboardPadding(it) }
                }
            }
        )
    }

    private fun applyKeyboardPadding(insets: WindowInsetsCompat) {
        val imeInsets = insets.getInsets(WindowInsetsCompat.Type.ime())
        val navInsets = insets.getInsets(WindowInsetsCompat.Type.navigationBars())
        // Subtract nav bar so it isn't double-counted with the CSS safe-area var inside the page.
        val keyboardPadding = maxOf(0, imeInsets.bottom - navInsets.bottom)
        webViewContainer.updatePadding(bottom = keyboardPadding)
    }

    private fun configureWebView() {
        val settings = webView.settings
        
        // Enable JavaScript
        settings.javaScriptEnabled = true
        
        // Enable DOM storage for localStorage
        settings.domStorageEnabled = true
        
        setLegacyFileAccessEnabled(legacyStorageMigrationInProgress)
        
        // Set user agent (optional)
        settings.userAgentString = settings.userAgentString + " FitnessMomentum/1.0"
        
        // Add Javascript Interface
        webView.addJavascriptInterface(WebAppInterface(this), "Android")

        // Serve bundled assets from a scoped HTTPS origin and block navigation away from it.
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                when {
                    url == LEGACY_APP_URL -> migrateLegacyStorageFromFileOrigin()
                    url?.startsWith(APP_URL_PREFIX) == true -> {
                        applySystemBarInsetsToPage()
                        migrateLegacyStorageToAssetOrigin()
                    }
                    else -> applySystemBarInsetsToPage()
                }
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url ?: return true
                return !isAllowedWebViewUrl(url)
            }

            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val url = request?.url ?: return null
                return assetLoader.shouldInterceptRequest(url)
            }
        }
        
        // Handle console logs and errors + File Chooser
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: android.webkit.ConsoleMessage?): Boolean {
                android.util.Log.d("WebView", "${consoleMessage?.message()} -- From line ${consoleMessage?.lineNumber()} of ${consoleMessage?.sourceId()}")
                return true
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                // Cancel any pending callback
                if (fileChooserCallback != null) {
                    fileChooserCallback?.onReceiveValue(null)
                }
                fileChooserCallback = filePathCallback

                val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                }
                
                try {
                    fileChooserLauncher.launch(intent)
                    return true
                } catch (e: Exception) {
                    fileChooserCallback = null
                    return false
                }
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun setLegacyFileAccessEnabled(enabled: Boolean) {
        val settings = webView.settings
        settings.allowFileAccess = enabled
        settings.allowContentAccess = enabled
        settings.allowFileAccessFromFileURLs = enabled
        settings.allowUniversalAccessFromFileURLs = enabled
    }

    private fun isAllowedWebViewUrl(url: Uri): Boolean {
        if (url.host == ASSET_HOST) {
            return true
        }

        return legacyStorageMigrationInProgress && url.toString().startsWith(LEGACY_APP_URL_PREFIX)
    }

    private fun shouldRunLegacyStorageMigration(): Boolean {
        return !getPreferences(Context.MODE_PRIVATE).getBoolean(PREF_LEGACY_STORAGE_MIGRATED, false)
    }

    private fun markLegacyStorageMigrationComplete() {
        getPreferences(Context.MODE_PRIVATE)
            .edit()
            .putBoolean(PREF_LEGACY_STORAGE_MIGRATED, true)
            .apply()
    }

    private fun migrateLegacyStorageFromFileOrigin() {
        webView.evaluateJavascript(
            """
            (() => {
              const data = {};
              for (let i = 0; i < window.localStorage.length; i += 1) {
                const key = window.localStorage.key(i);
                if (key !== null) {
                  data[key] = window.localStorage.getItem(key);
                }
              }
              return JSON.stringify(data);
            })();
            """.trimIndent()
        ) { result ->
            pendingLegacyStorageJson = decodeJavascriptStringResult(result).takeIf { legacyJson ->
                runCatching { JSONObject(legacyJson).length() > 0 }.getOrDefault(false)
            }
            setLegacyFileAccessEnabled(false)
            webView.loadUrl(APP_URL)
        }
    }

    private fun decodeJavascriptStringResult(result: String?): String {
        if (result.isNullOrBlank() || result == "null") {
            return "{}"
        }

        return runCatching {
            JSONTokener(result).nextValue() as? String
        }.getOrNull() ?: "{}"
    }

    private fun migrateLegacyStorageToAssetOrigin() {
        val legacyStorageJson = pendingLegacyStorageJson
        if (legacyStorageJson == null) {
            finishLegacyStorageMigration()
            return
        }

        pendingLegacyStorageJson = null
        val escaped = JSONObject.quote(legacyStorageJson)
        webView.evaluateJavascript(
            """
            (() => {
              const incoming = JSON.parse($escaped);
              let imported = 0;
              for (const key of Object.keys(incoming)) {
                const value = incoming[key];
                if (typeof value === 'string' && window.localStorage.getItem(key) === null) {
                  window.localStorage.setItem(key, value);
                  imported += 1;
                }
              }
              return imported;
            })();
            """.trimIndent()
        ) {
            markLegacyStorageMigrationComplete()
            legacyStorageMigrationInProgress = false
            webView.reload()
        }
    }

    private fun finishLegacyStorageMigration() {
        if (legacyStorageMigrationInProgress) {
            markLegacyStorageMigrationComplete()
            legacyStorageMigrationInProgress = false
        }
        webView.alpha = 1f
    }

    private fun writeBackupData(uri: Uri) {
        try {
            pendingBackupData?.let { data ->
                contentResolver.openOutputStream(uri)?.use { outputStream ->
                    OutputStreamWriter(outputStream).use { writer ->
                        writer.write(data)
                    }
                }
                Toast.makeText(this, "Backup saved successfully", Toast.LENGTH_SHORT).show()
            }
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(this, "Failed to save backup: ${e.message}", Toast.LENGTH_LONG).show()
        }
        pendingBackupData = null
    }

    private fun readBackupData(uri: Uri) {
        try {
            val text = contentResolver.openInputStream(uri)?.use { input ->
                BufferedReader(InputStreamReader(input)).use { reader ->
                    reader.readText()
                }
            }

            if (text.isNullOrBlank()) {
                dispatchImportError("Selected file is empty")
                return
            }

            dispatchImportData(text)
        } catch (e: Exception) {
            e.printStackTrace()
            dispatchImportError("Failed to read file: ${e.message}")
        }
    }

    private fun dispatchImportData(json: String) {
        val escaped = JSONObject.quote(json)
        runOnUiThread {
            webView.evaluateJavascript("window.__onAndroidBackupImported?.($escaped);", null)
        }
    }

    private fun dispatchImportError(message: String) {
        val escaped = JSONObject.quote(message)
        runOnUiThread {
            webView.evaluateJavascript("window.__onAndroidBackupImportError?.($escaped);", null)
        }
    }

    private fun dispatchNotificationPermissionResult(state: String) {
        val escaped = JSONObject.quote(state)
        runOnUiThread {
            webView.evaluateJavascript("window.__onAndroidNotificationPermissionResult?.($escaped);", null)
        }
    }

    private fun getNotificationPermissionState(): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return "granted"
        }

        return if (
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            "granted"
        } else {
            "prompt"
        }
    }

    private fun sharePngImage(base64Png: String, filename: String, title: String) {
        try {
            val safeFilename = filename
                .replace(Regex("[^A-Za-z0-9._-]"), "-")
                .ifBlank { "fitness-momentum-progress.png" }
            val imageBytes = Base64.decode(base64Png, Base64.DEFAULT)
            val shareDir = File(cacheDir, "share").apply {
                mkdirs()
            }
            val imageFile = File(shareDir, safeFilename)
            imageFile.writeBytes(imageBytes)

            val imageUri = FileProvider.getUriForFile(
                this,
                "$packageName.fileprovider",
                imageFile
            )
            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = "image/png"
                putExtra(Intent.EXTRA_STREAM, imageUri)
                putExtra(Intent.EXTRA_TITLE, title)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(shareIntent, title))
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(this, "Unable to share progress image", Toast.LENGTH_LONG).show()
        }
    }

    inner class WebAppInterface(private val context: Context) {
        @JavascriptInterface
        fun saveBackup(data: String, filename: String) {
            pendingBackupData = data
            runOnUiThread {
                val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "application/json"
                    putExtra(Intent.EXTRA_TITLE, filename)
                }
                try {
                    saveFileLauncher.launch(intent)
                } catch (e: Exception) {
                    Toast.makeText(context, "Cannot save file: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }

        @JavascriptInterface
        fun importBackup() {
            runOnUiThread {
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "application/json"
                    putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/json", "text/json", "text/plain"))
                }
                try {
                    openBackupLauncher.launch(intent)
                } catch (e: Exception) {
                    Toast.makeText(context, "Cannot open file picker: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }

        @JavascriptInterface
        fun setLightStatusBar(enabled: Boolean) {
            runOnUiThread {
                WindowInsetsControllerCompat(window, webView).isAppearanceLightStatusBars = enabled
            }
        }

        @JavascriptInterface
        fun getNotificationPermissionState(): String {
            return this@MainActivity.getNotificationPermissionState()
        }

        @JavascriptInterface
        fun requestNotificationPermission() {
            runOnUiThread {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                    dispatchNotificationPermissionResult("granted")
                    return@runOnUiThread
                }

                if (this@MainActivity.getNotificationPermissionState() == "granted") {
                    dispatchNotificationPermissionResult("granted")
                    return@runOnUiThread
                }

                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        @JavascriptInterface
        fun syncReminderSnapshot(snapshotJson: String) {
            ReminderScheduler.saveSnapshot(context, snapshotJson)
            ReminderScheduler.scheduleFromSnapshot(context, snapshotJson)
        }

        @JavascriptInterface
        fun shareImage(base64Png: String, filename: String, title: String) {
            runOnUiThread {
                sharePngImage(base64Png, filename, title)
            }
        }
    }

    private fun configureBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    companion object {
        private const val ASSET_HOST = "appassets.androidplatform.net"
        private const val APP_URL_PREFIX = "https://$ASSET_HOST/assets/www/"
        private const val APP_URL = "https://$ASSET_HOST/assets/www/index.html"
        private const val LEGACY_APP_URL_PREFIX = "file:///android_asset/www/"
        private const val LEGACY_APP_URL = "${LEGACY_APP_URL_PREFIX}index.html"
        private const val PREF_LEGACY_STORAGE_MIGRATED = "legacy_storage_migrated_to_asset_loader"
    }
}
