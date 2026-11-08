#!/usr/bin/env bash
# For the browser test only: the bundled model, checked against its pin (spec 06 section 1.3),
# and whisper.cpp's public-domain sample clip, President Kennedy in 1961. In the app the native
# layer hands the model over; here the harness page serves it.
#
#   fetch-test-assets.sh <work-dir> <out-dir>
set -euo pipefail

WORK="${1:?work dir}"
OUT="${2:?out dir}"
MODEL=ggml-tiny.en-q5_1.bin
PIN=c77c5766f1cef09b6b7d47f21b546cbddd4157886b3b5d6d4f709e91e66c7c2b
mkdir -p "$WORK/models" "$OUT"

file="$WORK/models/$MODEL"
if [ ! -f "$file" ] || ! echo "$PIN  $file" | sha256sum -c --status; then
  curl -sSfL "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$MODEL" -o "$file"
fi
echo "$PIN  $file" | sha256sum -c --status || { echo "SHA-256 mismatch for $MODEL"; exit 1; }
cp "$file" "$OUT/model.bin"
cp "$WORK/jfk.wav" "$OUT/jfk.wav"
ls -l "$OUT"
