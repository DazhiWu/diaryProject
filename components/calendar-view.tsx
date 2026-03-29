"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronLeftIcon, ChevronRightIcon, SprayIcon } from "@/components/icons"
import type { Entry } from "@/app/page"
import { cn } from "@/lib/utils"
import { useHealthConditions, type HealthCondition } from "@/hooks/useHealthConditions"

type CalendarViewProps = {
  entries: Entry[]
  currentDate: Date
  onDateChange: (date: Date) => void
  onDateSelect: (date: Date) => void
}

// 渲染颜色原点组件 - 统一显示在左上角
function ConditionIndicators({ conditions }: { conditions: HealthCondition[] }) {
  if (conditions.length === 0) return null

  // 所有颜色原点都显示在左上角，并列显示
  return (
    <div className="absolute top-1 left-1 flex gap-0.5 z-10">
      {conditions.map((cond) => (
        <div
          key={cond.id}
          className="w-2.5 h-2.5 rounded-full border"
          style={{ backgroundColor: cond.color, borderColor: cond.color }}
        />
      ))}
    </div>
  )
}

export function CalendarView({ entries, currentDate, onDateChange, onDateSelect }: CalendarViewProps) {

  const { conditions, getAllConditionsForDate } = useHealthConditions()
  
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  
  // 定义最小日期为2024年11月1日
  const minDate = new Date(2024, 10, 1) // 月份从0开始，10代表11月

  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const startingDayOfWeek = firstDayOfMonth.getDay()
  const daysInMonth = lastDayOfMonth.getDate()

  const previousMonth = () => {
    const newDate = new Date(year, month - 1, 1)
    // 确保不会导航到最小日期之前的月份
    if (newDate >= minDate) {
      onDateChange(newDate)
    }
  }

  const nextMonth = () => {
    onDateChange(new Date(year, month + 1, 1))
  }

  const hasEntryOnDate = (day: number) => {
    const date = new Date(year, month, day)
    return entries.some((entry) => entry.date.toDateString() === date.toDateString())
  }

  // 检查某天是否有包含"asmr"的日记（不区分大小写）
  const hasAsmrEntryOnDate = (day: number) => {
    const date = new Date(year, month, day)
    return entries.some((entry) => 
      entry.date.toDateString() === date.toDateString() && 
      entry.subtitle.toLowerCase().includes('asmr')
    )
  }

  // 检查某天是否有健康异常
  const getHealthConditionsForDate = (day: number) => {
    const date = new Date(year, month, day)
    return getAllConditionsForDate(date)
  }

  const days = []
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(<div key={`empty-${i}`} className="aspect-square" />)
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const hasEntry = hasEntryOnDate(day)
    const date = new Date(year, month, day)
    const isToday = date.toDateString() === new Date().toDateString()
    const isBeforeMinDate = date < minDate
    const healthConditions = getHealthConditionsForDate(day)
    const hasConditions = healthConditions.length > 0

    days.push(
      <button
        key={day}
        onClick={() => !isBeforeMinDate && onDateSelect(date)}
        className={cn(
          "relative aspect-square rounded-lg border border-border p-2 text-sm transition-colors",
          isToday && "border-primary bg-primary/5",
          hasEntry && "font-semibold",
          isBeforeMinDate 
            ? "cursor-not-allowed opacity-50 text-muted-foreground" 
            : "hover:bg-accent hover:text-accent-foreground cursor-pointer"
        )}
        disabled={isBeforeMinDate}
      >
        {/* 日期数字 */}
        <span className={cn("text-foreground relative z-10", isBeforeMinDate && "text-muted-foreground")}>
          {day}
        </span>

        {/* 多病症颜色标识 */}
        {hasConditions && !isBeforeMinDate && (
          <ConditionIndicators conditions={healthConditions} />
        )}

        {/* 日记条目指示器 */}
        {hasEntry && !isBeforeMinDate && (
          <div className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary z-10" />
        )}

        {/* ASMR 标记 */}
        {hasAsmrEntryOnDate(day) && !isBeforeMinDate && (
          <div className="absolute top-1 right-1 text-primary z-10">
            <SprayIcon className="h-3 w-3" />
          </div>
        )}
      </button>,
    )
  }

  // 生成年份选项（限制在2024-2026年）
  const years = [2024, 2025, 2026]
  
  // 生成月份选项（2024年只显示11月和12月，其他年份显示全部月份）
  const months = year === 2024 
    ? [
        { value: 10, label: "November" },
        { value: 11, label: "December" },
      ]
    : [
        { value: 0, label: "January" },
        { value: 1, label: "February" },
        { value: 2, label: "March" },
        { value: 3, label: "April" },
        { value: 4, label: "May" },
        { value: 5, label: "June" },
        { value: 6, label: "July" },
        { value: 7, label: "August" },
        { value: 8, label: "September" },
        { value: 9, label: "October" },
        { value: 10, label: "November" },
        { value: 11, label: "December" },
      ]

  // 处理年份选择变化
  const handleYearChange = (value: string) => {
    const newYear = parseInt(value)
    let newMonth = month
    
    // 如果选择的是2024年，确保月份不早于11月
    if (newYear === 2024) {
      newMonth = Math.max(newMonth, 10) // 10代表11月
    }
    
    onDateChange(new Date(newYear, newMonth, 1))
  }

  // 处理月份选择变化
  const handleMonthChange = (value: string) => {
    const newMonth = parseInt(value)
    let newDay = 1
    
    // 如果是2024年11月，确保日期不早于1日
    if (year === 2024 && newMonth === 10) {
      newDay = 1
    }
    
    onDateChange(new Date(year, newMonth, newDay))
  }

  return (
    <Card className="p-6">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground sm:hidden">
            {currentDate.toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </h2>
          <div className="hidden sm:flex items-center gap-2">
            <Select value={year.toString()} onValueChange={handleYearChange}>
              <SelectTrigger className="w-[100px]">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {years.map((yearOption) => (
                  <SelectItem key={yearOption} value={yearOption.toString()}>
                    {yearOption}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={month.toString()} onValueChange={handleMonthChange}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {months.map((monthOption) => (
                  <SelectItem key={monthOption.value} value={monthOption.value.toString()}>
                    {monthOption.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={previousMonth}>
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={nextMonth}>
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 图例区域 */}
      {conditions.length > 0 && (
        <div className="mb-4 p-3 bg-muted/20 rounded-lg">
          <div className="flex flex-wrap gap-3">
            {conditions.map((condition) => (
              <div key={condition.id} className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full border"
                  style={{ backgroundColor: condition.color }}
                />
                <span className="text-sm text-muted-foreground">{condition.condition}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-2 grid grid-cols-7 gap-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="text-center text-xs font-medium text-muted-foreground">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">{days}</div>

      <p className="mt-4 text-center text-sm text-muted-foreground">Click on a date to view entries</p>
    </Card>
  )
}
