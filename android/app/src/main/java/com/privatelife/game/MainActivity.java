package com.privatelife.game;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {

    private static final String START_URL = "https://private-life-04pu.onrender.com/";
    private static final String APP_HOST = "private-life-04pu.onrender.com";
    private static final int FILE_CHOOSER_REQUEST = 5011;
    private static final int LOCATION_PERMISSION_REQUEST = 5012;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 5013;
    private static final String NATIVE_PREFS = "private_life_native";
    private static final String PREF_NOTIFICATION_PERMISSION_ASKED = "notification_permission_asked";
    private static final String NOTIFICATION_CHANNEL_ID = "private_life_events";

    private WebView webView;
    private ValueCallback<Uri[]> pendingFileCallback;
    private String pendingGeolocationOrigin;
    private GeolocationPermissions.Callback pendingGeolocationCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        enableImmersiveMode();
        createNotificationChannel();
        requestNotificationPermissionOnFirstLaunch();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(8, 9, 13));
        setContentView(webView);

        configureWebView();

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(START_URL);
        }
    }


    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    NOTIFICATION_CHANNEL_ID,
                    "Eventos de PRIVATE LIFE",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Mensajes, llamadas, eventos y avisos del teléfono del juego.");

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void requestNotificationPermissionOnFirstLaunch() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return;
        }

        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
            return;
        }

        SharedPreferences prefs = getSharedPreferences(NATIVE_PREFS, MODE_PRIVATE);
        if (prefs.getBoolean(PREF_NOTIFICATION_PERMISSION_ASKED, false)) {
            return;
        }

        prefs.edit()
                .putBoolean(PREF_NOTIFICATION_PERMISSION_ASKED, true)
                .apply();

        requestPermissions(
                new String[]{Manifest.permission.POST_NOTIFICATIONS},
                NOTIFICATION_PERMISSION_REQUEST
        );
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccess(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setTextZoom(100);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        String userAgent = settings.getUserAgentString();
        settings.setUserAgentString(userAgent + " PrivateLifeAndroid/1.0");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(webView, true);
        }

        WebView.setWebContentsDebuggingEnabled(false);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(
                    String origin,
                    GeolocationPermissions.Callback callback
            ) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                        || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                        || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                    return;
                }

                pendingGeolocationOrigin = origin;
                pendingGeolocationCallback = callback;
                requestPermissions(
                        new String[]{
                                Manifest.permission.ACCESS_COARSE_LOCATION,
                                Manifest.permission.ACCESS_FINE_LOCATION
                        },
                        LOCATION_PERMISSION_REQUEST
                );
            }

            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (pendingFileCallback != null) {
                    pendingFileCallback.onReceiveValue(null);
                }

                pendingFileCallback = filePathCallback;

                Intent intent;
                try {
                    intent = fileChooserParams.createIntent();
                } catch (Exception ignored) {
                    intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("image/*");
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }

                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException e) {
                    pendingFileCallback = null;
                    Toast.makeText(MainActivity.this, "No hay selector de archivos disponible.", Toast.LENGTH_SHORT).show();
                    return false;
                }
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                String host = uri.getHost();

                if (("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))
                        && APP_HOST.equalsIgnoreCase(host)) {
                    return false;
                }

                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    Toast.makeText(MainActivity.this, "No se puede abrir este enlace.", Toast.LENGTH_SHORT).show();
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectNativeFullscreenFix();
                CookieManager.getInstance().flush();
            }

            @Override
            public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceError error
            ) {
                super.onReceivedError(view, request, error);

                if (request.isForMainFrame()) {
                    String html =
                            "<html><head><meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'>" +
                            "<style>html,body{height:100%;margin:0;background:#08090d;color:#fff;font-family:system-ui}" +
                            ".wrap{height:100%;display:grid;place-items:center;text-align:center;padding:28px;box-sizing:border-box}" +
                            "button{margin-top:18px;border:0;border-radius:16px;padding:14px 20px;font-weight:800}</style></head>" +
                            "<body><div class='wrap'><div><h2>PRIVATE LIFE</h2><p>Sin conexión con el juego.</p>" +
                            "<button onclick=\"location.href='" + START_URL + "'\">Reintentar</button></div></div></body></html>";
                    view.loadDataWithBaseURL(START_URL, html, "text/html", "UTF-8", null);
                }
            }
        });

        webView.setDownloadListener((url, downloadUserAgent, contentDisposition, mimetype, contentLength) -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) {
                Toast.makeText(MainActivity.this, "No se puede iniciar la descarga.", Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void injectNativeFullscreenFix() {
        String js =
                "(function(){" +
                "window.__PRIVATE_LIFE_ANDROID__=true;" +
                "document.documentElement.classList.add('pl-native-app');" +
                "var meta=document.querySelector('meta[name=viewport]');" +
                "if(!meta){meta=document.createElement('meta');meta.name='viewport';document.head.appendChild(meta);}" +
                "meta.content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover';" +
                "var id='private-life-native-style';" +
                "var old=document.getElementById(id);if(old)old.remove();" +
                "var s=document.createElement('style');s.id=id;" +
                "s.textContent=" +
                "'html,body{width:100%!important;min-width:0!important;min-height:100dvh!important;margin:0!important;padding:0!important;overflow-x:hidden!important;overscroll-behavior:none!important;background:#08090d!important;}' +" +
                "'.stage{padding:0!important;min-height:100dvh!important;width:100vw!important;}' +" +
                "'.phone{width:100vw!important;max-width:none!important;height:100dvh!important;max-height:none!important;border:0!important;border-radius:0!important;box-shadow:none!important;}' +" +
                "'.phone:before{display:none!important;}' +" +
                "'.authpage{padding:0!important;width:100vw!important;min-height:100dvh!important;}' +" +
                "'.authpanel{width:100%!important;max-width:none!important;min-height:100dvh!important;border:0!important;border-radius:0!important;box-shadow:none!important;}' +" +
                "'.wizard{width:100%!important;max-width:none!important;min-height:100dvh!important;}' +" +
                "'button,a,input,textarea,select{-webkit-tap-highlight-color:transparent;}';" +
                "document.head.appendChild(s);" +
                "})();";

        webView.evaluateJavascript(js, null);
    }

    private void enableImmersiveMode() {
        View decor = getWindow().getDecorView();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = decor.getWindowInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        } else {
            decor.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            attributes.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attributes);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enableImmersiveMode();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        enableImmersiveMode();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            CookieManager.getInstance().flush();
            webView.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) {
            webView.saveState(outState);
        }
        super.onSaveInstanceState(outState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            String[] permissions,
            int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == NOTIFICATION_PERMISSION_REQUEST) {
            boolean granted =
                    Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                    || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED;

            if (!granted) {
                Toast.makeText(
                        this,
                        "Puedes activar las notificaciones después en Ajustes > Apps > PRIVATE LIFE > Notificaciones.",
                        Toast.LENGTH_LONG
                ).show();
            }
            return;
        }

        if (requestCode == LOCATION_PERMISSION_REQUEST && pendingGeolocationCallback != null) {
            boolean granted =
                    checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                    || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;

            pendingGeolocationCallback.invoke(
                    pendingGeolocationOrigin == null ? START_URL : pendingGeolocationOrigin,
                    granted,
                    false
            );
            pendingGeolocationCallback = null;
            pendingGeolocationOrigin = null;
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (pendingFileCallback != null) {
                Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                pendingFileCallback.onReceiveValue(results);
                pendingFileCallback = null;
            }
            return;
        }

        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onDestroy() {
        if (pendingFileCallback != null) {
            pendingFileCallback.onReceiveValue(null);
            pendingFileCallback = null;
        }

        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }

        super.onDestroy();
    }
}
