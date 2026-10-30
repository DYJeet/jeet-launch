/** Admission checks for creation previews; this module never uploads a file. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_LOGO_DIMENSION = 4096;
export function validateImageDimensions(w: number, h: number) {
  if (
    !Number.isInteger(w) ||
    !Number.isInteger(h) ||
    w < 1 ||
    h < 1 ||
    w > MAX_LOGO_DIMENSION ||
    h > MAX_LOGO_DIMENSION
  )
    throw Error("Image dimensions must be between 1 and 4096 pixels.");
}
export function validateImageBytes(b: Uint8Array, mime: string) {
  if (!b.length || b.length > MAX_LOGO_BYTES)
    throw Error("Image must contain data and be 2 MB or smaller.");
  const text = (p: number, n: number) =>
    String.fromCharCode(...b.subarray(p, p + n));
  const png =
      b.length >= 24 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((x, i) => b[i] === x) &&
      text(12, 4) === "IHDR",
    jpeg = b.length >= 12 && b[0] === 255 && b[1] === 216 && b[2] === 255,
    webp = b.length >= 12 && text(0, 4) === "RIFF" && text(8, 4) === "WEBP";
  if (!{ "image/png": png, "image/jpeg": jpeg, "image/webp": webp }[mime])
    throw Error("Image contents must match a PNG, JPG, or WEBP file.");
  if (png) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    validateImageDimensions(v.getUint32(16, false), v.getUint32(20, false));
  }
}
export async function validateImageUpload(file: File) {
  validateImageBytes(new Uint8Array(await file.arrayBuffer()), file.type);
  if (typeof createImageBitmap === "function") {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw Error(
        "Image contents could not be decoded. Choose a complete PNG, JPG, or WEBP.",
      );
    }
    try {
      validateImageDimensions(bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
    return;
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new globalThis.Image();
    image.src = url;
    await image.decode();
    validateImageDimensions(image.naturalWidth, image.naturalHeight);
  } catch {
    throw Error("Image could not be decoded or exceeds 4096 pixels.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
