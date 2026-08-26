"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/icons"
import { cn } from "@/lib/utils"

const MIN_DATE = new Date(2024, 10, 1)
const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"]
const MONTH_LABELS = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"]
const YEARS_PER_PAGE = 12

export type HealthDateRange = {
  startDate: string
  endDate: string
}

export function isHealthDateAllowed(date: Date, maxDate?: Date): boolean {
  return date >= MIN_DATE && (!maxDate || date <= maxDate)
}

export function healthMonthsForYear(year: number, maxDate?: Date): number[] {
  if (year < MIN_DATE.getFullYear()) return []
  const firstMonth = year === MIN_DATE.getFullYear() ? 10 : 0
  const lastMonth = maxDate && year === maxDate.getFullYear() ? maxDate.getMonth() : 11
  return lastMonth < firstMonth ? [] : Array.from({ length: lastMonth - firstMonth + 1 }, (_, index) => firstMonth + index)
}

export function parseHealthDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day)
    ? date
    : null
}

function dateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function displayDate(value: string): string {
  const date = parseHealthDate(value)
  return date ? `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}` : "YYYY/MM/DD"
}

export function formatHealthDateRange({ startDate, endDate }: HealthDateRange): string {
  return `${displayDate(startDate)} - ${displayDate(endDate)}`
}

export function selectHealthDateRangeDate(range: HealthDateRange, selectedDate: Date): HealthDateRange {
  const selectedValue = dateValue(selectedDate)
  const startDate = parseHealthDate(range.startDate)

  if (!startDate || range.endDate) return { startDate: selectedValue, endDate: "" }
  if (selectedDate < startDate) return { startDate: selectedValue, endDate: range.startDate }
  return { startDate: range.startDate, endDate: selectedValue }
}

type HealthDateRangePickerProps = HealthDateRange & {
  id: string
  disabled?: boolean
  maxDate?: Date
  onChange: (range: HealthDateRange) => void
}

export function HealthDateRangePicker({ id, startDate, endDate, disabled = false, maxDate, onChange }: HealthDateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() => parseHealthDate(startDate) ?? new Date())
  const [pickerView, setPickerView] = useState<"days" | "years" | "months">("days")
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedStartDate = parseHealthDate(startDate)
  const selectedEndDate = parseHealthDate(endDate)

  useEffect(() => {
    if (!open) return

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  const calendarDays = useMemo(() => {
    const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1)
    const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate()
    return Array.from({ length: firstDay.getDay() + daysInMonth }, (_, index) => {
      if (index < firstDay.getDay()) return null
      return new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index - firstDay.getDay() + 1)
    })
  }, [visibleMonth])

  const chooseDate = (date: Date) => {
    const nextRange = selectHealthDateRangeDate({ startDate, endDate }, date)
    onChange(nextRange)
    if (nextRange.endDate) setOpen(false)
  }

  const toggleOpen = () => {
    if (disabled) return
    if (!open) {
      setVisibleMonth(selectedStartDate ?? new Date())
      setPickerView("days")
    }
    setOpen((current) => !current)
  }

  const visibleYear = visibleMonth.getFullYear()
  const visibleYearPageStart = Math.max(MIN_DATE.getFullYear(), Math.floor(visibleYear / YEARS_PER_PAGE) * YEARS_PER_PAGE)
  const visibleYears = Array.from({ length: YEARS_PER_PAGE }, (_, index) => visibleYearPageStart + index)
  const visibleMonths = healthMonthsForYear(visibleYear, maxDate)
  const lastAvailableMonth = maxDate && new Date(maxDate.getFullYear(), maxDate.getMonth(), 1)

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm shadow-xs transition-[color,box-shadow] outline-none hover:border-primary/50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
        onClick={toggleOpen}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={cn(!selectedStartDate && !selectedEndDate && "text-muted-foreground")}>{formatHealthDateRange({ startDate, endDate })}</span>
        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && (
        <div role="dialog" aria-label="选择病症日期范围" className="absolute left-0 z-50 mt-2 w-[21rem] max-w-[calc(100vw-3rem)] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl">
          {pickerView === "days" && <>
            <div className="mb-3 flex items-center justify-between">
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} disabled={new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1) <= MIN_DATE} aria-label="上一个月">
                <ChevronLeftIcon className="h-4 w-4" />
              </Button>
              <button type="button" className="rounded-md px-2 py-1 text-sm font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setPickerView("years")} aria-label="选择年份和月份">
                {visibleMonth.toLocaleDateString("zh-CN", { year: "numeric", month: "long" })}
              </button>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} disabled={Boolean(lastAvailableMonth && visibleMonth >= lastAvailableMonth)} aria-label="下一个月">
                <ChevronRightIcon className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
              {WEEKDAY_LABELS.map((weekday) => <span key={weekday} className="py-1">{weekday}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((date, index) => {
                if (!date) return <span key={`empty-${index}`} />

                const isDisabled = !isHealthDateAllowed(date, maxDate)
                const isStart = selectedStartDate?.getTime() === date.getTime()
                const isEnd = selectedEndDate?.getTime() === date.getTime()
                const isInRange = Boolean(selectedStartDate && selectedEndDate && date > selectedStartDate && date < selectedEndDate)

                return (
                  <button
                    key={dateValue(date)}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => chooseDate(date)}
                    aria-label={date.toLocaleDateString("zh-CN")}
                    aria-pressed={Boolean(isStart || isEnd)}
                    className={cn(
                      "h-9 rounded-md text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40",
                      isInRange && "rounded-none bg-accent text-accent-foreground",
                      (isStart || isEnd) && "bg-primary text-primary-foreground hover:bg-primary",
                    )}
                  >
                    {date.getDate()}
                  </button>
                )
              })}
            </div>
          </>}

          {pickerView === "years" && <>
            <div className="mb-3 flex items-center justify-between">
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setVisibleMonth((month) => new Date(visibleYearPageStart - YEARS_PER_PAGE, month.getMonth(), 1))} disabled={visibleYearPageStart === MIN_DATE.getFullYear()} aria-label="上一组年份">
                <ChevronLeftIcon className="h-4 w-4" />
              </Button>
              <p className="text-sm font-semibold">{visibleYearPageStart} - {visibleYearPageStart + YEARS_PER_PAGE - 1}</p>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setVisibleMonth((month) => new Date(visibleYearPageStart + YEARS_PER_PAGE, month.getMonth(), 1))} disabled={Boolean(maxDate && visibleYearPageStart + YEARS_PER_PAGE > maxDate.getFullYear())} aria-label="下一组年份">
                <ChevronRightIcon className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {visibleYears.map((year) => (
                <button key={year} type="button" disabled={Boolean(maxDate && year > maxDate.getFullYear())} onClick={() => { setVisibleMonth((month) => new Date(year, month.getMonth(), 1)); setPickerView("months") }} className={cn("h-10 rounded-md text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40", year === visibleYear && "bg-primary text-primary-foreground hover:bg-primary")}>
                  {year}
                </button>
              ))}
            </div>
          </>}

          {pickerView === "months" && <>
            <div className="mb-3 flex items-center justify-between">
              <Button type="button" variant="ghost" size="sm" onClick={() => setPickerView("years")}>返回年份</Button>
              <button type="button" className="rounded-md px-2 py-1 text-sm font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setPickerView("years")} aria-label="重新选择年份">
                {visibleYear} 年
              </button>
              <span className="w-16" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {visibleMonths.map((month) => (
                <button key={month} type="button" onClick={() => { setVisibleMonth(new Date(visibleYear, month, 1)); setPickerView("days") }} className={cn("h-10 rounded-md text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", month === visibleMonth.getMonth() && "bg-primary text-primary-foreground hover:bg-primary")}>
                  {MONTH_LABELS[month]}
                </button>
              ))}
            </div>
          </>}

          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">先选开始日期，再选结束日期</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ startDate: "", endDate: "" })}>清除</Button>
          </div>
        </div>
      )}
    </div>
  )
}
