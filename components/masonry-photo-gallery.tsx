"use client"

import { useState, useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type InvestmentImage = {
  id: string | number
  url: string
  alt: string
  path: string
}

interface MasonryPhotoGalleryProps {
  images: InvestmentImage[]
  className?: string
}

interface PhotoCardProps {
  image: InvestmentImage
  index: number
  onClick: (index: number) => void
}

interface LightboxProps {
  images: InvestmentImage[]
  currentIndex: number
  isOpen: boolean
  onClose: () => void
  onPrevious: () => void
  onNext: () => void
}

const PhotoCard = ({ image, index, onClick }: PhotoCardProps) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className="relative group overflow-hidden rounded-lg bg-gray-100 cursor-pointer break-inside-avoid mb-4"
      onClick={() => onClick(index)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <img
        src={image.url}
        alt={image.alt}
        className={cn(
          "w-full transition-transform duration-500 ease-out",
          isLoaded ? "opacity-100" : "opacity-0",
          isHovered ? "scale-105" : "scale-100"
        )}
        onLoad={() => setIsLoaded(true)}
        loading="lazy"
      />

      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        </div>
      )}

      <div
        className={cn(
          "absolute inset-0 bg-black/60 transition-opacity duration-300 flex items-center justify-center",
          isHovered ? "opacity-100" : "opacity-0"
        )}
      >
        <span className="text-white text-sm font-medium">点击查看大图</span>
      </div>
    </div>
  )
}

const Lightbox = ({
  images,
  currentIndex,
  isOpen,
  onClose,
  onPrevious,
  onNext
}: LightboxProps) => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return

    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowLeft') {
      onPrevious()
    } else if (e.key === 'ArrowRight') {
      onNext()
    }
  }, [isOpen, onClose, onPrevious, onNext])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!isOpen) return null

  const currentImage = images[currentIndex]

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={currentImage.url}
          alt={currentImage.alt}
          className="max-w-full max-h-[85vh] object-contain rounded-lg"
        />

        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors"
          aria-label="关闭"
        >
          <X className="w-8 h-8" />
        </button>

        {images.length > 1 && (
          <>
            <button
              onClick={onPrevious}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition-colors bg-black/50 rounded-full p-2 hover:bg-black/70"
              aria-label="上一张"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>

            <button
              onClick={onNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition-colors bg-black/50 rounded-full p-2 hover:bg-black/70"
              aria-label="下一张"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          </>
        )}

        <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 text-white text-sm font-medium">
          {currentIndex + 1} / {images.length}
        </div>
      </div>
    </div>
  )
}

const MasonryPhotoGallery = ({ images, className }: MasonryPhotoGalleryProps) => {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  const handleImageClick = (index: number) => {
    setCurrentImageIndex(index)
    setLightboxOpen(true)
  }

  const handleCloseLightbox = () => {
    setLightboxOpen(false)
  }

  const handlePrevious = () => {
    setCurrentImageIndex((prev) =>
      prev === 0 ? images.length - 1 : prev - 1
    )
  }

  const handleNext = () => {
    setCurrentImageIndex((prev) =>
      prev === images.length - 1 ? 0 : prev + 1
    )
  }

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 bg-gray-50 rounded-lg">
        <p className="text-gray-500">暂无图片</p>
      </div>
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      <Lightbox
        images={images}
        currentIndex={currentImageIndex}
        isOpen={lightboxOpen}
        onClose={handleCloseLightbox}
        onPrevious={handlePrevious}
        onNext={handleNext}
      />

      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
        {images.map((image, index) => (
          <PhotoCard
            key={image.id}
            image={image}
            index={index}
            onClick={handleImageClick}
          />
        ))}
      </div>

      <div className="text-center text-sm text-gray-500 mt-6">
        共 {images.length} 张照片
      </div>
    </div>
  )
}

export default MasonryPhotoGallery