import React, { useState } from 'react';
import { isVideoMedia, formatCoverMediaUrl } from '../utils/mediaUrl';
import { handleImageFallback } from '../utils/artworkHelper';
import { Music2 } from 'lucide-react';

interface MediaCoverProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackTitle?: string;
  fallbackGenre?: string;
  showBadge?: boolean;
}

export const MediaCover: React.FC<MediaCoverProps> = ({
  src,
  alt,
  className = 'w-full h-full object-cover',
  fallbackTitle = 'YouSong',
  fallbackGenre = 'Music',
  showBadge = false,
}) => {
  const [videoError, setVideoError] = useState(false);
  const formattedUrl = formatCoverMediaUrl(src);
  const isVideo = isVideoMedia(formattedUrl) && !videoError;

  if (isVideo && formattedUrl) {
    return (
      <div className="relative w-full h-full overflow-hidden">
        <video
          src={formattedUrl}
          autoPlay
          loop
          muted
          playsInline
          className={className}
          onError={() => setVideoError(true)}
        />
        {showBadge && (
          <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-black/60 text-white backdrop-blur-xs">
            VIDEO
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      <img
        src={formattedUrl || '/src/assets/images/lofi_study_glass_1791054585559.jpg'}
        alt={alt}
        className={className}
        onError={(e) => handleImageFallback(e, fallbackTitle, fallbackGenre)}
      />
      {/* Subtle background fallback icon container */}
      <div className="w-full h-full absolute inset-0 -z-10 flex items-center justify-center bg-slate-100 dark:bg-slate-900">
        <Music2 className="w-8 h-8 text-slate-300 dark:text-slate-700" />
      </div>
    </div>
  );
};
