// Server-side check for uploaded JPEG data URLs (profile portraits).
// The app re-encodes every photo through a canvas, which already drops EXIF,
// but a modified client could send a JPEG that still carries GPS coordinates,
// camera serials or comments. Those would reach every match once the veil
// lifts, so the server strips all metadata segments itself.

const PREFIX = "data:image/jpeg;base64,";

/**
 * Removes APP1–APP15 (EXIF, XMP, ICC, maker notes …) and COM segments from a
 * JPEG, keeping APP0 (JFIF) and everything needed to decode the image.
 * Returns null when the bytes are not a well-formed JPEG header.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const out: number[] = [0xff, 0xd8];
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    // Fill bytes (0xFF padding) are allowed before a marker.
    while (i < bytes.length && bytes[i] === 0xff) i++;
    if (i >= bytes.length) return null;
    const marker = bytes[i];
    i++;
    // Standalone markers without a length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(0xff, marker);
      continue;
    }
    if (marker === 0xd9) {
      out.push(0xff, 0xd9);
      return Uint8Array.from(out);
    }
    if (i + 2 > bytes.length) return null;
    const length = (bytes[i] << 8) | bytes[i + 1];
    if (length < 2 || i + length > bytes.length) return null;
    const segment = bytes.subarray(i - 2, i + length);
    i += length;
    if (marker === 0xda) {
      // Start of scan: the rest is entropy-coded image data, keep it as is.
      const rest = new Uint8Array(out.length + segment.length + (bytes.length - i));
      rest.set(out, 0);
      rest.set(segment, out.length);
      rest.set(bytes.subarray(i), out.length + segment.length);
      return rest;
    }
    const isMetadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!isMetadata) for (const b of segment) out.push(b);
  }
  return null;
}

/** Validates a portrait data URL and returns a metadata-free copy, or null. */
export function cleanJpegDataUrl(value: string, maxLength: number): string | null {
  if (!value.startsWith(PREFIX) || value.length > maxLength) return null;
  const base64 = value.slice(PREFIX.length);
  if (base64.length < 100 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  if (bytes[2] !== 0xff) return null;
  const clean = stripJpegMetadata(bytes);
  if (!clean) return null;
  return PREFIX + Buffer.from(clean).toString("base64");
}
