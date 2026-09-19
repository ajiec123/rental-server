import React from 'react';

interface AvatarProps {
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Override warna background (default: hash nama → palette) */
  color?: string;
  className?: string;
}

// Palette warna yang konsisten untuk background avatar
const PALETTE = [
  'bg-cyan-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-violet-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-blue-500',
];

/**
 * Pilih warna berdasarkan hash nama — karyawan sama akan selalu
 * dapat warna konsisten, tapi antar karyawan warna akan bervariasi.
 */
function pickColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}

/**
 * Inisial nama: kata pertama + (opsional) kata kedua, max 2 huruf.
 * "Budi Santoso" → "BS", "Rian" → "R", "Maya Lin" → "ML".
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'w-7 h-7 text-xs',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-2xl',
};

export const Avatar: React.FC<AvatarProps> = ({
  name,
  size = 'md',
  color,
  className = '',
}) => {
  const initials = getInitials(name);
  const bgColor = color ?? pickColor(name);
  return (
    <div
      className={`${SIZE_CLASSES[size]} ${bgColor} rounded-full border-2 border-white text-white font-extrabold flex items-center justify-center shrink-0 shadow-sm ${className}`}
      title={name}
    >
      {initials}
    </div>
  );
};
