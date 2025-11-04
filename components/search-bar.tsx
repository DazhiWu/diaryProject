"use client"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { SearchIcon, XIcon } from "@/components/icons"

type SearchBarProps = {
  value: string
  onChange: (value: string) => void
  onClear: () => void
}

export function SearchBar({ value, onChange, onClear }: SearchBarProps) {
  return (
    <div className="relative">
      <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        placeholder="Search diary entries..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-10 pr-10"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onClear}
          className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
        >
          <XIcon className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
