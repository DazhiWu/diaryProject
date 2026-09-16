import 'server-only'

import { buildRecallPlan, shiftRecallDays, type RecallInput, type RecallTrace } from '@/lib/knowledgeRecall'
import { KnowledgeEmbeddingUnavailableError, searchPrivateKnowledge, type KnowledgeSearchResult } from '@/lib/server/knowledgeSearch'

const MAX_EXCERPTS = 8
const MAX_CHARS = 12_000

/** Round-robin ranks avoid comparing unrelated reranker scores across queries. */
function selectEvidence(groups: KnowledgeSearchResult[][], limit: number): KnowledgeSearchResult[] {
  const selected: KnowledgeSearchResult[] = []
  const counts = new Map<number, number>()
  let characters = 0
  for (const perDiaryLimit of [1, 2]) {
    for (let rank = 0; rank < 5; rank += 1) {
      for (const group of groups) {
        const result = group[rank]
        if (!result || selected.length >= limit || !result.content.trim()) continue
        if ((counts.get(result.sourceId) ?? 0) >= perDiaryLimit) continue
        if (selected.some((previous) => previous.sourceId === result.sourceId
          && previous.charStart < result.charEnd && result.charStart < previous.charEnd)) continue
        if (characters + result.content.length > MAX_CHARS) continue
        selected.push(result)
        characters += result.content.length
        counts.set(result.sourceId, (counts.get(result.sourceId) ?? 0) + 1)
      }
    }
  }
  return selected
}

export async function retrieveRecallEvidence(input: RecallInput, search = searchPrivateKnowledge) {
  const plan = buildRecallPlan(input)
  const trace: RecallTrace = {
    mode: plan.mode, startDate: plan.startDate, endDate: plan.endDate,
    searchCount: 0, readDiaryCount: 0, readExcerptCount: 0, followupDays: 0,
  }
  if (plan.clarification) return { results: [], rerankApplied: false, trace, clarification: plan.clarification }
  const primary = await search({ query: plan.queries[0], startDate: plan.startDate, endDate: plan.endDate })
  const responses = [primary]
  trace.searchCount = 1
  const inBounds = (result: KnowledgeSearchResult) => (!plan.startDate || result.sourceDate >= plan.startDate)
    && (!plan.endDate || result.sourceDate <= plan.endDate)
  const groups = [primary.results.filter(inBounds)]
  async function supplement(query: string, startDate?: string, endDate?: string) {
    trace.searchCount += 1
    try {
      const response = await search({ query, startDate, endDate })
      responses.push(response)
      groups.push(response.results.filter((result) => inBounds(result)
        && (!startDate || result.sourceDate >= startDate) && (!endDate || result.sourceDate <= endDate)))
      return true
    } catch (error) {
      // Retain real primary evidence on a transient optional lookup failure only.
      // Permission/configuration/unknown/database errors must still stop the answer.
      if (!(error instanceof KnowledgeEmbeddingUnavailableError)
        || !['timeout', 'network', 'rate-limit', 'upstream'].includes(error.reason)
        || !groups.some((group) => group.length > 0)) throw error
      trace.partial = true
      return false
    }
  }
  for (const query of plan.queries.slice(1)) {
    if (!await supplement(query, plan.startDate, plan.endDate)) break
  }
  const seeds = selectEvidence(groups, 5)
  // A bounded follow-up searches indexed excerpts only; it is not a full period scan.
  if (plan.mode === 'coping' && !trace.partial) {
    const dates = [...new Set(seeds.map((seed) => seed.sourceDate))].slice(0, 2)
    for (const date of dates) {
      const startDate = shiftRecallDays(date, 1)
      const endDate = [shiftRecallDays(date, 7), plan.endDate].filter((value): value is string => !!value).sort()[0]
      if (startDate > endDate) continue
      if (!await supplement(plan.queries[2], startDate, endDate)) break
      trace.followupDays = 7
    }
  }
  const results = selectEvidence(groups, plan.mode === 'lookup' ? 5 : MAX_EXCERPTS)
  trace.readDiaryCount = new Set(results.map((result) => result.sourceId)).size
  trace.readExcerptCount = results.length
  return {
    results, trace,
    rerankApplied: responses.filter((response) => response.results.length > 0).every((response) => response.rerankApplied)
      && results.length > 0,
    clarification: undefined,
  }
}
