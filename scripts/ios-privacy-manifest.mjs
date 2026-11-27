/**
 * Adds VELA's Apple privacy manifest (native/ios/PrivacyInfo.xcprivacy) to the
 * generated iOS project. Apple rejects uploads that use a "required reason"
 * API without declaring it (ITMS-91053); @capacitor/filesystem (data export)
 * reads file timestamps. Copying the file next to Info.plist is not enough:
 * the classic Capacitor Xcode project lists every bundled file, so the file
 * also has to be registered in project.pbxproj (file reference, App group,
 * Resources build phase). Used by scripts/native-setup.mjs.
 */

export const PRIVACY_MANIFEST = "PrivacyInfo.xcprivacy";

// Fixed object ids (24 hex chars, like Xcode's), so re-running stays stable.
const FILE_REF_ID = "5E1A0C0F2F0A00010000A1B2";
const BUILD_FILE_ID = "5E1A0C0F2F0A00020000A1B2";

/**
 * Returns the patched project text, the unchanged text if the manifest is
 * already registered, or null if the project doesn't have the expected
 * Capacitor layout (then nothing is written and setup warns).
 */
export function addPrivacyManifestToPbxproj(text) {
  if (text.includes(`/* ${PRIVACY_MANIFEST} */`)) return text;

  const buildFileEnd = "/* End PBXBuildFile section */";
  const fileRefEnd = "/* End PBXFileReference section */";
  const appGroup = /(\/\* App \*\/ = \{\s*isa = PBXGroup;\s*children = \()/;
  const resources = /(\/\* Resources \*\/ = \{\s*isa = PBXResourcesBuildPhase;\s*buildActionMask = \d+;\s*files = \()/;
  if (!text.includes(buildFileEnd) || !text.includes(fileRefEnd) || !appGroup.test(text) || !resources.test(text)) {
    return null;
  }

  return text
    .replace(
      buildFileEnd,
      `\t\t${BUILD_FILE_ID} /* ${PRIVACY_MANIFEST} in Resources */ = {isa = PBXBuildFile; fileRef = ${FILE_REF_ID} /* ${PRIVACY_MANIFEST} */; };\n${buildFileEnd}`,
    )
    .replace(
      fileRefEnd,
      `\t\t${FILE_REF_ID} /* ${PRIVACY_MANIFEST} */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = ${PRIVACY_MANIFEST}; sourceTree = "<group>"; };\n${fileRefEnd}`,
    )
    .replace(appGroup, `$1\n\t\t\t\t${FILE_REF_ID} /* ${PRIVACY_MANIFEST} */,`)
    .replace(resources, `$1\n\t\t\t\t${BUILD_FILE_ID} /* ${PRIVACY_MANIFEST} in Resources */,`);
}
