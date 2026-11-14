package com.driverprofitcalculator.app

import android.app.Activity
import android.content.Intent
import android.graphics.Color
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
import androidx.webkit.WebViewAssetLoader

class MainActivity : Activity() {
    private lateinit var voiceController: NativeVoiceController
    private lateinit var web: WebView
    private lateinit var loader: WebViewAssetLoader

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
            view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
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
    companion object { private const val ASSET_DOMAIN = "appassets.androidplatform.net" }
}
