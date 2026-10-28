import {
  withAppBuildGradle,
  withMainApplication,
  type ConfigPlugin,
} from "expo/config-plugins";

const withStandaloneDebugBundle: ConfigPlugin = (config) => {
  config = withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;
    const marker = "// Tunelio: embed JS bundle in standalone debug APK";

    if (!contents.includes(marker)) {
      const activeVariantSetting = /^([\t ]*)debuggableVariants\s*=.*$/m;
      if (activeVariantSetting.test(contents)) {
        contents = contents.replace(
          activeVariantSetting,
          (_line, indentation: string) =>
            `${indentation}${marker}\n${indentation}debuggableVariants = []`,
        );
      } else {
        const bundleCommand = /^([\t ]*bundleCommand\s*=\s*["']export:embed["'][\t ]*)$/m;
        if (!bundleCommand.test(contents)) {
          throw new Error(
            "Tunelio standalone bundle plugin: React Native Expo bundleCommand tidak ditemukan di android/app/build.gradle.",
          );
        }
        contents = contents.replace(
          bundleCommand,
          (_line, command: string) =>
            `${command}\n    ${marker}\n    debuggableVariants = []`,
        );
      }
    }

    mod.modResults.contents = contents;
    return mod;
  });

  config = withMainApplication(config, (mod) => {
    let contents = mod.modResults.contents;
    if (!contents.includes("useDevSupport = false")) {
      const hostFactoryCall = /(ExpoReactHostFactory\.getDefaultReactHost\(\s*\n)/;
      if (!hostFactoryCall.test(contents)) {
        throw new Error(
          "Tunelio standalone bundle plugin: pemanggilan ExpoReactHostFactory tidak ditemukan di MainApplication.",
        );
      }
      contents = contents.replace(
        hostFactoryCall,
        "$1      useDevSupport = false,\n",
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });

  return config;
};

export default withStandaloneDebugBundle;
