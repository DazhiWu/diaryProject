import { supabase } from './supabaseClient'

export interface AudioUploadResult {
  path: string
  url: string
}

export interface AudioMessage {
  id: string
  title: string
  author: string
  date: string
  audioUrl: string
  audioPath: string
  duration: number
  createdAt: string
}

// 支持的音频文件类型
export const SUPPORTED_AUDIO_TYPES = [
  'audio/mpeg',      // MP3
  'audio/wav',       // WAV
  'audio/ogg',       // OGG
  'audio/aac',       // AAC
  'audio/webm',      // WebM
  'audio/mp4',       // M4A
  'audio/flac',      // FLAC
]

// 支持的音频文件扩展名
export const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.aac', '.webm', '.m4a', '.flac']

// 最大文件大小 (50MB)
export const MAX_AUDIO_FILE_SIZE = 50 * 1024 * 1024

// 存储桶名称
export const AUDIO_BUCKET = 'audio_messages'

/**
 * 验证音频文件
 * @param file 音频文件
 * @returns 验证结果
 */
export function validateAudioFile(file: File): { valid: boolean; error?: string } {
  // 检查文件类型
  const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
  const isValidType = SUPPORTED_AUDIO_TYPES.includes(file.type) || 
                      SUPPORTED_AUDIO_EXTENSIONS.includes(fileExtension)
  
  if (!isValidType) {
    return {
      valid: false,
      error: `不支持的音频格式。支持的格式: ${SUPPORTED_AUDIO_EXTENSIONS.join(', ')}`
    }
  }

  // 检查文件大小
  if (file.size > MAX_AUDIO_FILE_SIZE) {
    return {
      valid: false,
      error: `文件大小超过限制。最大允许: ${formatFileSize(MAX_AUDIO_FILE_SIZE)}`
    }
  }

  return { valid: true }
}

/**
 * 格式化文件大小
 * @param bytes 字节数
 * @returns 格式化后的字符串
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * 生成音频文件路径
 * @param fileName 文件名
 * @returns 存储路径
 */
export function generateAudioPath(fileName: string): string {
  const timestamp = Date.now()
  const randomString = Math.random().toString(36).substring(2, 8)
  const extension = fileName.split('.').pop()?.toLowerCase() || 'mp3'
  return `${timestamp}_${randomString}.${extension}`
}

/**
 * 上传音频文件到 Supabase Storage
 * @param file 音频文件
 * @param onProgress 进度回调函数
 * @returns 上传结果
 */
export async function uploadAudioFile(
  file: File,
  onProgress?: (progress: number) => void
): Promise<AudioUploadResult> {
  // 验证文件
  const validation = validateAudioFile(file)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  const path = generateAudioPath(file.name)

  try {
    // 上传到 Storage
    const { error } = await supabase.storage
      .from(AUDIO_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'audio/mpeg'
      })

    if (error) {
      throw error
    }

    // 生成访问 URL
    const { data: { publicUrl } } = supabase.storage
      .from(AUDIO_BUCKET)
      .getPublicUrl(path)

    // 模拟进度更新（Supabase 不原生支持上传进度）
    if (onProgress) {
      onProgress(100)
    }

    return {
      path,
      url: publicUrl
    }
  } catch (error) {
    console.error('上传音频文件失败:', error)
    throw error
  }
}

/**
 * 获取音频文件的访问 URL
 * @param path 音频文件路径
 * @returns 访问 URL
 */
export function getAudioUrl(path: string): string {
  const { data: { publicUrl } } = supabase.storage
    .from(AUDIO_BUCKET)
    .getPublicUrl(path)
  
  return publicUrl
}

/**
 * 删除音频文件
 * @param path 音频文件路径
 */
export async function deleteAudioFile(path: string): Promise<void> {
  try {
    const { error } = await supabase.storage
      .from(AUDIO_BUCKET)
      .remove([path])

    if (error) {
      throw error
    }
  } catch (error) {
    console.error('删除音频文件失败:', error)
    throw error
  }
}

/**
 * 获取音频文件时长
 * @param file 音频文件
 * @returns 时长（秒）
 */
export function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio()
    audio.preload = 'metadata'
    
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(audio.src)
      resolve(audio.duration)
    }
    
    audio.onerror = () => {
      URL.revokeObjectURL(audio.src)
      reject(new Error('无法读取音频文件信息'))
    }
    
    audio.src = URL.createObjectURL(file)
  })
}
