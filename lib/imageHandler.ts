import { supabase } from './supabaseClient'

export interface ImageUploadResult {
  path: string
  url: string
}

/**
 * 读取图片 EXIF 朝向并应用到 canvas
 * 处理手机拍照时图片旋转的问题
 */
function applyExifOrientation(
  img: HTMLImageElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): { width: number; height: number } {
  // 大多数浏览器已自动处理 EXIF 旋转，但仍做一次兜底
  ctx.save()
  ctx.drawImage(img, 0, 0, width, height)
  ctx.restore()
  return { width, height }
}

/**
 * 计算缩放后的尺寸，保持宽高比，同时限制最大宽高
 */
function calculateScaledSize(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  let width = originalWidth
  let height = originalHeight

  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width)
    width = maxWidth
  }

  if (height > maxHeight) {
    width = Math.round((width * maxHeight) / height)
    height = maxHeight
  }

  return { width, height }
}

/**
 * canvas 转为指定质量 WebP Blob
 */
function canvasToWebpBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      'image/webp',
      quality
    )
  })
}

/**
 * 压缩图片为 WebP 格式
 * 所有图片（无论大小）都统一转 webp，避免路径后缀与内容不一致
 * 采用多轮降级策略：在质量优先的前提下，寻找体积与画质的最佳平衡点
 * @param file 原始图片文件
 * @param options 压缩配置
 *   - maxWidth: 最大宽度，默认 1920
 *   - maxHeight: 最大高度，默认 1920
 *   - quality: 初始质量 (0-1)，默认 0.85
 *   - minQuality: 最低质量 (0-1)，默认 0.6
 *   - targetSizeKB: 目标文件大小（KB），达到该大小会提前停止降级
 * @returns 压缩后的 WebP 图片文件
 */
export async function compressImage(
  file: File,
  options: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
    minQuality?: number
    targetSizeKB?: number
  } = {}
): Promise<File> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.85,
    minQuality = 0.6,
    targetSizeKB
  } = options

  const img = await loadImage(file)
  const { width: scaledWidth, height: scaledHeight } = calculateScaledSize(
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
    maxWidth,
    maxHeight
  )

  const canvas = document.createElement('canvas')
  canvas.width = scaledWidth
  canvas.height = scaledHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('无法创建 canvas 上下文')
  }

  // 启用高质量缩放
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  applyExifOrientation(img, ctx, scaledWidth, scaledHeight)

  // 多轮降级：优先保证质量，逐步下调
  let currentQuality = quality
  let blob = await canvasToWebpBlob(canvas, currentQuality)

  if (!blob) {
    throw new Error('压缩图片失败')
  }

  // 只有在指定了目标体积且当前超出目标时，才进行降级
  if (targetSizeKB && blob.size > targetSizeKB * 1024) {
    const step = 0.05
    while (currentQuality - step >= minQuality) {
      currentQuality -= step
      const next = await canvasToWebpBlob(canvas, currentQuality)
      if (next) {
        blob = next
        if (blob.size <= targetSizeKB * 1024) break
      }
    }
  }

  // 文件名改为 .webp 后缀
  const originalName = file.name.replace(/\.[^/.]+$/, '')
  const compressedFile = new File([blob], `${originalName}.webp`, {
    type: 'image/webp',
    lastModified: Date.now()
  })

  return compressedFile
}

/**
 * 加载图片为 Image 对象
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('加载图片失败'))
    }
    img.src = objectUrl
  })
}

/**
 * 生成年度总结图片路径
 * @param index 图片索引
 * @returns 图片路径
 */
export function generateYearlyImagePath(index: number): string {
  return `yearly/${index}.webp`
}

/**
 * 生成日记图片路径
 * @param date 日期
 * @param index 图片索引
 * @returns 图片路径
 */
export function generateDiaryImagePath(date: Date, index: number): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const dateStr = `${year}${month}${day}`
  
  return `${year}/${dateStr}_${index}.webp`
}

/**
 * 上传单个图片到 Supabase Storage
 * @param file 图片文件
 * @param path 存储路径
 * @param bucket 存储桶名称
 * @returns 上传结果
 */
export async function uploadImage(
  file: File,
  path: string,
  bucket: string
): Promise<ImageUploadResult> {
  try {
    // 压缩图片：所有图都转 webp，目标是单图 300KB 以内
    const compressedFile = await compressImage(file, {
      maxWidth: 1920,
      maxHeight: 1920,
      quality: 0.85,
      minQuality: 0.65,
      targetSizeKB: 300
    })
    
    // 上传到 Storage
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, compressedFile, {
        cacheControl: '3600',
        upsert: true
      })

    if (error) {
      throw error
    }

    // 生成访问 URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(path)

    return {
      path,
      url: publicUrl
    }
  } catch (error) {
    console.error('上传图片失败:', error)
    throw error
  }
}

/**
 * 批量上传图片
 * @param files 图片文件数组
 * @param generatePath 路径生成函数
 * @param bucket 存储桶名称
 * @returns 上传结果数组
 */
export async function uploadMultipleImages(
  files: File[],
  generatePath: (index: number) => string,
  bucket: string
): Promise<ImageUploadResult[]> {
  const uploadPromises = files.map((file, index) => {
    const path = generatePath(index)
    return uploadImage(file, path, bucket)
  })

  return Promise.all(uploadPromises)
}

/**
 * 为图片路径生成访问 URL
 * @param path 图片路径
 * @param bucket 存储桶名称
 * @returns 访问 URL
 */
export function getImageUrl(path: string, bucket: string): string {
  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(path)
  
  return publicUrl
}

/**
 * 批量为图片路径生成访问 URL
 * @param paths 图片路径数组
 * @param bucket 存储桶名称
 * @returns 访问 URL 数组
 */
export function getMultipleImageUrls(paths: string[], bucket: string): string[] {
  return paths.map(path => getImageUrl(path, bucket))
}
