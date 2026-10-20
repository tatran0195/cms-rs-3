'use client';

import type { ComponentProps } from 'react';

export function Breadcrumb(props: ComponentProps<'div'>) {
  return <div className="mb-2 md:hidden" {...props} />;
}
