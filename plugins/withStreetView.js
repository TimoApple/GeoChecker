const { withMainApplication, withAndroidManifest, withProjectBuildGradle, withAppBuildGradle } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Native source files to inject after prebuild
const NATIVE_FILES = {
  'StreetViewActivity.kt': `package com.geocheckr.app

import android.os.Bundle
import android.widget.ImageButton
import androidx.appcompat.app.AppCompatActivity
import com.google.android.gms.maps.OnStreetViewPanoramaReadyCallback
import com.google.android.gms.maps.SupportStreetViewPanoramaFragment
import com.google.android.gms.maps.StreetViewPanorama
import com.google.android.gms.maps.model.LatLng

class StreetViewActivity : AppCompatActivity(), OnStreetViewPanoramaReadyCallback {
    private var targetLat = 0.0
    private var targetLng = 0.0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_street_view)
        targetLat = intent.getDoubleExtra("latitude", 0.0)
        targetLng = intent.getDoubleExtra("longitude", 0.0)
        val streetViewFragment = supportFragmentManager
            .findFragmentById(R.id.streetviewpanorama) as SupportStreetViewPanoramaFragment
        streetViewFragment.getStreetViewPanoramaAsync(this)
        findViewById<ImageButton>(R.id.btnClose).setOnClickListener { finish() }
    }

    override fun onStreetViewPanoramaReady(panorama: StreetViewPanorama) {
        panorama.apply {
            setPosition(LatLng(targetLat, targetLng))
            isStreetNamesEnabled = false
            isUserNavigationEnabled = true
            isZoomGesturesEnabled = true
            isPanningGesturesEnabled = true
        }
    }
}`,

  'StreetViewModule.kt': `package com.geocheckr.app

import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

class StreetViewModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "StreetViewModule"

    @ReactMethod
    fun openStreetView(latitude: Double, longitude: Double) {
        val context = reactApplicationContext
        UiThreadUtil.runOnUiThread {
            val intent = Intent(context, StreetViewActivity::class.java).apply {
                putExtra("latitude", latitude)
                putExtra("longitude", longitude)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        }
    }
}`,

  'StreetViewPackage.kt': `package com.geocheckr.app

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class StreetViewPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(StreetViewModule(reactContext))
    }
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}`,

  'activity_street_view.xml': `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent" android:layout_height="match_parent"
    android:background="#000000">
    <fragment android:id="@+id/streetviewpanorama"
        android:name="com.google.android.gms.maps.SupportStreetViewPanoramaFragment"
        android:layout_width="match_parent" android:layout_height="match_parent" />
    <ImageButton android:id="@+id/btnClose"
        android:layout_width="48dp" android:layout_height="48dp"
        android:layout_gravity="top|end" android:layout_margin="16dp"
        android:background="#80000000"
        android:src="@android:drawable/ic_menu_close_clear_cancel"
        android:contentDescription="Schließen" android:tint="#FFFFFF" />
</FrameLayout>`
};

const withStreetViewNative = (config) => {
  // Add play-services-maps dependency
  config = withAppBuildGradle(config, (cfg) => {
    const buildGradle = cfg.modResults.contents;
    if (!buildGradle.includes('play-services-maps')) {
      cfg.modResults.contents = buildGradle.replace(
        /dependencies\s*{/,
        'dependencies {\n    implementation \'com.google.android.gms:play-services-maps:19.0.0\''
      );
    }
    return cfg;
  });

  // Add API key to AndroidManifest
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const application = manifest.manifest.application[0];
    if (!application['meta-data']?.some(m => m.$['android:name'] === 'com.google.android.geo.API_KEY')) {
      application['meta-data'] = application['meta-data'] || [];
      application['meta-data'].push({
        $: {
          'android:name': 'com.google.android.geo.API_KEY',
          'android:value': 'AIzaSyCl3ogHqguF1QcwhyHdvJmUkbgx3bpKLJI'
        }
      });
    }
    // Register StreetViewActivity
    application.activity = application.activity || [];
    if (!application.activity.some(a => a.$['android:name'] === '.StreetViewActivity')) {
      application.activity.push({
        $: {
          'android:name': '.StreetViewActivity',
          'android:theme': '@style/Theme.AppCompat.NoActionBar',
          'android:exported': 'false'
        }
      });
    }
    return cfg;
  });

  // Register StreetViewPackage in MainApplication
  config = withMainApplication(config, (cfg) => {
    let mainApp = cfg.modResults.contents;
    if (!mainApp.includes('StreetViewPackage')) {
      mainApp = mainApp.replace(
        /PackageList\(this\)\.packages\.apply\s*{/,
        'PackageList(this).packages.apply {\n              add(StreetViewPackage())'
      );
      // Add import
      if (!mainApp.includes('import com.geocheckr.app.StreetViewPackage')) {
        mainApp = 'import com.geocheckr.app.StreetViewPackage\n' + mainApp;
      }
      cfg.modResults.contents = mainApp;
    }
    return cfg;
  });

  return config;
};

// Export for withPlugins
module.exports = withStreetViewNative;
module.exports.NATIVE_FILES = NATIVE_FILES;
