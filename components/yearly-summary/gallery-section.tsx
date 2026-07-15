import type { ChangeEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import MasonryPhotoGallery from '@/components/masonry-photo-gallery'
import type { InvestmentImage } from '@/lib/yearlySummaryApi'

type Props = { images: InvestmentImage[]; isAdmin: boolean; isLoading: boolean; onUpload: (event: ChangeEvent<HTMLInputElement>) => void }

export function GallerySection({ images, isAdmin, isLoading, onUpload }: Props) {
  return <Card className="p-6">
    <h2 className="text-2xl font-bold mb-4">年度照片</h2>
    <div className="space-y-4">
      {isLoading ? <div className="flex justify-center items-center py-16"><div className="flex flex-col items-center gap-2"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /><p className="text-muted-foreground">加载图片中...</p></div></div> : <>
        <MasonryPhotoGallery images={images} />
        {isAdmin && <div className="flex justify-center mt-6"><div className="relative"><input type="file" accept="image/webp" onChange={onUpload} className="absolute inset-0 opacity-0 cursor-pointer" /><Button variant="outline">上传图片</Button></div></div>}
      </>}
    </div>
  </Card>
}
