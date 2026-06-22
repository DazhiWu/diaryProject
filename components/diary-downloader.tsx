'use client';

import React, { useState, useEffect } from 'react';
import { Calendar } from './ui/calendar';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';


interface DiaryDownloaderProps {
  className?: string;
}

const DatePicker = ({ value, onChange, label, minDate, maxDate }: { 
  value?: Date; 
  onChange: (date?: Date) => void; 
  label: string;
  minDate?: Date;
  maxDate?: Date;
}) => (
  <div className="space-y-2">
    <Label htmlFor={label}>{label}</Label>
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={label}
          variant="outline"
          className="w-full justify-start text-left font-normal transition-all hover:bg-accent hover:text-accent-foreground"
        >
          {value ? format(value, 'yyyy年MM月dd日', { locale: zhCN }) : <span className="text-muted-foreground">选择日期</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          className="rounded-md border"
          initialFocus
          captionLayout="dropdown"
          fromDate={minDate}
          toDate={maxDate}
          startMonth={minDate}
          endMonth={maxDate}
        />
      </PopoverContent>
    </Popover>
  </div>
);

const DiaryDownloader: React.FC<DiaryDownloaderProps> = ({ className }) => {
  const minDate = React.useMemo(() => new Date('2024-11-01'), []);
  const maxDate = new Date();

  // 日期状态管理
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>(maxDate);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const defaultStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      setStartDate(defaultStartDate < minDate ? minDate : defaultStartDate)
    }, 0)
    return () => clearTimeout(timer)
  }, [minDate])

  // 处理下载按钮点击
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
      // 调用API获取CSV数据
      const response = await fetch('/api/diary-download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: format(startDate, 'yyyy-MM-dd'),
          endDate: format(endDate, 'yyyy-MM-dd'),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '下载失败');
      }

      // 获取CSV数据
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      // 创建下载链接并触发下载
      const link = document.createElement('a');
      link.href = url;
      link.download = `diary_export_${format(startDate, 'yyyy-MM-dd')}_to_${format(endDate, 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(link);
      link.click();
      
      // 清理
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '下载日记时发生错误';
      // 检查是否为数据库超时错误
      if (errorMessage.includes('canceling statement due to statement timeout')) {
        setError('数据库无法一次性传输文本，建议选择更短时间范围内的日记下载');
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 格式化日期显示
  const formatDate = (date?: Date) => {
    if (!date) return '';
    return format(date, 'yyyy年MM月dd日', { locale: zhCN });
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
        <div className="grid gap-4 md:grid-cols-2">
          <DatePicker
            label="开始日期"
            value={startDate}
            onChange={setStartDate}
            minDate={minDate}
            maxDate={maxDate}
          />
          <DatePicker
            label="结束日期"
            value={endDate}
            onChange={setEndDate}
            minDate={minDate}
            maxDate={maxDate}
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