import 'server-only'

import { HttpError } from '@/lib/server/session'

const KiB = 1024
const MiB = 1024 * KiB

export const FIELD_LIMITS = {
  anonymousMessage: 2_000,
  audioFileBytes: 50 * MiB,
  audioMetadata: 200,
  diaryContent: 200_000,
  diaryImages: 18,
  diaryImageBytes: 12 * MiB,
  diarySubtitle: 200,
  healthCondition: 200,
  modelInput: 50_000,
  yearlyLongText: 20_000,
  yearlyTitle: 200,
} as const

export const REQUEST_LIMITS = {
  anonymousMessageJson: 16 * KiB,
  audioForm: FIELD_LIMITS.audioFileBytes + 128 * KiB,
  audioMetadataJson: 16 * KiB,
  authJson: 8 * KiB,
  csvJson: 4 * KiB,
  diaryJson: 1024 * KiB,
  healthJson: 16 * KiB,
  imageForm: FIELD_LIMITS.diaryImageBytes + 128 * KiB,
  modelJson: 256 * KiB,
  yearlyJson: 128 * KiB,
} as const

function declaredLength(request: Request): number | undefined {
  const value = request.headers.get('content-length')
  if (value === null) return undefined
  if (!/^\d+$/u.test(value)) throw new HttpError(400, 'Invalid Content-Length')
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new HttpError(400, 'Invalid Content-Length')
  return parsed
}

export function assertDeclaredRequestSize(request: Request, maximumBytes: number): void {
  const declared = declaredLength(request)
  if (declared !== undefined && declared > maximumBytes) throw new HttpError(413, 'Request body too large')
}

async function readBodyBytes(request: Request, maximumBytes: number): Promise<Uint8Array> {
  assertDeclaredRequestSize(request, maximumBytes)
  if (!request.body) return new Uint8Array()

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maximumBytes) {
      await reader.cancel()
      throw new HttpError(413, 'Request body too large')
    }
    chunks.push(value)
  }

  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

export async function readJsonBody(request: Request, maximumBytes: number): Promise<unknown> {
  const bytes = await readBodyBytes(request, maximumBytes)
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new HttpError(400, 'Invalid JSON body')
  }
}

export async function readFormDataBody(request: Request, maximumBytes: number): Promise<FormData> {
  const contentType = request.headers.get('content-type')
  if (!contentType?.toLowerCase().startsWith('multipart/form-data;')) throw new HttpError(400, 'Invalid multipart body')
  const bytes = await readBodyBytes(request, maximumBytes)
  try {
    const body = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(body).set(bytes)
    return await new Response(body, { headers: { 'Content-Type': contentType } }).formData()
  } catch {
    throw new HttpError(400, 'Invalid multipart body')
  }
}

export function stringField(
  value: unknown,
  name: string,
  options: { min?: number; max: number; trim?: boolean },
): string {
  if (typeof value !== 'string') throw new HttpError(400, `Invalid ${name}`)
  const result = options.trim ? value.trim() : value
  if (result.length < (options.min ?? 0) || result.length > options.max) throw new HttpError(400, `Invalid ${name}`)
  return result
}

export function integerField(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new HttpError(400, `Invalid ${name}`)
  return Number(value)
}

export function exactDateField(value: unknown, name: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new HttpError(400, `Invalid ${name}`)
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new HttpError(400, `Invalid ${name}`)
  return value
}

export function dateRangeFields(start: unknown, end: unknown): { start: string; end: string } {
  const startDate = exactDateField(start, 'start date')
  const endDate = exactDateField(end, 'end date')
  if (startDate > endDate) throw new HttpError(400, 'Start date must not be after end date')
  return { start: startDate, end: endDate }
}

export function stringArrayField(value: unknown, name: string, maximumItems: number, maximumItemLength = 512): string[] {
  if (!Array.isArray(value) || value.length > maximumItems) throw new HttpError(400, `Invalid ${name}`)
  return value.map((item) => stringField(item, name, { min: 1, max: maximumItemLength }))
}

export function fileField(
  value: FormDataEntryValue | null,
  options: { maximumBytes: number; mimeType: string; extension?: string },
): File {
  if (!(value instanceof File) || value.size < 1 || value.size > options.maximumBytes || value.type !== options.mimeType) {
    throw new HttpError(400, 'Invalid file')
  }
  if (options.extension && !value.name.toLowerCase().endsWith(options.extension)) throw new HttpError(400, 'Invalid file')
  return value
}
