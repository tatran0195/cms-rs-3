'use client';

import * as React from 'react';
import { type AriaTimeFieldProps, type TimeValue, useLocale, useTimeField } from 'react-aria';
import { useTimeFieldState } from 'react-stately';
import { DateSegment } from '@/components/date-segment';
import { clx } from '@/utils/clx';

const TimeInput = (props: AriaTimeFieldProps<TimeValue>) => {
  const ref = React.useRef<HTMLDivElement>(null);

  const { locale } = useLocale();
  const state = useTimeFieldState({
    ...props,
    locale,
  });
  const { fieldProps } = useTimeField(props, state, ref);

  return (
    <div
      ref={ref}
      {...fieldProps}
      className={clx('bg-ui-bg-field shadow-borders-base txt-compact-small flex items-center rounded-md px-2 py-1', {
        '': props.isDisabled,
      })}
    >
      {state.segments.map((segment) => (
        <DateSegment key={segment.type} segment={segment} state={state} />
      ))}
    </div>
  );
};

export { TimeInput };
