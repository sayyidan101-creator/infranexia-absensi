#!/usr/bin/env bash
# Unduh model face-api.js ke public/models
set -e
BASE="https://raw.githubusercontent.com/vladmandic/face-api/master/model"
DIR="public/models"
mkdir -p "$DIR"
FILES=(
  "tiny_face_detector_model-weights_manifest.json"
  "tiny_face_detector_model.bin"
  "face_landmark_68_model-weights_manifest.json"
  "face_landmark_68_model.bin"
  "face_recognition_model-weights_manifest.json"
  "face_recognition_model-shard1"
  "face_recognition_model-shard2"
)
for f in "${FILES[@]}"; do
  echo "Mengunduh $f ..."
  curl -fsSL "$BASE/$f" -o "$DIR/$f"
done
echo "Selesai. Model tersimpan di $DIR"
