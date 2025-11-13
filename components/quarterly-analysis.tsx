"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { toast } from "sonner"
import { Spinner } from "@/components/ui/spinner"
import { QuarterAnalysisResult } from "@/lib/aiAnalysis"
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

type QuarterOption = { year: number; quarter: 1 | 2 | 3 | 4 }

function getCurrentQuarter(): QuarterOption {
  const now = new Date()
  const m = now.getUTCMonth()
  const q = (Math.floor(m / 3) + 1) as 1 | 2 | 3 | 4
  return { year: now.getUTCFullYear(), quarter: q }
}

function getQuarterLabel(q: QuarterOption): string {
  const map = { 1: "Q1", 2: "Q2", 3: "Q3", 4: "Q4" } as const
  return `${q.year} ${map[q.quarter]}`
}

export function QuarterlyAnalysis() {
  const [quarter, setQuarter] = useState<QuarterOption>(getCurrentQuarter())
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<QuarterAnalysisResult | null>(null)

  // 移除自动分析，现在需要用户手动点击"确定"按钮才开始分析

  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [hasParsingError, setHasParsingError] = useState(false);
  const [showRawResponse, setShowRawResponse] = useState(false);

  const runAnalysis = async () => {
    setLoading(true)
    setRawResponse(null)
    setHasParsingError(false)
    setShowRawResponse(false)
    try {
      const res = await fetch("/api/quarterly-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: quarter.year, quarter: quarter.quarter }),
      })
      if (!res.ok) {
        throw new Error("分析失败")
      }
      const data = await res.json()
      setResult(data.result as QuarterAnalysisResult)
      
      // 保存原始响应和解析状态
      if (data.rawResponse) {
        setRawResponse(data.rawResponse);
      }
      if (data.hasParsingError) {
        setHasParsingError(true);
      }
      
      toast.success(`已生成${getQuarterLabel(quarter)}分析`)
    } catch (e: any) {
      toast.error(e?.message || "分析失败")
    } finally {
      setLoading(false)
    }
  }

  const emotionSeries = useMemo(() => {
    const items = result?.emotionTimeline || []
    return items.map((i, idx) => ({ 
      idx, 
      date: i.date, 
      value: typeof i.intensity === "number" ? i.intensity : 0.5,
      label: i.label || '未知'
    }))
  }, [result])

  const themeSeries = useMemo(() => {
    const items = result?.themes || []
    return items.map(t => ({ name: t.name, weight: t.weight }))
  }, [result])

  const quarterSelector = (
    <div className="flex items-center gap-2">
      <select
        className="border border-border rounded px-2 py-1 bg-card text-foreground"
        value={quarter.year}
        onChange={(e) => setQuarter({ year: parseInt(e.target.value, 10), quarter: quarter.quarter })}
      >
        {Array.from({ length: 6 }).map((_, i) => {
          const y = new Date().getUTCFullYear() - i
          return (
            <option key={y} value={y}>{y}</option>
          )
        })}
      </select>
      <select
        className="border border-border rounded px-2 py-1 bg-card text-foreground"
        value={quarter.quarter}
        onChange={(e) => setQuarter({ year: quarter.year, quarter: Number(e.target.value) as 1 | 2 | 3 | 4 })}
      >
        <option value={1}>Q1</option>
        <option value={2}>Q2</option>
        <option value={3}>Q3</option>
        <option value={4}>Q4</option>
      </select>
      <Button 
        size="sm" 
        onClick={runAnalysis} 
        disabled={loading}
        className="gap-2"
      >
        {loading ? "分析中..." : "确定"}
      </Button>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => window.location.href = '/'} 
            className="gap-1"
          >
            返回首页
          </Button>
          <h2 className="text-xl font-semibold">季度分析</h2>
        </div>
        {quarterSelector}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Spinner className="mr-2 h-6 w-6" />
          <span className="text-muted-foreground">正在生成分析...</span>
        </div>
      )}

      {!loading && !result && (
        <Card className="p-8 text-center">
          <div className="text-muted-foreground">
            请选择要分析的年份和季度，然后点击"确定"开始分析
          </div>
        </Card>
      )}

      {!loading && result && (
        <div className="space-y-6">
          {/* 当解析出错时显示提示和原始响应 */}
          {hasParsingError && rawResponse && (
            <Card className="p-4 border-amber-300 bg-amber-50">
              <div className="flex items-center justify-between">
                <div className="font-medium text-amber-800">AI响应解析提示</div>
                <Button 
                  size="sm" 
                  onClick={() => setShowRawResponse(!showRawResponse)}
                  variant="secondary"
                >
                  {showRawResponse ? "隐藏原始响应" : "查看原始响应"}
                </Button>
              </div>
              <div className="mt-2 text-amber-700 text-sm">
                系统无法正确解析AI返回的JSON格式，但已尝试提取关键信息。点击按钮可查看AI的完整响应内容。
              </div>
              {showRawResponse && (
                <div className="mt-4 p-3 bg-gray-100 rounded-md overflow-auto max-h-96">
                  <pre className="whitespace-pre-wrap break-words text-sm">{rawResponse}</pre>
                </div>
              )}
            </Card>
          )}
          
          {/* 当解析成功且有原始响应时，也提供查看选项 */}
          {!hasParsingError && rawResponse && (
            <Card className="p-4 border-blue-200">
              <div className="flex justify-between">
                <div className="text-sm text-muted-foreground">AI分析响应</div>
                <Button 
                  size="sm" 
                  onClick={() => setShowRawResponse(!showRawResponse)}
                  variant="secondary"
                >
                  {showRawResponse ? "隐藏原始响应" : "查看原始响应"}
                </Button>
              </div>
              {showRawResponse && (
                <div className="mt-4 p-3 bg-gray-50 rounded-md overflow-auto max-h-96">
                  <pre className="whitespace-pre-wrap break-words text-sm">{rawResponse}</pre>
                </div>
              )}
            </Card>
          )}
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">总体印象</div>
            <div className="mt-2 text-foreground">{result.overallImpression || ""}</div>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-4">
              <div className="mb-2 text-sm text-muted-foreground">心理主题</div>
              <ChartContainer id="themes" config={{ weight: { label: "主题" } }}>
                <BarChart data={themeSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="weight" fill="#6366F1" />
                </BarChart>
              </ChartContainer>
            </Card>

            <Card className="p-4">
              <div className="mb-2 text-sm text-muted-foreground">情绪曲线</div>
              <ChartContainer id="emotion" config={{ value: { label: "强度" } }}>
                <LineChart data={emotionSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line type="monotone" dataKey="value" stroke="#10B981" dot={false} />
                </LineChart>
              </ChartContainer>
            </Card>
          </div>

          <Card className="p-4">
            <div className="text-sm text-muted-foreground">循环模式与内在冲突</div>
            <div className="mt-2 space-y-2">
              {(result.conflictCycles || []).map((c, idx) => (
                <div key={idx} className="rounded border border-border p-3">
                  <div className="font-medium">{c.pattern}</div>
                  <div className="text-sm text-muted-foreground">{c.evidence.join("；")}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm text-muted-foreground">成长轨迹与阶段性特征</div>
            <div className="mt-2 space-y-2">
              {(result.growthTrajectory || []).map((g, idx) => (
                <div key={idx} className="rounded border border-border p-3">
                  <div className="font-medium">{g.period}</div>
                  <div className="text-sm text-muted-foreground">{g.description}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm text-muted-foreground">需求与动机分析</div>
            <div className="mt-2 space-y-2">
              {(result.needsMotivation || []).map((n, idx) => (
                <div key={idx} className="rounded border border-border p-3">
                  <div className="font-medium">{n.need}</div>
                  <div className="text-sm text-muted-foreground">{n.rationale}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm text-muted-foreground">关键转折点</div>
            <div className="mt-2 space-y-2">
              {(result.keyTurningPoints || []).map((t, idx) => (
                <div key={idx} className="rounded border border-border p-3">
                  <div className="font-medium">{t.period}</div>
                  <div className="text-sm text-muted-foreground">{t.description}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm text-muted-foreground">心理洞察与自我理解建议</div>
            <div className="mt-2 space-y-2">
              {(result.suggestions || []).map((s, idx) => (
                <div key={idx} className="rounded border border-border p-3">
                  <div className="text-sm text-foreground">{s}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

