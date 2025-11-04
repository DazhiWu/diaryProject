"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons"
import type { Entry } from "@/app/page"
import { cn } from "@/lib/utils"

type CalendarViewProps = {
  entries: Entry[]
  onDateSelect: (date: Date) => void
}

export function CalendarView({ entries, onDateSelect }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date())

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const startingDayOfWeek = firstDayOfMonth.getDay()
  const daysInMonth = lastDayOfMonth.getDate()

  const previousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const hasEntryOnDate = (day: number) => {
    const date = new Date(year, month, day)
    return entries.some((entry) => entry.date.toDateString() === date.toDateString())
  }

  const days = []
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(<div key={`empty-${i}`} className="aspect-square" />)
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const hasEntry = hasEntryOnDate(day)
    const date = new Date(year, month, day)
    const isToday = date.toDateString() === new Date().toDateString()

    days.push(
      <button
        key={day}
        onClick={() => onDateSelect(date)}
        className={cn(
          "relative aspect-square rounded-lg border border-border p-2 text-sm transition-colors hover:bg-accent",
          isToday && "border-primary bg-primary/5",
          hasEntry && "font-semibold",
        )}
      >
        <span className="text-foreground">{day}</span>
        {hasEntry && (
          <div className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary" />
        )}
      </button>,
    )
  }

  return (
    <Card className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          {currentDate.toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          })}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={previousMonth}>
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={nextMonth}>
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

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
