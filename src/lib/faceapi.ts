// Utilitas face recognition berbasis @vladmandic/face-api (berjalan di browser)
import * as faceapi from "@vladmandic/face-api";

const MODEL_URL = "/models";
let modelsLoaded = false;

// Muat model sekali saja
export async function loadModels(): Promise<void> {
  if (modelsLoaded) return;
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
  modelsLoaded = true;
}

export function detectorOptions() {
  return new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
}

// Ambil satu wajah + descriptor 128-d dari elemen video/gambar
export async function getFaceDescriptor(
  input: HTMLVideoElement | HTMLImageElement
): Promise<Float32Array | null> {
  const result = await faceapi
    .detectSingleFace(input, detectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();
  return result ? result.descriptor : null;
}

// Ambil wajah lengkap (untuk deteksi kedip / liveness)
export async function getFullFace(input: HTMLVideoElement) {
  return faceapi
    .detectSingleFace(input, detectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();
}

// Jarak Euclidean antar dua descriptor
export function distance(a: Float32Array | number[], b: Float32Array | number[]): number {
  return faceapi.euclideanDistance(a as number[], b as number[]);
}

// Cocokkan descriptor live terhadap kumpulan descriptor tersimpan.
// Kembalikan jarak TERKECIL.
export function bestMatchDistance(
  live: Float32Array | number[],
  stored: number[][]
): number {
  let min = Infinity;
  for (const d of stored) {
    const dist = distance(live, d);
    if (dist < min) min = dist;
  }
  return min;
}

// Hitung Eye Aspect Ratio (EAR) untuk deteksi kedip.
// Landmark 68: mata kiri = 36..41, mata kanan = 42..47
function ear(points: faceapi.Point[]): number {
  const dist = (p: faceapi.Point, q: faceapi.Point) =>
    Math.hypot(p.x - q.x, p.y - q.y);
  const A = dist(points[1], points[5]);
  const B = dist(points[2], points[4]);
  const C = dist(points[0], points[3]);
  return (A + B) / (2 * C);
}

// Rata-rata EAR kedua mata dari landmark wajah
export function eyeAspectRatio(landmarks: faceapi.FaceLandmarks68): number {
  const left = landmarks.getLeftEye();
  const right = landmarks.getRightEye();
  return (ear(left) + ear(right)) / 2;
}

export { faceapi };
