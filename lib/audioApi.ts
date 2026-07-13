import { getAudioUrl, type AudioMessage } from './audioHandler'

async function request<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(path, init); if (!response.ok) { const body = await response.json().catch(() => null) as { error?: string } | null; throw new Error(body?.error ?? 'Audio request failed') }; return response.json() as Promise<T> }
export async function fetchAudioMessages(): Promise<AudioMessage[]> { return request<AudioMessage[]>('/api/audio') }
export async function uploadAndSaveAudioMessage(file: File, title: string, author: string, date: string, duration: number, onProgress?: (stage: 'uploading' | 'processing' | 'saving', progress: number) => void): Promise<AudioMessage> { onProgress?.('uploading', 40); const form = new FormData(); form.set('file', file); form.set('title', title); form.set('author', author); form.set('date', date); form.set('duration', String(duration)); const result = await request<AudioMessage>('/api/audio', { method: 'POST', body: form }); onProgress?.('saving', 100); return result }
export async function deleteAudioMessage(id: string): Promise<{ residualPaths: string[] }> { return request(`/api/audio/${encodeURIComponent(id)}`, { method: 'DELETE' }) }
export async function updateAudioMessage(id: string, updates: { title: string; author: string; date: string }): Promise<AudioMessage> { return request(`/api/audio/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) }) }
export { getAudioUrl }
