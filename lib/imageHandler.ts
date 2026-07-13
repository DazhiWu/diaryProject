export interface ImageUploadResult { path: string; url: string }

export async function compressImage(file: File, maxWidth = 1920, quality = 0.8): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas'); const context = canvas.getContext('2d'); const image = new Image()
    image.onload = () => { const ratio = image.width / image.height; const width = Math.min(image.width, maxWidth); canvas.width = width; canvas.height = width / ratio; context?.drawImage(image, 0, 0, canvas.width, canvas.height); canvas.toBlob((blob) => blob ? resolve(new File([blob], `${file.name.replace(/\.[^.]*$/u, '')}.webp`, { type: 'image/webp', lastModified: Date.now() })) : reject(new Error('压缩图片失败')), 'image/webp', quality) }
    image.onerror = () => reject(new Error('加载图片失败')); image.src = URL.createObjectURL(file)
  })
}

export function getImageUrl(path: string, bucket: string): string {
  if (bucket === '2024To2025_diary_images') return `/api/media/diary?path=${encodeURIComponent(path)}`
  if (bucket === '2025_Summary_Images') return `/api/media/yearly?path=${encodeURIComponent(path)}`
  throw new Error('Unsupported media bucket')
}

export function getMultipleImageUrls(paths: string[], bucket: string): string[] { return paths.map((path) => getImageUrl(path, bucket)) }
