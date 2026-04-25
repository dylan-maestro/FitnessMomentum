package com.fitnessmomentum

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private var latestSystemBarInsets = Insets.NONE

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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        webView = WebView(this)
        webView.setBackgroundColor(Color.parseColor("#F5F5F5"))
        configureSystemBarInsets()
        configureWebView()
        
        setContentView(webView)
        ViewCompat.requestApplyInsets(webView)
        
        // Load the local HTML file from assets
        webView.loadUrl("file:///android_asset/www/index.html")
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
        webView.evaluateJavascript(
            """
            (() => {
              const root = document.documentElement;
              root.style.setProperty('--android-safe-area-top', '${insets.top}px');
              root.style.setProperty('--android-safe-area-right', '${insets.right}px');
              root.style.setProperty('--android-safe-area-bottom', '${insets.bottom}px');
              root.style.setProperty('--android-safe-area-left', '${insets.left}px');
            })();
            """.trimIndent(),
            null
        )
    }

    private fun configureWebView() {
        val settings = webView.settings
        
        // Enable JavaScript
        settings.javaScriptEnabled = true
        
        // Enable DOM storage for localStorage
        settings.domStorageEnabled = true
        
        // Allow file access from file URLs and universal access to disable CORS for local files
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.allowFileAccessFromFileURLs = true
        settings.allowUniversalAccessFromFileURLs = true
        
        // Enable database storage
        settings.databaseEnabled = true
        
        // Set user agent (optional)
        settings.userAgentString = settings.userAgentString + " FitnessMomentum/1.0"
        
        // Add Javascript Interface
        webView.addJavascriptInterface(WebAppInterface(this), "Android")

        // Prevent navigation away from local files
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                applySystemBarInsetsToPage()
            }

            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                // Only allow loading local files
                return if (url?.startsWith("file://") == true || url?.startsWith("http://localhost") == true) {
                    false
                } else {
                    true // Block external URLs
                }
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
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
