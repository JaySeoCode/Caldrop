/**
 * Image preparation for the model. Server-only: it decodes the upload with sharp.
 */
import 'server-only';
import sharp from 'sharp';
import type { ImageInput } from '@/lib/ai/client';
import type { ImageTools } from '@/lib/ai/analyze';

/** The model scales anything larger down to this anyway, so sending more only costs upload time. */
const MAX_SIDE = 2048;

function decode(image: ImageInput): Buffer {
  const comma = image.dataUrl.indexOf(',');
  return Buffer.from(image.dataUrl.slice(comma + 1), 'base64');
}

async function encode(pipeline: sharp.Sharp, png: boolean): Promise<ImageInput> {
  const bytes = png
    ? await pipeline.png().toBuffer()
    : await pipeline.jpeg({ quality: 90 }).toBuffer();
  return { dataUrl: `data:image/${png ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}` };
}

export const sharpImageTools: ImageTools = {
  /**
   * Applies the EXIF orientation and drops the metadata, so the pixels the
   * model sees are the pixels we rotate. Screenshots stay PNG for crisp text.
   */
  async normalize(image) {
    const png = image.dataUrl.startsWith('data:image/png');
    const pipeline = sharp(decode(image))
      .rotate()
      .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true });
    return encode(pipeline, png);
  },
  async rotate(image, degrees) {
    const png = image.dataUrl.startsWith('data:image/png');
    return encode(sharp(decode(image)).rotate(degrees), png);
  },
};
