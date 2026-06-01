export interface PickedImage {
  base64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
  fileSizeBytes: number;
  source: 'camera' | 'gallery';
}
