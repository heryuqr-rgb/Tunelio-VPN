#!/usr/bin/env bash
set -euo pipefail

readonly VERSION="v1.14.3"
readonly SOURCE_COMMIT="7054cac5124465ffdb145870d7c01885566711b1"
readonly GOMOBILE_VERSION="v0.1.12"
readonly ANDROID_PLATFORM="${LIBBOX_ANDROID_PLATFORM:-android/arm64}"
readonly SOURCE_DIR="${SING_BOX_SOURCE_DIR:-${HOME}/.cache/tunelio/sing-box-${VERSION}}"
readonly PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly AAR_DIR="${PROJECT_DIR}/modules/singbox-android/android/libs"
readonly AAR_CHUNK_BYTES=$((20 * 1024 * 1024))

GO_BIN="$(command -v go || true)"
if [[ -z "${GO_BIN}" && -x /usr/local/go/bin/go ]]; then GO_BIN=/usr/local/go/bin/go; fi
if [[ -z "${GO_BIN}" ]]; then echo "Go is required. Install Go 1.25.5 or newer." >&2; exit 1; fi
export PATH="$(dirname "${GO_BIN}"):${PATH}"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-${HOME}/Android/Sdk}}"
export ANDROID_SDK_HOME="${ANDROID_HOME}"
export ANDROID_NDK_HOME="${ANDROID_NDK_HOME:-${ANDROID_HOME}/ndk/28.0.13004108}"
export NDK="${ANDROID_NDK_HOME}"
export PATH="${JAVA_HOME}/bin:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_NDK_HOME}/toolchains/llvm/prebuilt/linux-x86_64/bin:$(${GO_BIN} env GOPATH)/bin:${PATH}"

[[ -x "${JAVA_HOME}/bin/java" ]] || { echo "OpenJDK 17 not found at ${JAVA_HOME}; set JAVA_HOME." >&2; exit 1; }
[[ -f "${ANDROID_HOME}/licenses/android-sdk-license" ]] || { echo "Accept Android SDK licenses and set ANDROID_HOME first." >&2; exit 1; }
[[ -f "${ANDROID_NDK_HOME}/source.properties" ]] || { echo "Android NDK 28.0.13004108 not found at ${ANDROID_NDK_HOME}." >&2; exit 1; }

if [[ ! -d "${SOURCE_DIR}/.git" ]]; then
  mkdir -p "$(dirname "${SOURCE_DIR}")"
  git clone --depth 1 --branch "${VERSION}" https://github.com/SagerNet/sing-box.git "${SOURCE_DIR}"
fi
actual_commit="$(git -C "${SOURCE_DIR}" rev-parse HEAD)"
if [[ "${actual_commit}" != "${SOURCE_COMMIT}" ]]; then
  echo "Expected sing-box ${VERSION} at ${SOURCE_COMMIT}; found ${actual_commit}. Refusing an unpinned build." >&2
  exit 1
fi

GOPATH_DIR="$(${GO_BIN} env GOPATH)"
mkdir -p "${GOPATH_DIR}/bin"
if [[ ! -x "${GOPATH_DIR}/bin/gomobile" ]]; then "${GO_BIN}" install "github.com/sagernet/gomobile/cmd/gomobile@${GOMOBILE_VERSION}"; fi
if [[ ! -x "${GOPATH_DIR}/bin/gobind" ]]; then "${GO_BIN}" install "github.com/sagernet/gomobile/cmd/gobind@${GOMOBILE_VERSION}"; fi

cd "${SOURCE_DIR}"
echo "Building official sing-box ${VERSION} libbox Android bindings for ${ANDROID_PLATFORM}. This creates an AAR only; it does not build an APK."
"${GO_BIN}" run ./cmd/internal/build_libbox -target android -platform "${ANDROID_PLATFORM}"

[[ -s "${SOURCE_DIR}/libbox.aar" ]] || { echo "Upstream build did not produce libbox.aar." >&2; exit 1; }
mkdir -p "${AAR_DIR}"
install -m 0644 "${SOURCE_DIR}/libbox.aar" "${AAR_DIR}/libbox.aar"
sha256="$(sha256sum "${AAR_DIR}/libbox.aar" | awk '{print $1}')"
printf '%s\n' "${VERSION} ${SOURCE_COMMIT} gomobile-${GOMOBILE_VERSION}" > "${AAR_DIR}/libbox.version"
printf '%s\n' "Android ABIs: ${ANDROID_PLATFORM}" >> "${AAR_DIR}/libbox.version"
printf '%s\n' "AAR SHA256: ${sha256}" >> "${AAR_DIR}/libbox.version"
rm -f "${AAR_DIR}"/libbox.aar.part-[0-9][0-9][0-9]
split --bytes="${AAR_CHUNK_BYTES}" --numeric-suffixes=0 --suffix-length=3 \
  "${AAR_DIR}/libbox.aar" "${AAR_DIR}/libbox.aar.part-"
echo "Generated libbox AAR (${sha256}) and source fragments in ${AAR_DIR}."
echo "Fragments stay below 32 MiB each; Expo Prebuild reassembles the AAR and checks this SHA-256."
echo "ABIs included in the AAR:"
unzip -Z1 "${AAR_DIR}/libbox.aar" | grep -E '^jni/[^/]+/libbox\.so$' || true
