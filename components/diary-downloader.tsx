'use client';

import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';


interface DiaryDownloaderProps {
  className?: string;
}

const DiaryDownloader: React.FC<DiaryDownloaderProps> = ({ className }) => {
  const minDate = new Date('2024-11-01');
  const today = new Date();

  const formatDateString = (date: Date) => {
    return format(date, 'yyyy-MM-dd');
  };

  const defaultStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [startDate, setStartDate] = useState<string>(formatDateString(defaultStartDate < minDate ? minDate : defaultStartDate));
  const [endDate, setEndDate] = useState<string>(formatDateString(today));
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
        const errorData = await response.json();
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
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="start-date">开始日期</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              min={formatDateString(minDate)}
              max={formatDateString(today)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end-date">结束日期</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={formatDateString(minDate)}
              max={formatDateString(today)}
            />
          </div>
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