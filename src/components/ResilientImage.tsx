import { useState } from 'react';
import { Laptop, Smartphone, Utensils } from 'lucide-react';
import { ShopCategory } from '../types/marketplace';

interface ResilientImageProps {
  src?: string;
  alt: string;
  category?: ShopCategory;
  className?: string;
}

export function ResilientImage({
  src,
  alt,
  category = 'food',
  className = 'w-full h-full object-cover',
}: ResilientImageProps) {
  const [failed, setFailed] = useState(false);

  const isSafeUrl =
    typeof src === 'string' &&
    src.length > 0 &&
    (src.startsWith('/') || src.startsWith('data:image/') || src.startsWith('https://'));

  if (!isSafeUrl || failed) {
    const Icon =
      category === 'iphones'
        ? Smartphone
        : category === 'electronics'
          ? Laptop
          : Utensils;

    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#F3EFE8] to-[#E6DFD3] text-[#57534E] p-4 text-center">
        <Icon className="w-7 h-7 mb-2 opacity-70" />
        <span className="text-xs font-medium line-clamp-2 max-w-[16ch]">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
