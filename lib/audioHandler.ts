export interface AudioMessage { id: string; title: string; author: string; date: string; audioUrl: string; audioPath: string; duration: number; createdAt: string }
export const SUPPORTED_AUDIO_TYPES = ['audio/mpeg']
export const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3']
export const MAX_AUDIO_FILE_SIZE = 50 * 1024 * 1024
export function formatFileSize(bytes: number): string { if (!bytes) return '0 Bytes'; const i = Math.floor(Math.log(bytes) / Math.log(1024)); return `${Number((bytes / 1024 ** i).toFixed(2))} ${['Bytes', 'KB', 'MB', 'GB'][i]}` }
export function validateAudioFile(file: File): { valid: boolean; error?: string } { if (file.type !== 'audio/mpeg' || !file.name.toLowerCase().endsWith('.mp3')) return { valid: false, error: '仅支持 MP3 格式' }; if (file.size > MAX_AUDIO_FILE_SIZE) return { valid: false, error: `文件大小超过限制。最大允许: ${formatFileSize(MAX_AUDIO_FILE_SIZE)}` }; return { valid: true } }
export function getAudioUrl(path: string): string { return `/api/media/audio?path=${encodeURIComponent(path)}` }
export function getAudioDuration(file: File): Promise<number> { return new Promise((resolve, reject) => { const audio = new Audio(); audio.preload = 'metadata'; audio.onloadedmetadata = () => { URL.revokeObjectURL(audio.src); resolve(audio.duration) }; audio.onerror = () => { URL.revokeObjectURL(audio.src); reject(new Error('无法读取音频文件信息')) }; audio.src = URL.createObjectURL(file) }) }
