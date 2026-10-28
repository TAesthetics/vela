/**
 * Create / refresh the native iOS + Android projects for the App Store and
 * Google Play (see docs/STORE.md). Idempotent — run it again after changes.
 *
 *   VELA_APP_URL=https://vela-xxxx.vercel.app npm run native:setup
 *
 * 1. writes native/www/app-url.js (retry target of the offline screen)
 * 2. `cap add ios` / `cap add android` if the folders don't exist yet
 * 3. renders icons + splash screens (scripts/native-assets.mjs)
 * 4. patches Info.plist / AndroidManifest (vela:// deep link for login,
 *    camera/photo texts, portrait-only iPhone, dark splash colors)
 * 5. `cap sync`
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const SCHEME = "vela";
const BG = "#12100E";
const appUrl = process.env.VELA_APP_URL?.trim().replace(/\/+$/, "");
if (!appUrl || !/^https:\/\/[^/]+$/.test(appUrl)) {
  console.error(
    "VELA_APP_URL fehlt oder ist ungültig. Beispiel:\n" +
      "  VELA_APP_URL=https://vela-xxxx.vercel.app npm run native:setup",
  );
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { stdio: "inherit", env: process.env });
const edit = (file, fn) => {
  const before = readFileSync(file, "utf8");
  const after = fn(before);
  if (after !== before) {
    writeFileSync(file, after);
    console.log(`patched ${file}`);
  }
};

writeFileSync("native/www/app-url.js", `window.VELA_APP_URL = ${JSON.stringify(appUrl)};\n`);

if (!existsSync("ios")) run("npx cap add ios");
if (!existsSync("android")) run("npx cap add android");

run("node scripts/native-assets.mjs");

// ── iOS ─────────────────────────────────────────────────────────────────────
const plist = "ios/App/App/Info.plist";
if (existsSync(plist)) {
  edit(plist, (s) => {
    const add = [];
    if (!s.includes("CFBundleURLTypes")) {
      add.push(`	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLName</key>
			<string>at.vela.app</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>${SCHEME}</string>
			</array>
		</dict>
	</array>`);
    }
    if (!s.includes("NSCameraUsageDescription")) {
      add.push(`	<key>NSCameraUsageDescription</key>
	<string>VELA nutzt die Kamera nur, wenn du selbst ein Porträt oder deinen Ausweis fotografierst.</string>`);
    }
    if (!s.includes("NSPhotoLibraryUsageDescription")) {
      add.push(`	<key>NSPhotoLibraryUsageDescription</key>
	<string>VELA verwendet nur Fotos, die du selbst für dein Porträt oder die Ausweisprüfung auswählst.</string>`);
    }
    if (!s.includes("ITSAppUsesNonExemptEncryption")) {
      add.push(`	<key>ITSAppUsesNonExemptEncryption</key>
	<false/>`);
    }
    let out = add.length
      ? s.replace(/<\/dict>\s*<\/plist>\s*$/, `${add.join("\n")}\n</dict>\n</plist>\n`)
      : s;
    // iPhone: portrait only (iPad keeps all orientations).
    out = out.replace(
      /(<key>UISupportedInterfaceOrientations<\/key>\s*<array>)[\s\S]*?(<\/array>)/,
      "$1\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t$2",
    );
    return out;
  });
  // iPhone only: no iPad screenshots needed for review.
  edit("ios/App/App.xcodeproj/project.pbxproj", (s) =>
    s.replace(/TARGETED_DEVICE_FAMILY = "1,2";/g, "TARGETED_DEVICE_FAMILY = 1;"),
  );
}

// ── Android ─────────────────────────────────────────────────────────────────
const manifest = "android/app/src/main/AndroidManifest.xml";
if (existsSync(manifest)) {
  edit(manifest, (s) =>
    s.includes(`android:scheme="${SCHEME}"`)
      ? s
      : s.replace(
          /(<category android:name="android.intent.category.LAUNCHER" \/>\s*<\/intent-filter>)/,
          `$1

            <!-- Login return from the system browser: ${SCHEME}://auth -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${SCHEME}" android:host="auth" />
            </intent-filter>`,
        ),
  );
  edit("android/app/src/main/res/values/ic_launcher_background.xml", (s) =>
    s.replace(
      /<color name="ic_launcher_background">[^<]*<\/color>/,
      `<color name="ic_launcher_background">${BG}</color>`,
    ),
  );
  edit("android/app/src/main/res/values/styles.xml", (s) =>
    s.includes("windowSplashScreenBackground")
      ? s
      : s.replace(
          /(<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">)/,
          `$1\n        <item name="windowSplashScreenBackground">${BG}</item>\n        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>`,
        ),
  );
}

run("npx cap sync");
console.log(`\nFertig. Die App lädt ${appUrl}. Weiter: npx cap open ios | npx cap open android`);
