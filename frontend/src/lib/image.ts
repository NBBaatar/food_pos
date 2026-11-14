interface ImageDataUrlOptions {
  maxSize?: number;
  maxBytes?: number;
  quality?: number;
}

/** Зургийг уншиж, хадгалахад тохиромжтой хэмжээгээр багасгасан data URL болгоно */
export async function imageFileToDataUrl(
  file: File,
  { maxSize = 400, maxBytes = 4 * 1024 * 1024, quality = 0.9 }: ImageDataUrlOptions = {},
): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Зөвхөн зураг оруулна уу');
  if (file.size > maxBytes) throw new Error(`Зураг ${Math.round(maxBytes / 1024 / 1024)}MB-аас бага байх ёстой`);

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Зургийг уншиж чадсангүй'));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Зургийг нээж чадсангүй'));
    img.src = dataUrl;
  });

  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', quality);
}
