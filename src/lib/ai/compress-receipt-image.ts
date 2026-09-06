/** Longest edge after resize — readable for OCR, far smaller than phone originals. */
export const RECEIPT_MAX_EDGE_PX = 1280;

/** Soft target after JPEG encode. */
export const RECEIPT_TARGET_BYTES = 400_000;

const INITIAL_QUALITY = 0.7;
const FALLBACK_QUALITY = 0.5;

export type CompressedReceiptImage = {
  blob: Blob;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  dataUrl: string;
};

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image. Try a JPEG or PNG."));
    };
    image.src = url;
  });
}

function scaledSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not compress that image. Try another photo."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not prepare that image."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("Could not prepare that image."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Resize + JPEG-compress a receipt photo in the browser before upload.
 * Never sends the original full-resolution file.
 */
export async function compressReceiptImage(
  file: File,
): Promise<CompressedReceiptImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a photo of the receipt.");
  }

  const image = await loadImageFromFile(file);
  const { width, height } = scaledSize(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    RECEIPT_MAX_EDGE_PX,
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not compress that image. Try another photo.");
  }
  ctx.drawImage(image, 0, 0, width, height);

  let blob = await canvasToJpegBlob(canvas, INITIAL_QUALITY);
  if (blob.size > RECEIPT_TARGET_BYTES) {
    blob = await canvasToJpegBlob(canvas, FALLBACK_QUALITY);
  }

  const dataUrl = await blobToDataUrl(blob);
  return {
    blob,
    mimeType: "image/jpeg",
    width,
    height,
    dataUrl,
  };
}

/** Strip the data-URL prefix; returns raw base64 for Gemini inlineData. */
export function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) {
    throw new Error("Invalid image data.");
  }
  return dataUrl.slice(comma + 1);
}

/** Wrap the compressed JPEG blob as a File for FormData upload. */
export function compressedReceiptToFile(
  compressed: CompressedReceiptImage,
): File {
  return new File([compressed.blob], "receipt.jpg", {
    type: compressed.mimeType,
  });
}
