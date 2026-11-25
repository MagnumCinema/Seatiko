import { DomainError } from '../../core/errors/domain-error.js';

export const MAX_IMAGE_BYTES = 5 << 20;
/** Decompression bomb guard (a small file declaring 40000×40000 pixels). */
const MAX_PIXELS = 40_000_000;

/** JPEG, PNG or WebP by magic bytes; SVG and anything else is rejected whatever the name says. */
export function sniffImage(data: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | undefined {
  const b = data;
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  return undefined;
}

const tooLarge = () => new DomainError('file_too_large', 413);
const unsupported = () => new DomainError('unsupported_image', 415);

/**
 * Square JPEG of up to `size` px, centre-cropped, transparency flattened on white.
 * Re-encoding drops EXIF and anything embedded (as media.ProcessAvatar in Go).
 */
export async function squareJpeg(data: Uint8Array, size = 512): Promise<Uint8Array> {
  if (data.length > MAX_IMAGE_BYTES) throw tooLarge();
  if (!sniffImage(data)) throw unsupported();
  try {
    const { default: sharp } = await import('sharp');
    const img = sharp(data, { limitInputPixels: MAX_PIXELS, failOn: 'error' });
    const meta = await img.metadata();
    const side = Math.min(meta.width ?? 0, meta.height ?? 0);
    if (!side) throw unsupported();
    const out = Math.min(side, size);
    return new Uint8Array(
      await img.rotate().resize(out, out, { fit: 'cover', position: 'centre' }).flatten({ background: '#ffffff' }).jpeg({ quality: 86 }).toBuffer(),
    );
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw unsupported();
  }
}

/** Venue photo: longest side up to `max` px, JPEG, EXIF dropped. */
export async function photoJpeg(data: Uint8Array, max = 1600): Promise<Uint8Array> {
  if (data.length > MAX_IMAGE_BYTES) throw tooLarge();
  if (!sniffImage(data)) throw unsupported();
  try {
    const { default: sharp } = await import('sharp');
    return new Uint8Array(
      await sharp(data, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
        .rotate()
        .resize(max, max, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 86 })
        .toBuffer(),
    );
  } catch {
    throw unsupported();
  }
}
