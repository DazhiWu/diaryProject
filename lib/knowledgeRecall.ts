/** Ephemeral retrieval plan; never a stored theme or user profile. */
export type RecallInput = {
  question: string
  context?: string
  startDate?: string
  endDate?: string
}

export type RecallTrace = {
  startDate?: string
  endDate?: string
  mode: 'lookup' | 'coping' | 'similar'
  searchCount: number
  readDiaryCount: number
  readExcerptCount: number
  partial?: boolean
  followupDays: number
}

function shiftDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

export function buildRecallPlan(input: RecallInput, now = new Date()) {
  const today = new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10)
  let startDate = input.startDate
  let endDate = input.endDate
  // Explicit form bounds take precedence over natural-language defaults.
  if (!startDate && !endDate) {
    const dates = [...input.question.matchAll(/(?<!\d)(20\d{2})[-年](\d{1,2})[-月](\d{1,2})(?:日)?/gu)]
      .map((match) => `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`)
      .filter((date) => !Number.isNaN(Date.parse(`${date}T00:00:00Z`))
        && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date)
    const month = input.question.match(/(20\d{2})年(\d{1,2})月/u)
    const years = [...input.question.matchAll(/(?<!\d)(20\d{2})年/gu)].map((match) => match[1])
    if (dates.length > 0) {
      startDate = dates[0]
      endDate = dates.at(-1)
      if (endDate && startDate > endDate) [startDate, endDate] = [endDate, startDate]
    } else if (month && Number(month[2]) >= 1 && Number(month[2]) <= 12) {
      startDate = `${month[1]}-${month[2].padStart(2, '0')}-01`
      endDate = new Date(Date.UTC(Number(month[1]), Number(month[2]), 0)).toISOString().slice(0, 10)
    } else if (/去年/u.test(input.question)) {
      const previousYear = Number(today.slice(0, 4)) - 1
      startDate = `${previousYear}-01-01`
      endDate = `${previousYear}-12-31`
    } else if (years.length > 0) {
      startDate = `${years.sort()[0]}-01-01`
      endDate = `${years.at(-1)}-12-31`
    } else if (/最近|近期|这段时间/u.test(input.question)) {
      const days = /三个月|3个月/u.test(input.question) ? 90 : /一周|一星期|7天/u.test(input.question) ? 7 : 30
      startDate = shiftDays(today, 1 - days)
      endDate = today
    }
  }
  const mode: RecallTrace['mode'] = /怎么度过|如何度过|走出|缓解|应对|熬过/u.test(input.question)
    ? 'coping'
    : /想起|类似|相似/u.test(input.question) ? 'similar' : 'lookup'
  const base = `${input.question}${input.context ? `；当前经历：${input.context}` : ''}`.slice(0, 400)
  const queries = mode === 'coping'
    ? [base, `${base} 当时采取的行动 尝试的办法`, `${base} 后来好转 恢复 有帮助 没有帮助`]
    : mode === 'similar'
      ? [base, `${base} 类似的困难 当时的应对和结果`]
      : [base]
  const clarification = !input.context && /^(这件事|这件事情|这件事儿|这个事情|这次经历)(情)?让?我?想起以前的哪些经历[？?。]*$/u.test(input.question.trim())
    ? '请在“当前经历”中简单描述发生了什么，再帮你查找相似的往事。'
    : undefined
  return { mode, startDate, endDate, queries, clarification }
}

export { shiftDays as shiftRecallDays }
