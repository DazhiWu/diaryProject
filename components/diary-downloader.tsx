'use client';

import React, { useState } from 'react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { HealthDateRangePicker } from './health-date-range-picker';
import { localDateInputValue } from '@/lib/dateInput';


interface DiaryDownloaderProps {
  className?: string;
}

const DiaryDownloader: React.FC<DiaryDownloaderProps> = ({ className }) => {
  const minDate = new Date(2024, 10, 1);
  const today = new Date();

  const defaultStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [startDate, setStartDate] = useState<string>(localDateInputValue(defaultStartDate < minDate ? minDate : defaultStartDate));
  const [endDate, setEndDate] = useState<string>(localDateInputValue(today));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!startDate || !endDate) {
      setError('请选择开始日期和结束日期');
      return;
    }

    if (startDate > endDate) {
      setError('开始日期不能晚于结束日期');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/diary-download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate,
          endDate,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || '下载失败');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `diary_export_${startDate}_to_${endDate}.csv`;
      document.body.appendChild(link);
      link.click();
      
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '下载日记时发生错误';
      if (errorMessage.includes('canceling statement due to statement timeout')) {
        setError('数据库无法一次性传输文本，建议选择更短时间范围内的日记下载');
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">下载日记</CardTitle>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => window.location.href = '/'} 
            className="gap-1"
          >
            返回首页
          </Button>
        </div>
        <CardDescription>选择日期范围，将日记导出为CSV文件</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="download-date-range">日期范围</Label>
          <HealthDateRangePicker
            id="download-date-range"
            startDate={startDate}
            endDate={endDate}
            maxDate={today}
            onChange={({ startDate: nextStartDate, endDate: nextEndDate }) => {
              setStartDate(nextStartDate)
              setEndDate(nextEndDate)
            }}
          />
        </div>
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-destructive">
            {error}
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button 
          onClick={handleDownload} 
          disabled={isLoading || !startDate || !endDate}
          className="w-full"
        >
          {isLoading ? '下载中...' : '下载日记'}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default DiaryDownloader;
