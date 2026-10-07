import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

export function CmsMark({
  className,
  title = 'TechnoStar',
  variant = 'tile',
  ...props
}: ComponentProps<'svg'> & { title?: string; variant?: 'tile' | 'bare' }) {
  return (
    <svg
      aria-label={title}
      className={cn(variant === 'tile' && 'overflow-hidden rounded-[22%]', className)}
      role="img"
      viewBox="0 0 252 240"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <image href="/brand/technostar-star.png" height="240" width="252" />
    </svg>
  );
}

export function CmsWordmark({ className, title = 'TechnoStar', ...props }: ComponentProps<'span'> & { title?: string }) {
  return (
    <span
      aria-label={title}
      className={cn('inline-block select-none font-bold text-[#004ea2] dark:text-[#38bdf8] font-serif tracking-tight', className)}
      dir="ltr"
      role="img"
      {...props}
    >
      TechnoStar
    </span>
  );
}

export function TechnoStarLogo({
  alt = 'TechnoStar',
  className,
  variant = 'auto',
  ...props
}: ComponentProps<'img'> & { variant?: 'auto' | 'light' | 'dark' }) {
  if (variant === 'light') {
    return <img alt={alt} className={cn('h-8 w-auto object-contain', className)} src="/brand/technostar-logo.png" {...props} />;
  }
  if (variant === 'dark') {
    return <img alt={alt} className={cn('h-8 w-auto object-contain', className)} src="/brand/technostar-logo-dark.png" {...props} />;
  }
  return (
    <>
      <img alt={alt} className={cn('h-8 w-auto object-contain dark:hidden', className)} src="/brand/technostar-logo.png" {...props} />
      <img alt={alt} className={cn('hidden h-8 w-auto object-contain dark:block', className)} src="/brand/technostar-logo-dark.png" {...props} />
    </>
  );
}

export const cmsMark = CmsMark;
export const cmsWordmark = CmsWordmark;
export const TechnoStarMark = CmsMark;
export const TechnoStarWordmark = CmsWordmark;
