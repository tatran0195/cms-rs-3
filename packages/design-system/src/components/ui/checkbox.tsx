"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { Check, Minus } from "lucide-react"
import { cn } from "../../lib/utils"

export type CheckboxCheckedState = boolean | "indeterminate"

export interface CheckboxProps
  extends Omit<CheckboxPrimitive.Root.Props, "checked" | "onCheckedChange"> {
  checked?: CheckboxCheckedState
  onCheckedChange?: (checked: CheckboxCheckedState) => void
  size?: "sm" | "default"
}

const Checkbox = React.memo(function Checkbox({
  className,
  checked,
  onCheckedChange,
  size = "default",
  ...props
}: CheckboxProps) {
  const isIndeterminate = checked === "indeterminate"
  const isChecked = checked === true

  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      data-size={size}
      checked={isChecked}
      indeterminate={isIndeterminate}
      onCheckedChange={(nextChecked) => {
        onCheckedChange?.(nextChecked)
      }}
      className={cn(
        "peer group/checkbox inline-flex shrink-0 box-border items-center justify-center rounded-[3px] border border-neutral-400 dark:border-neutral-500 bg-white dark:bg-neutral-900 shadow-xs outline-none transition-colors cursor-pointer select-none",
        size === "sm" ? "size-3.5" : "size-4",
        "hover:border-primary",
        "data-unchecked:hover:bg-neutral-100 dark:data-unchecked:hover:bg-neutral-800",
        "data-[state=unchecked]:hover:bg-neutral-100 dark:data-[state=unchecked]:hover:bg-neutral-800",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        "data-checked:bg-primary data-checked:border-primary data-checked:text-primary-foreground data-checked:hover:bg-primary/90 data-checked:hover:border-primary/90",
        "data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground data-[state=checked]:hover:bg-primary/90 data-[state=checked]:hover:border-primary/90",
        "data-indeterminate:bg-primary data-indeterminate:border-primary data-indeterminate:text-primary-foreground data-indeterminate:hover:bg-primary/90 data-indeterminate:hover:border-primary/90",
        "data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:text-primary-foreground data-[state=indeterminate]:hover:bg-primary/90 data-[state=indeterminate]:hover:border-primary/90",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex size-full items-center justify-center text-primary-foreground pointer-events-none"
      >
        {isIndeterminate ? (
          <Minus className={cn("stroke-[3] shrink-0", size === "sm" ? "size-2.5" : "size-3")} />
        ) : (
          <Check className={cn("stroke-[3] shrink-0", size === "sm" ? "size-2.5" : "size-3")} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
})

export { Checkbox }
