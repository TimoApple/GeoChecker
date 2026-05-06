// Patch Android files after expo prebuild
// Only add API key for WebView Google Maps — NO native module
const fs = require('fs');
const path = require('path');

const androidDir = path.join(__dirname, '..', 'android');

// 1. Patch AndroidManifest.xml - add API key only
const manifest = path.join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml');
let mf = fs.readFileSync(manifest, 'utf8');

if (!mf.includes('com.google.android.geo.API_KEY')) {
  mf = mf.replace(
    /(<application[^>]*>)/,
    `$1\n    <meta-data android:name="com.google.android.geo.API_KEY" android:value="AIzaSyCl3ogHqguF1QcwhyHdvJmUkbgx3bpKLJI"/>`
  );
  fs.writeFileSync(manifest, mf);
  console.log('✅ Added API key to AndroidManifest.xml');
}

console.log('\n🎉 Patch done — WebView handles everything!');
