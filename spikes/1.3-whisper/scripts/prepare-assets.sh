#!/usr/bin/env bash
# Spike 1.3: prepares everything the page needs in spikes/1.3-whisper/public/ (not committed):
#   - whisper.cpp built to WebAssembly from a pinned release, with a pinned Emscripten;
#   - the tiny English model, full size and quantised, from whisper.cpp's model repository,
#     each checked against its SHA-256 (so the device only ever loads from our own site);
#   - two test clips: a 5-second request made with espeak-ng (a build tool; only its output is
#     used), and whisper.cpp's public-domain sample (President Kennedy, 1961);
#   - coi-serviceworker, so GitHub Pages pages are cross-origin isolated (whisper uses threads).
# Usage: prepare-assets.sh <work-dir>   (run from spikes/1.3-whisper)
set -euo pipefail

WHISPER_VERSION=v1.9.5
EMSDK_VERSION=6.0.13
WORK="${1:?work dir}"
OUT="$(pwd)/public"
mkdir -p "$WORK" "$OUT/models" "$OUT/clips"

# --- whisper.cpp in WebAssembly ----------------------------------------------------------------
if [ ! -f "$WORK/whisper-build/main.js" ]; then
  [ -d "$WORK/emsdk" ] || git clone -q --depth 1 https://github.com/emscripten-core/emsdk "$WORK/emsdk"
  (cd "$WORK/emsdk" && ./emsdk install "$EMSDK_VERSION" > /dev/null && ./emsdk activate "$EMSDK_VERSION" > /dev/null)
  # shellcheck disable=SC1091
  source "$WORK/emsdk/emsdk_env.sh" > /dev/null
  rm -rf "$WORK/whisper.cpp"
  git clone -q --depth 1 --branch "$WHISPER_VERSION" https://github.com/ggml-org/whisper.cpp "$WORK/whisper.cpp"
  # The example doesn't export Emscripten's file system, which the page needs to hand over the
  # model: add 'FS' to its exported runtime methods. Nothing else is changed.
  sed -i "s/'print', 'printErr', 'ccall', 'cwrap', 'HEAPU8'/'print', 'printErr', 'ccall', 'cwrap', 'HEAPU8', 'FS'/" \
    "$WORK/whisper.cpp/examples/whisper.wasm/CMakeLists.txt"
  grep -q "'HEAPU8', 'FS'" "$WORK/whisper.cpp/examples/whisper.wasm/CMakeLists.txt"
  (cd "$WORK/whisper.cpp" && emcmake cmake -B build-em -DCMAKE_BUILD_TYPE=Release > /dev/null && cmake --build build-em -j"$(nproc)" --target libmain > /dev/null)
  mkdir -p "$WORK/whisper-build"
  cp "$WORK/whisper.cpp/build-em/bin/whisper.wasm/main.js" "$WORK/whisper-build/main.js"
  cp "$WORK/whisper.cpp/samples/jfk.wav" "$WORK/whisper-build/jfk.wav"
  cp "$WORK/whisper.cpp/LICENSE" "$WORK/whisper-build/LICENSE-whisper.cpp.txt"
  echo "whisper.cpp $WHISPER_VERSION, Emscripten $EMSDK_VERSION" > "$WORK/whisper-build/VERSION.txt"
fi
cp "$WORK/whisper-build/main.js" "$WORK/whisper-build/VERSION.txt" "$WORK/whisper-build/LICENSE-whisper.cpp.txt" "$OUT/"
cp "$WORK/whisper-build/jfk.wav" "$OUT/clips/jfk.wav"

# --- models, checked ---------------------------------------------------------------------------
fetch() { # name sha256
  local file="$WORK/models/$1"
  mkdir -p "$WORK/models"
  if [ ! -f "$file" ] || ! echo "$2  $file" | sha256sum -c --status; then
    curl -sSfL "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$1" -o "$file"
  fi
  echo "$2  $file" | sha256sum -c --status || { echo "SHA-256 mismatch for $1"; exit 1; }
  cp "$file" "$OUT/models/$1"
}
fetch ggml-tiny.en.bin 921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f
fetch ggml-tiny.en-q5_1.bin c77c5766f1cef09b6b7d47f21b546cbddd4157886b3b5d6d4f709e91e66c7c2b

# --- a 5-second request ------------------------------------------------------------------------
command -v espeak-ng > /dev/null || (sudo apt-get update -qq && sudo apt-get install -y -qq espeak-ng > /dev/null)
espeak-ng -v en-gb -s 150 -w "$OUT/clips/request.wav" "Make the cat walk to the tree, and then wave hello."

# --- cross-origin isolation on GitHub Pages ----------------------------------------------------
cp node_modules/coi-serviceworker/coi-serviceworker.min.js "$OUT/"
ls -l "$OUT" "$OUT/models" "$OUT/clips"
