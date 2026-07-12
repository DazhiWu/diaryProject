import { supabase } from './supabaseClient'

export interface ImageUploadResult {
  path: string
  url: string
}

/**
 * 压缩图片
 * @param file 原始图片文件
 * @param maxWidth 最大宽度
 * @param quality 压缩质量 (0-1)
 * @returns 压缩后的图片文件
 */
export async function compressImage(
  file: File,
  maxWidth: number = 1920,
  quality: number = 0.8
): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()

    img.onload = () => {
      const { width, height } = img
      const aspectRatio = width / height
      
      let newWidth = width
      let newHeight = height

      if (width > maxWidth) {
        newWidth = maxWidth
        newHeight = maxWidth / aspectRatio
      }

      canvas.width = newWidth
      canvas.height = newHeight

      ctx?.drawImage(img, 0, 0, newWidth, newHeight)

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: 'image/webp',
              lastModified: Date.now()
            })
            resolve(compressedFile)
          } else {
            reject(new Error('压缩图片失败'))
          }
        },
        'image/webp',
        quality
      )
    }

    img.onerror = () => {
      reject(new Error('加载图片失败'))
    }

    img.src = URL.createObjectURL(file)
  })
}

/**
 * 生成年度总结图片路径
 * @param index 图片索引
 * @returns 图片路径
 */
export function generateYearlyImagePath(index: number): string {
  return `yearly/${crypto.randomUUID()}_${index}.webp`
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
    // 压缩图片
    const compressedFile = await compressImage(file)
    
    // 上传到 Storage
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, compressedFile, {
        cacheControl: '3600',
        upsert: false
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
