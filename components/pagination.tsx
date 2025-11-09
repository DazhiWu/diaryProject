"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons"

type PaginationProps = {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  totalEntries: number
  entriesPerPage: number
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalEntries,
  entriesPerPage,
}: PaginationProps) {
  const [inputPage, setInputPage] = useState(currentPage.toString())
  const startIndex = (currentPage - 1) * entriesPerPage + 1
  const endIndex = Math.min(currentPage * entriesPerPage, totalEntries)
  
  const handlePrevious = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1)
    }
  }
  
  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1)
    }
  }
  
  const handlePageInput = () => {
    const page = parseInt(inputPage)
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      onPageChange(page)
    } else {
      setInputPage(currentPage.toString())
    }
  }
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 只允许输入数字
    if (/^\d*$/.test(e.target.value) || e.target.value === '') {
      setInputPage(e.target.value)
    }
  }
  
  // 生成页面按钮
  const getPageButtons = () => {
    const buttons = []
    const maxVisiblePages = 5
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2))
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1)
    
    // 调整起始页以确保显示足够的页数
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1)
    }
    
    // 添加第一页
    if (startPage > 1) {
      buttons.push(
        <Button
          key={1}
          variant="outline"
          size="sm"
          onClick={() => onPageChange(1)}
        >
          1
        </Button>
      )
      
      // 如果第一页和起始页之间有间隔，添加省略号
      if (startPage > 2) {
        buttons.push(
          <span key="start-ellipsis" className="px-2 py-1 text-muted-foreground">
            ...
          </span>
        )
      }
    }
    
    // 添加可见的页面按钮
    for (let i = startPage; i <= endPage; i++) {
      buttons.push(
        <Button
          key={i}
          variant={i === currentPage ? "default" : "outline"}
          size="sm"
          onClick={() => onPageChange(i)}
        >
          {i}
        </Button>
      )
    }
    
    // 添加最后一页
    if (endPage < totalPages) {
      // 如果结束页和最后一页之间有间隔，添加省略号
      if (endPage < totalPages - 1) {
        buttons.push(
          <span key="end-ellipsis" className="px-2 py-1 text-muted-foreground">
            ...
          </span>
        )
      }
      
      buttons.push(
        <Button
          key={totalPages}
          variant="outline"
          size="sm"
          onClick={() => onPageChange(totalPages)}
        >
          {totalPages}
        </Button>
      )
    }
    
    return buttons
  }
  
  if (totalPages <= 1) {
    return null
  }
  
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4">
      <div className="text-sm text-muted-foreground">
        显示第 {startIndex} 到 {endIndex} 条，共 {totalEntries} 条记录
      </div>
      
      <div className="flex items-center gap-1 flex-wrap justify-center">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrevious}
          disabled={currentPage === 1}
        >
          <ChevronLeftIcon className="h-4 w-4" />
          上一页
        </Button>
        
        <div className="flex items-center gap-1">
          {getPageButtons()}
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={handleNext}
          disabled={currentPage === totalPages}
        >
          下一页
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
        
        <div className="flex items-center gap-1 ml-4">
          <span className="text-sm text-muted-foreground">前往</span>
          <Input
            type="text"
            value={inputPage}
            onChange={handleInputChange}
            className="w-16 h-8 text-sm text-center"
            inputMode="numeric"
            pattern="[0-9]*"
          />
          <span className="text-sm text-muted-foreground">页</span>
          <Button
            type="button"
            onClick={handlePageInput}
            variant="outline"
            size="sm"
            className="ml-1 h-8 px-2"
          >
            跳转
          </Button>
        </div>
      </div>
    </div>
  )
}