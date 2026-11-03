const MAX_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 1200;

function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Format gambar tidak didukung'));
    };
    image.src = url;
  });
}

export async function compressImage(file: File): Promise<Blob> {
  if (!/^image\//.test(file.type)) throw new Error('File harus berupa gambar');
  if (file.size > MAX_BYTES) throw new Error('Ukuran gambar maksimal 8 MB');

  const source = await loadBitmap(file);
  const width = 'width' in source ? source.width : 0;
  const height = 'height' in source ? source.height : 0;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas tidak tersedia');
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();

  const supportsWebp = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  const type = supportsWebp ? 'image/webp' : 'image/jpeg';
  const quality = supportsWebp ? 0.82 : 0.85;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Gagal mengompres gambar'))),
      type,
      quality,
    );
  });
}
