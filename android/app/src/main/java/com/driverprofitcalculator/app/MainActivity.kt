package com.driverprofitcalculator.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader

class MainActivity : Activity() {\n    private lateinit var voiceController: NativeVoiceController
    private lateinit var web: WebView
    private lateinit var loader: WebViewAssetLoader

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        loader = WebViewAssetLoader.Builder().setDomain(ASSET_DOMAIN)
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        web = WebView(this)
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
        voiceController = NativeVoiceController(this, web)\n        web.addJavascriptInterface(AndroidBridge(this, voiceController), "DriverAndroid")
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

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {\n        super.onRequestPermissionsResult(requestCode, permissions, grantResults)\n        if (requestCode == NativeVoiceController.REQUEST_AUDIO_PERMISSION) {\n            voiceController.onAudioPermissionResult(grantResults.firstOrNull() == android.content.pm.PackageManager.PERMISSION_GRANTED)\n        }\n    }\n\n    override fun onDestroy() {\n        voiceController.destroy()
        web.removeJavascriptInterface("DriverAndroid")
        web.stopLoading()
        web.destroy()
        super.onDestroy()
    }
    companion object { private const val ASSET_DOMAIN = "appassets.androidplatform.net" }
}
