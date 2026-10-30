import { createHash } from "node:crypto";
import { readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  type ConfigPlugin,
} from "expo/config-plugins";

const requiredPermissions = [
  "android.permission.INTERNET",
  "android.permission.ACCESS_NETWORK_STATE",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_SYSTEM_EXEMPTED",
  "android.permission.POST_NOTIFICATIONS",
];

const withSingBox: ConfigPlugin = (config) => {
  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const permissions = manifest["uses-permission"] ?? [];
    const present = new Set(permissions.map((permission) => permission.$["android:name"]));
    for (const permission of requiredPermissions) {
      if (!present.has(permission)) permissions.push({ $: { "android:name": permission } });
    }
    manifest["uses-permission"] = permissions;
    return mod;
  });

  config = withDangerousMod(config, ["android", async (mod) => {
    const libsDir = path.join(
      mod.modRequest.projectRoot,
      "modules",
      "singbox-android",
      "android",
      "libs",
    );
    const versionPath = path.join(libsDir, "libbox.version");
    const metadata = readFileSync(versionPath, "utf8");
    const expectedSha = metadata.match(/^AAR SHA256: ([a-f0-9]{64})$/m)?.[1];
    if (!expectedSha) {
      throw new Error("Tunelio sing-box: checksum AAR tidak ditemukan di libbox.version.");
    }

    const fragmentNames = readdirSync(libsDir)
      .filter((name) => /^libbox\.aar\.part-\d{3}$/.test(name))
      .sort();
    const expectedNames = fragmentNames.map(
      (_name, index) => `libbox.aar.part-${String(index).padStart(3, "0")}`,
    );
    if (!fragmentNames.length || fragmentNames.some((name, index) => name !== expectedNames[index])) {
      throw new Error("Tunelio sing-box: fragmen libbox AAR hilang atau urutannya tidak lengkap.");
    }

    const archive = Buffer.concat(
      fragmentNames.map((name) => readFileSync(path.join(libsDir, name))),
    );
    const actualSha = createHash("sha256").update(archive).digest("hex");
    if (actualSha !== expectedSha) {
      throw new Error(`Tunelio sing-box: checksum libbox AAR tidak cocok (${actualSha}).`);
    }

    const aarPath = path.join(libsDir, "libbox.aar");
    const temporaryPath = `${aarPath}.tmp`;
    writeFileSync(temporaryPath, archive);
    renameSync(temporaryPath, aarPath);
    return mod;
  }]);

  config = withAppBuildGradle(config, (mod) => {
    const contents = mod.modResults.contents;
    const marker = "// Tunelio: upstream sing-box libbox AAR";
    if (contents.includes(marker)) return mod;
    const dependency = `\n  ${marker}\n  implementation files(rootProject.file("../modules/singbox-android/android/libs/libbox.aar"))`;
    if (!/dependencies\s*\{/.test(contents)) {
      throw new Error("Tunelio sing-box plugin: blok dependencies tidak ditemukan di android/app/build.gradle.");
    }
    mod.modResults.contents = contents.replace(/dependencies\s*\{/, (match) => `${match}${dependency}`);
    return mod;
  });

  return config;
};

export default withSingBox;
