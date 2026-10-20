'use client';

import { cn } from '@cms/design-system/lib/utils';
import type { ComponentProps } from 'react';

export function Container(props: ComponentProps<'div'>) {
  return (
    <div
      id="nd-flux-layout"
      data-documentation-layout="flux"
      {...props}
      className={cn('flex flex-col items-center pb-24 overflow-x-clip min-h-screen w-full relative', props.className)}
    />
  );
}
