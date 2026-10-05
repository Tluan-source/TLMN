type JpegInfo = { orientation: number; width: number; height: number };

// Reads the EXIF orientation (1–8) and the stored pixel size from a JPEG header.
// Front-camera photos are often saved sideways or flipped with only this tag saying how to show them.
export function readJpegInfo(buffer: ArrayBuffer): JpegInfo {
  const view = new DataView(buffer);
  const info: JpegInfo = { orientation: 1, width: 0, height: 0 };
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return info;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xff) { offset += 1; continue; }
    if (marker === 0xd9 || marker === 0xda) break;
    const length = view.getUint16(offset + 2);
    const start = offset + 4;
    if (marker === 0xe1 && start + 14 <= view.byteLength && view.getUint32(start) === 0x45786966 && view.getUint16(start + 4) === 0) {
      const tiff = start + 6;
      const little = view.getUint16(tiff) === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      if (ifd + 2 <= view.byteLength) {
        const entries = view.getUint16(ifd, little);
        for (let index = 0; index < entries; index += 1) {
          const entry = ifd + 2 + index * 12;
          if (entry + 12 > view.byteLength) break;
          if (view.getUint16(entry, little) === 0x0112) {
            const value = view.getUint16(entry + 8, little);
            if (value >= 1 && value <= 8) info.orientation = value;
            break;
          }
        }
      }
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc && start + 5 <= view.byteLength) {
      info.height = view.getUint16(start + 1);
      info.width = view.getUint16(start + 3);
    }
    offset = start + length - 2;
  }
  return info;
}

// Most current browsers apply EXIF orientation when an <img> is drawn to a canvas, some older ones and in-app webviews don't.
function browserAppliedOrientation(image: HTMLImageElement, info: JpegInfo) {
  if (info.orientation >= 5 && info.width && info.height && info.width !== info.height) {
    return image.naturalWidth === info.height && image.naturalHeight === info.width;
  }
  return typeof CSS !== 'undefined' && CSS.supports('image-orientation', 'from-image');
}

// Canvas transforms that turn the stored pixels upright, for an output canvas of width w and height h.
function orientationTransform(orientation: number, w: number, h: number): [number, number, number, number, number, number] {
  switch (orientation) {
    case 2: return [-1, 0, 0, 1, w, 0];
    case 3: return [-1, 0, 0, -1, w, h];
    case 4: return [1, 0, 0, -1, 0, h];
    case 5: return [0, 1, 1, 0, 0, 0];
    case 6: return [0, 1, -1, 0, w, 0];
    case 7: return [0, -1, -1, 0, w, h];
    case 8: return [0, -1, 1, 0, 0, h];
    default: return [1, 0, 0, 1, 0, 0];
  }
}

// Phone camera photos are often 3–10 MB; shrink them before upload so sending stays fast on mobile data.
// Rotated or mirrored JPEGs are always redrawn upright, so every viewer sees them the way the camera showed them.
export async function shrinkImage(file: File, maxSide = 2048, quality = 0.85): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file;
  const info = file.type === 'image/jpeg' ? readJpegInfo(await file.slice(0, 256 * 1024).arrayBuffer()) : { orientation: 1, width: 0, height: 0 };
  const needsUpright = info.orientation !== 1;
  if (!needsUpright && file.size <= 1024 * 1024) return file;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const applied = !needsUpright || browserAppliedOrientation(image, info);
    const swap = !applied && info.orientation >= 5;
    const uprightWidth = swap ? image.naturalHeight : image.naturalWidth;
    const uprightHeight = swap ? image.naturalWidth : image.naturalHeight;
    const scale = Math.min(1, maxSide / Math.max(uprightWidth, uprightHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(uprightWidth * scale);
    canvas.height = Math.round(uprightHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) return file;
    if (!applied) context.setTransform(...orientationTransform(info.orientation, canvas.width, canvas.height));
    context.drawImage(image, 0, 0, swap ? canvas.height : canvas.width, swap ? canvas.width : canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || (!needsUpright && blob.size >= file.size)) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
