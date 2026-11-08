#!/usr/bin/env bash
# Builds whisper.cpp to WebAssembly for dictation (docs/spec/06-speech.md section 1.2), from
# pinned sources, with spec 06's memory settings: 64 MB at start where the example reserves
# 512 MB, growing to 1 GB at most. Writes whisper.js (the WebAssembly is inside it), its licence,
# VERSION.txt and SHA256SUMS. CI only: it needs Emscripten, and this PC can't build it.
#
#   build-whisper.sh <work-dir> <out-dir>
set -euo pipefail

WHISPER_VERSION=v1.9.5
# The commit the tag points to, so a moved tag can't change what is built.
WHISPER_COMMIT=d1be6fde11ac6e0407606b4e42fe72d34add8037
EMSDK_VERSION=6.0.13

WORK="${1:?work dir}"
OUT="${2:?out dir}"
mkdir -p "$WORK" "$OUT"

if [ ! -f "$WORK/whisper-build/whisper.js" ]; then
  [ -d "$WORK/emsdk" ] || git clone -q --depth 1 https://github.com/emscripten-core/emsdk "$WORK/emsdk"
  (cd "$WORK/emsdk" && ./emsdk install "$EMSDK_VERSION" > /dev/null && ./emsdk activate "$EMSDK_VERSION" > /dev/null)
  # shellcheck disable=SC1091
  source "$WORK/emsdk/emsdk_env.sh" > /dev/null

  rm -rf "$WORK/whisper.cpp"
  git clone -q --depth 1 --branch "$WHISPER_VERSION" https://github.com/ggml-org/whisper.cpp "$WORK/whisper.cpp"
  actual=$(git -C "$WORK/whisper.cpp" rev-parse HEAD)
  [ "$actual" = "$WHISPER_COMMIT" ] || { echo "whisper.cpp $WHISPER_VERSION is $actual, not $WHISPER_COMMIT"; exit 1; }

  # The example's link settings, changed in three places and checked: export the file system,
  # which the worker uses to hand over the model, and spec 06's memory.
  cmake_file="$WORK/whisper.cpp/examples/whisper.wasm/CMakeLists.txt"
  sed -i \
    -e "s/'print', 'printErr', 'ccall', 'cwrap', 'HEAPU8'/'print', 'printErr', 'ccall', 'cwrap', 'HEAPU8', 'FS'/" \
    -e 's/INITIAL_MEMORY=512MB/INITIAL_MEMORY=64MB/' \
    -e 's/MAXIMUM_MEMORY=2000MB/MAXIMUM_MEMORY=1024MB/' \
    "$cmake_file"
  grep -q "'HEAPU8', 'FS'" "$cmake_file"
  grep -q 'INITIAL_MEMORY=64MB' "$cmake_file"
  grep -q 'MAXIMUM_MEMORY=1024MB' "$cmake_file"
  grep -q 'ALLOW_MEMORY_GROWTH=1' "$cmake_file"

  (cd "$WORK/whisper.cpp" &&
    emcmake cmake -B build-em -DCMAKE_BUILD_TYPE=Release -DWHISPER_WASM_SINGLE_FILE=ON > /dev/null &&
    cmake --build build-em -j"$(nproc)" --target libmain > /dev/null)

  mkdir -p "$WORK/whisper-build"
  cp "$WORK/whisper.cpp/build-em/bin/whisper.wasm/main.js" "$WORK/whisper-build/whisper.js"
  cp "$WORK/whisper.cpp/LICENSE" "$WORK/whisper-build/LICENSE-whisper.cpp.txt"
  cp "$WORK/whisper.cpp/samples/jfk.wav" "$WORK/whisper-build/jfk.wav"
  echo "whisper.cpp $WHISPER_VERSION ($WHISPER_COMMIT), Emscripten $EMSDK_VERSION, INITIAL_MEMORY=64MB, MAXIMUM_MEMORY=1024MB" \
    > "$WORK/whisper-build/VERSION.txt"
fi

cp "$WORK/whisper-build/whisper.js" "$WORK/whisper-build/LICENSE-whisper.cpp.txt" "$WORK/whisper-build/VERSION.txt" "$OUT/"
(cd "$OUT" && sha256sum whisper.js > SHA256SUMS)
cat "$OUT/VERSION.txt" "$OUT/SHA256SUMS"
ls -l "$OUT"
