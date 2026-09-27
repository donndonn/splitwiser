/** Avatars render at most ~56px, so 512px covers any screen density. */
export const AVATAR_EDGE_PX = 512;

const AVATAR_QUALITY = 0.85;

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

/**
 * Center-crop a photo to a square and JPEG-encode it in the browser, so the
 * original full-resolution file is never uploaded.
 */
export async function compressAvatarImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a photo.");
  }
  const image = await loadImageFromFile(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const side = Math.min(width, height);
  const edge = Math.min(AVATAR_EDGE_PX, side);

  const canvas = document.createElement("canvas");
  canvas.width = edge;
  canvas.height = edge;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not prepare that photo. Try another one.");
  }
  ctx.drawImage(
    image,
    (width - side) / 2,
    (height - side) / 2,
    side,
    side,
    0,
    0,
    edge,
    edge,
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", AVATAR_QUALITY),
  );
  if (!blob) {
    throw new Error("Could not prepare that photo. Try another one.");
  }
  return new File([blob], "avatar.jpg", { type: "image/jpeg" });
}
