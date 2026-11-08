#!/usr/bin/env bash
# Builds whisper.cpp to WebAssembly for dictation (docs/spec/06-speech.md section 1.2), from
# pinned sources. Writes whisper.js (the WebAssembly is inside it), its licence, VERSION.txt and
# SHA256SUMS. CI only: it needs Emscripten, and this PC can't build it.
#
#   build-whisper.sh <work-dir> <out-dir>
#
# Settings, each a change to whisper.cpp's own example, applied and checked:
#   WHISPER_INITIAL_MEMORY  memory at start (the example's is 512MB; spec 06 asks for less)
#   WHISPER_MAXIMUM_MEMORY  the most it may grow to (the example's is 2000MB)
#   WHISPER_INCOMING=1      add mainScriptUrlOrBlob to Emscripten's own list of module settings it
#                           reads, so whisper's threads load whisper.js, not the worker's script.
#                           The rest of the list stays as Emscripten 6.0.13 has it: a shorter list
#                           hangs whisper's threads (CI, 8 Nov 2026)
#   WHISPER_POOL            threads made at start (the example makes them as it goes)
set -euo pipefail

WHISPER_VERSION=v1.9.5
# The commit the tag points to, so a moved tag can't change what is built.
WHISPER_COMMIT=d1be6fde11ac6e0407606b4e42fe72d34add8037
EMSDK_VERSION=6.0.13
# Spec 06 section 1.2: 64 MB at start, 1 GB at most. To measure at M1.
INITIAL_MEMORY="${WHISPER_INITIAL_MEMORY:-64MB}"
MAXIMUM_MEMORY="${WHISPER_MAXIMUM_MEMORY:-1024MB}"
INCOMING="${WHISPER_INCOMING:-1}"
POOL="${WHISPER_POOL:-0}"
SETTINGS="INITIAL_MEMORY=$INITIAL_MEMORY, MAXIMUM_MEMORY=$MAXIMUM_MEMORY, INCOMING=$INCOMING, POOL=$POOL"

WORK="${1:?work dir}"
OUT="${2:?out dir}"
mkdir -p "$WORK" "$OUT"
TAG=$(echo "$SETTINGS" | tr -c 'A-Za-z0-9' '-')
BUILT="$WORK/whisper-build-$TAG"

if [ ! -f "$BUILT/whisper.js" ]; then
  [ -d "$WORK/emsdk" ] || git clone -q --depth 1 https://github.com/emscripten-core/emsdk "$WORK/emsdk"
  (cd "$WORK/emsdk" && ./emsdk install "$EMSDK_VERSION" > /dev/null && ./emsdk activate "$EMSDK_VERSION" > /dev/null)
  # shellcheck disable=SC1091
  source "$WORK/emsdk/emsdk_env.sh" > /dev/null

  if [ ! -d "$WORK/whisper.cpp" ]; then
    git clone -q --depth 1 --branch "$WHISPER_VERSION" https://github.com/ggml-org/whisper.cpp "$WORK/whisper.cpp"
  fi
  actual=$(git -C "$WORK/whisper.cpp" rev-parse HEAD)
  [ "$actual" = "$WHISPER_COMMIT" ] || { echo "whisper.cpp $WHISPER_VERSION is $actual, not $WHISPER_COMMIT"; exit 1; }

  cmake_file="$WORK/whisper.cpp/examples/whisper.wasm/CMakeLists.txt"
  git -C "$WORK/whisper.cpp" checkout -q -- examples/whisper.wasm/CMakeLists.txt
  # Always: export the file system, which hands over the model.
  sed -i "s/'print', 'printErr', 'ccall', 'cwrap', 'HEAPU8'/'print', 'printErr', 'ccall', 'cwrap', 'HEAPU8', 'FS'/" "$cmake_file"
  grep -q "'HEAPU8', 'FS'" "$cmake_file"
  sed -i -e "s/INITIAL_MEMORY=512MB/INITIAL_MEMORY=$INITIAL_MEMORY/" -e "s/MAXIMUM_MEMORY=2000MB/MAXIMUM_MEMORY=$MAXIMUM_MEMORY/" "$cmake_file"
  grep -q "INITIAL_MEMORY=$INITIAL_MEMORY" "$cmake_file"
  grep -q "MAXIMUM_MEMORY=$MAXIMUM_MEMORY" "$cmake_file"
  if [ "$INCOMING" = 1 ]; then
    sed -i 's/-s FORCE_FILESYSTEM=1/-s FORCE_FILESYSTEM=1 -s INCOMING_MODULE_JS_API=\\"[ENVIRONMENT,arguments,canvas,dynamicLibraries,elementPointerLock,instantiateWasm,locateFile,monitorRunDependencies,noExitRuntime,noInitialRun,onAbort,onExit,onRuntimeInitialized,postRun,preInit,preRun,print,printErr,setStatus,statusMessage,stderr,stdin,stdout,thisProgram,wasm,websocket,mainScriptUrlOrBlob]\\"/' "$cmake_file"
    grep -qF 'INCOMING_MODULE_JS_API=\"[ENVIRONMENT,arguments,canvas,dynamicLibraries,elementPointerLock,instantiateWasm,locateFile,monitorRunDependencies,noExitRuntime,noInitialRun,onAbort,onExit,onRuntimeInitialized,postRun,preInit,preRun,print,printErr,setStatus,statusMessage,stderr,stdin,stdout,thisProgram,wasm,websocket,mainScriptUrlOrBlob]\"' "$cmake_file"
  fi
  if [ "$POOL" != 0 ]; then
    sed -i "s/-s PTHREAD_POOL_SIZE_STRICT=0/-s PTHREAD_POOL_SIZE_STRICT=0 -s PTHREAD_POOL_SIZE=$POOL/" "$cmake_file"
    grep -q "PTHREAD_POOL_SIZE=$POOL" "$cmake_file"
  fi

  rm -rf "$WORK/whisper.cpp/build-em"
  (cd "$WORK/whisper.cpp" &&
    emcmake cmake -B build-em -DCMAKE_BUILD_TYPE=Release -DWHISPER_WASM_SINGLE_FILE=ON > /dev/null &&
    cmake --build build-em -j"$(nproc)" --target libmain > /dev/null)

  mkdir -p "$BUILT"
  cp "$WORK/whisper.cpp/build-em/bin/whisper.wasm/main.js" "$BUILT/whisper.js"
  cp "$WORK/whisper.cpp/LICENSE" "$BUILT/LICENSE-whisper.cpp.txt"
  cp "$WORK/whisper.cpp/samples/jfk.wav" "$WORK/jfk.wav"
  echo "whisper.cpp $WHISPER_VERSION ($WHISPER_COMMIT), Emscripten $EMSDK_VERSION, $SETTINGS" > "$BUILT/VERSION.txt"
fi

cp "$BUILT/whisper.js" "$BUILT/LICENSE-whisper.cpp.txt" "$BUILT/VERSION.txt" "$OUT/"
(cd "$OUT" && sha256sum whisper.js > SHA256SUMS)
cat "$OUT/VERSION.txt" "$OUT/SHA256SUMS"
