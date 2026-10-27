import { withAndroidManifest, type ConfigPlugin } from "expo/config-plugins";

const requiredPermissions = [
  "android.permission.INTERNET",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_SYSTEM_EXEMPTED",
  "android.permission.POST_NOTIFICATIONS",
];

const withSingBox: ConfigPlugin = (config) => withAndroidManifest(config, (mod) => {
  const manifest = mod.modResults.manifest;
  const permissions = manifest["uses-permission"] ?? [];
  const present = new Set(permissions.map((permission) => permission.$["android:name"]));
  for (const permission of requiredPermissions) {
    if (!present.has(permission)) permissions.push({ $: { "android:name": permission } });
  }
  manifest["uses-permission"] = permissions;
  return mod;
});

export default withSingBox;
