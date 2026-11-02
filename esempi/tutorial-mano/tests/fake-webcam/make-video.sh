#!/usr/bin/env bash
# Builds a "fake webcam" video for Chromium from a public photo of a hand (thumbs up) used by
# the MediaPipe tests. Needs curl and ffmpeg. Chromium accepts the MJPEG format with
# --use-file-for-fake-video-capture.
set -euo pipefail
cd "$(dirname "$0")"
[ -s thumb_up.jpg ] || curl -sfL -o thumb_up.jpg "https://storage.googleapis.com/mediapipe-assets/thumb_up.jpg"
# The photo is scaled into a 360x380 box and placed in the middle of a 640x480 beige frame.
ffmpeg -y -v error -loop 1 -t 8 -i thumb_up.jpg \
  -vf "scale=360:380:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2:color=0xd8d4cc,setsar=1,fps=30,format=yuvj420p" \
  -c:v mjpeg -q:v 4 -f mjpeg hand.mjpeg
echo "created tests/fake-webcam/hand.mjpeg"
