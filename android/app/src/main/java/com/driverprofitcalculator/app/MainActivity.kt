package com.driverprofitcalculator.app

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.util.Base64
import java.io.ByteArrayOutputStream
import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader

class MainActivity : Activity() {
    private lateinit var voiceController: NativeVoiceController
    private lateinit var web: WebView
    private lateinit var loader: WebViewAssetLoader
    private var pendingSharedImageDataUrl: String? = null
    private var bottomInsetDp: Float = 0f

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        loader = WebViewAssetLoader.Builder().setDomain(ASSET_DOMAIN)
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        // Edge-to-edge is enforced from Android 15 (targetSdk 35). The app draws behind the bars, so the
        // WebView is padded with the real system bar, display cutout and keyboard insets. Content never
        // starts under the status bar or ends under the navigation bar, and the keyboard pushes the page up.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#080E20"))
        ViewCompat.setOnApplyWindowInsetsListener(web) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            val bottom = maxOf(bars.bottom, ime.bottom)
            view.setPadding(bars.left, bars.top, bars.right, bottom)
            bottomInsetDp = bottom / view.resources.displayMetrics.density
            view.post { applyWebInsets() }
            WindowInsetsCompat.CONSUMED
        }
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            mediaPlaybackRequiresUserGesture = true
            setSupportMultipleWindows(false)
        }
        voiceController = NativeVoiceController(this, web)
        web.addJavascriptInterface(AndroidBridge(this, voiceController), "DriverAndroid")
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                applyWebInsets()
                dispatchPendingSharedImage()
            }
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.scheme == "https" && uri.host == ASSET_DOMAIN) return false
                return try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri.toString()))); true } catch (_: Exception) { true }
            }
        }
        setContentView(web)
        web.loadUrl("https://" + ASSET_DOMAIN + "/index.html")
        handleSharedImage(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleSharedImage(intent)
    }

    private fun handleSharedImage(source: Intent?) {
        if (source?.action != Intent.ACTION_SEND || source.type?.startsWith("image/") != true) return
        val uri = source.getParcelableExtra<Uri>(Intent.EXTRA_STREAM) ?: return
        Thread {
            try {
                val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return@Thread
                if (bytes.isEmpty() || bytes.size > MAX_SHARED_IMAGE_BYTES) return@Thread
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@Thread
                var sample = 1
                while (maxOf(bounds.outWidth, bounds.outHeight) / sample > MAX_SHARED_IMAGE_DIMENSION) sample *= 2
                val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return@Thread
                val output = ByteArrayOutputStream()
                bitmap.compress(Bitmap.CompressFormat.JPEG, 88, output)
                bitmap.recycle()
                val dataUrl = "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
                runOnUiThread { pendingSharedImageDataUrl = dataUrl; dispatchPendingSharedImage() }
            } catch (_: Exception) {
                runOnUiThread { web.evaluateJavascript("window.dispatchEvent(new CustomEvent('driverandroidshareerror'));", null) }
            }
        }.start()
    }

    private fun dispatchPendingSharedImage() {
        val dataUrl = pendingSharedImageDataUrl ?: return
        pendingSharedImageDataUrl = null
        val quoted = org.json.JSONObject.quote(dataUrl)
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('driverandroidshareimage',{detail:{dataUrl:$quoted}}));", null)
    }

    private fun applyWebInsets() {
        if (!::web.isInitialized) return
        web.evaluateJavascript("document.documentElement.style.setProperty('--android-bottom-inset','${bottomInsetDp}px');", null)
    }

    fun applySystemTheme(light: Boolean) {
        runOnUiThread {
            val color = if (light) Color.parseColor("#F3F7FC") else Color.parseColor("#080E20")
            web.setBackgroundColor(color)
            window.statusBarColor = color
            window.navigationBarColor = color
            WindowInsetsControllerCompat(window, web).apply {
                isAppearanceLightStatusBars = light
                isAppearanceLightNavigationBars = light
            }
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == NativeVoiceController.REQUEST_AUDIO_PERMISSION) {
            voiceController.onAudioPermissionResult(grantResults.firstOrNull() == android.content.pm.PackageManager.PERMISSION_GRANTED)
        }
    }

    override fun onDestroy() {
        voiceController.destroy()
        web.removeJavascriptInterface("DriverAndroid")
        web.stopLoading()
        web.destroy()
        super.onDestroy()
    }
    companion object {
        private const val ASSET_DOMAIN = "appassets.androidplatform.net"
        private const val MAX_SHARED_IMAGE_BYTES = 20 * 1024 * 1024
        private const val MAX_SHARED_IMAGE_DIMENSION = 2048
    }
}
