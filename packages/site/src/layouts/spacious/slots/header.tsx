'use client';

import { cn } from '@cms/design-system/lib/utils';
import type { ComponentProps, ReactNode } from 'react';

export interface HeaderProps extends ComponentProps<'div'> {
  mobileHeader?: ReactNode;
  hasGranular?: boolean;
}

export function Header({ mobileHeader, hasGranular = false, className, ...props }: HeaderProps) {
  return (
    <div className={cn('[grid-area:header]', hasGranular && 'md:hidden', className)} {...props}>
      {mobileHeader}
    </div>
  );
}
