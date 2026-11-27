import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { addPrivacyManifestToPbxproj, PRIVACY_MANIFEST } from "./ios-privacy-manifest.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The pbxproj from the Capacitor iOS template that `cap add ios` uses. */
function templateProject() {
  const dir = mkdtempSync(join(tmpdir(), "vela-ios-tpl-"));
  execFileSync("tar", ["xzf", join(ROOT, "node_modules/@capacitor/cli/assets/ios-spm-template.tar.gz"), "-C", dir]);
  return readFileSync(join(dir, "App/App.xcodeproj/project.pbxproj"), "utf8");
}

const hasTemplate = existsSync(join(ROOT, "node_modules/@capacitor/cli/assets/ios-spm-template.tar.gz"));

test("privacy manifest is registered in the App group and bundled as a resource", { skip: !hasTemplate }, () => {
  const before = templateProject();
  const after = addPrivacyManifestToPbxproj(before);
  assert.ok(after);
  // file reference + build file + group child + resources entry
  assert.equal(after.split(`/* ${PRIVACY_MANIFEST} */`).length - 1, 3);
  assert.equal(after.split(`/* ${PRIVACY_MANIFEST} in Resources */`).length - 1, 2);
  const group = after.match(/\/\* App \*\/ = \{\s*isa = PBXGroup;\s*children = \(([\s\S]*?)\);/)?.[1] ?? "";
  assert.match(group, /PrivacyInfo\.xcprivacy/);
  const phase = after.match(/isa = PBXResourcesBuildPhase;[\s\S]*?files = \(([\s\S]*?)\);/)?.[1] ?? "";
  assert.match(phase, /PrivacyInfo\.xcprivacy in Resources/);
  // Only additions, nothing of the original project removed.
  for (const line of before.split("\n")) assert.ok(after.includes(line));
});

test("re-running setup does not add the manifest twice", { skip: !hasTemplate }, () => {
  const once = addPrivacyManifestToPbxproj(templateProject());
  assert.equal(addPrivacyManifestToPbxproj(once), once);
});

test("an unexpected project layout is left alone", () => {
  assert.equal(addPrivacyManifestToPbxproj("// !$*UTF8*$!\n{ objects = { }; }"), null);
});

test("the manifest declares no tracking and the file-timestamp reason", () => {
  const plist = readFileSync(join(ROOT, "native/ios", PRIVACY_MANIFEST), "utf8");
  assert.match(plist, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  assert.match(plist, /NSPrivacyAccessedAPICategoryFileTimestamp<\/string>\s*<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>\s*<string>C617\.1<\/string>/);
  assert.doesNotMatch(plist, /<key>NSPrivacyCollectedDataTypeTracking<\/key>\s*<true\/>/);
});
