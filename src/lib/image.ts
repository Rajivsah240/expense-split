/**
 * Receipt photos off a modern phone are 4–8 MB, which is slow to upload on
 * mobile data and pointless for OCR. Downscale and re-encode in the browser
 * before it ever leaves the device.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.82;

export interface PreparedImage {
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('That file does not look like an image.'));
    image.src = source;
  });
}

export async function prepareReceiptImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a photo of the receipt.');

  const original = await readAsDataUrl(file);
  const image = await loadImage(original);

  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    // Very old browsers: send the original and let the server size limit apply.
    return { dataUrl: original, mimeType: file.type, width: image.naturalWidth, height: image.naturalHeight, bytes: file.size };
  }

  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);

  const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
  return {
    dataUrl,
    mimeType: 'image/jpeg',
    width,
    height,
    bytes: Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75),
  };
}
