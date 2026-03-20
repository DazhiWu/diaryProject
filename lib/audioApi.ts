import { supabase } from './supabaseClient'
import { AudioMessage, AudioUploadResult } from './audioHandler'
import { uploadAudioFile, getAudioUrl, getAudioDuration, deleteAudioFile } from './audioHandler'

// Supabase 音频消息表类型
export type SupabaseAudioMessage = {
  id: string
  title: string
  author: string
  date: string
  audio_path: string
  duration: number
  created_at: string
}

/**
 * 将 Supabase 数据转换为 AudioMessage
 */
function convertFromSupabase(data: SupabaseAudioMessage): AudioMessage {
  return {
    id: data.id,
    title: data.title,
    author: data.author,
    date: data.date,
    audioPath: data.audio_path,
    audioUrl: getAudioUrl(data.audio_path),
    duration: data.duration,
    createdAt: data.created_at
  }
}

/**
 * 获取所有音频消息
 * @returns 音频消息列表
 */
export async function fetchAudioMessages(): Promise<AudioMessage[]> {
  try {
    const { data, error } = await supabase
      .from('audio_messages')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('获取音频消息失败:', error)
      throw error
    }

    return (data || []).map(convertFromSupabase)
  } catch (error) {
    console.error('获取音频消息失败:', error)
    throw error
  }
}

/**
 * 根据ID获取单个音频消息
 * @param id 音频消息ID
 */
export async function fetchAudioMessageById(id: string): Promise<AudioMessage | null> {
  try {
    const { data, error } = await supabase
      .from('audio_messages')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      console.error('获取音频消息失败:', error)
      throw error
    }

    return data ? convertFromSupabase(data) : null
  } catch (error) {
    console.error('获取音频消息失败:', error)
    throw error
  }
}

/**
 * 上传并保存音频消息
 * @param audioFile 音频文件
 * @param title 标题
 * @param author 作者
 * @param date 日期
 * @param onProgress 进度回调
 */
export async function uploadAndSaveAudioMessage(
  audioFile: File,
  title: string,
  author: string,
  date: string,
  onProgress?: (stage: 'uploading' | 'processing' | 'saving', progress: number) => void
): Promise<AudioMessage> {
  try {
    // 获取音频时长
    onProgress?.('processing', 10)
    const duration = await getAudioDuration(audioFile)
    onProgress?.('processing', 30)

    // 上传音频文件
    onProgress?.('uploading', 40)
    const audioResult: AudioUploadResult = await uploadAudioFile(audioFile, (progress) => {
      onProgress?.('uploading', 40 + progress * 0.4)
    })
    onProgress?.('uploading', 80)

    // 保存到数据库
    onProgress?.('saving', 90)
    const { data, error } = await supabase
      .from('audio_messages')
      .insert([{
        title,
        author,
        date,
        audio_path: audioResult.path,
        duration
      }])
      .select('*')
      .single()

    if (error) {
      // 如果数据库保存失败，删除已上传的文件
      await deleteAudioFile(audioResult.path)
      throw error
    }

    onProgress?.('saving', 100)
    return convertFromSupabase(data)
  } catch (error) {
    console.error('上传音频消息失败:', error)
    throw error
  }
}

/**
 * 删除音频消息
 * @param id 音频消息ID
 */
export async function deleteAudioMessage(id: string): Promise<void> {
  try {
    // 先获取音频消息信息
    const { data, error: fetchError } = await supabase
      .from('audio_messages')
      .select('audio_path')
      .eq('id', id)
      .single()

    if (fetchError) {
      throw fetchError
    }

    // 删除数据库记录
    const { error: deleteError } = await supabase
      .from('audio_messages')
      .delete()
      .eq('id', id)

    if (deleteError) {
      throw deleteError
    }

    // 删除存储的文件
    if (data?.audio_path) {
      await deleteAudioFile(data.audio_path)
    }
  } catch (error) {
    console.error('删除音频消息失败:', error)
    throw error
  }
}

/**
 * 更新音频消息信息（不更换文件）
 * @param id 音频消息ID
 * @param updates 更新内容
 */
export async function updateAudioMessage(
  id: string,
  updates: { title?: string; author?: string; date?: string }
): Promise<AudioMessage> {
  try {
    const { data, error } = await supabase
      .from('audio_messages')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      throw error
    }

    return convertFromSupabase(data)
  } catch (error) {
    console.error('更新音频消息失败:', error)
    throw error
  }
}
