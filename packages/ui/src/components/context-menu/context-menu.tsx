'use client';

import { CheckMini, ChevronRightMini, EllipseMiniSolid } from '@cms/icons';
import { ContextMenu as RadixContextMenu } from 'radix-ui';
import * as React from 'react';
import { clx } from '@/utils/clx';

/**
 * This component is based on the [Radix UI Context Menu](https://www.radix-ui.com/primitives/docs/components/context-menu) primitive.
 */
const Root = RadixContextMenu.Root;
Root.displayName = 'ContextMenu';

/**
 * This component is based on the [Radix UI Context Menu Trigger](https://www.radix-ui.com/primitives/docs/components/context-menu#trigger) primitive.
 */
const Trigger = RadixContextMenu.Trigger;
Trigger.displayName = 'ContextMenu.Trigger';

/**
 * This component is based on the [Radix UI Context Menu Group](https://www.radix-ui.com/primitives/docs/components/context-menu#group) primitive.
 */
const Group = RadixContextMenu.Group;
Group.displayName = 'ContextMenu.Group';

/**
 * This component is based on the [Radix UI Context Menu Portal](https://www.radix-ui.com/primitives/docs/components/context-menu#portal) primitive.
 */
const Portal = RadixContextMenu.Portal;
Portal.displayName = 'ContextMenu.Portal';

/**
 * This component is based on the [Radix UI Context Menu Sub](https://www.radix-ui.com/primitives/docs/components/context-menu#sub) primitive.
 */
const SubMenu = RadixContextMenu.Sub;
SubMenu.displayName = 'ContextMenu.SubMenu';

/**
 * This component is based on the [Radix UI Context Menu RadioGroup](https://www.radix-ui.com/primitives/docs/components/context-menu#radiogroup) primitive.
 */
const RadioGroup = RadixContextMenu.RadioGroup;
RadioGroup.displayName = 'ContextMenu.RadioGroup';

/**
 * This component is based on the [Radix UI Context Menu SubTrigger](https://www.radix-ui.com/primitives/docs/components/context-menu#subtrigger) primitive.
 */
const SubMenuTrigger = React.forwardRef<
  React.ComponentRef<typeof RadixContextMenu.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof RadixContextMenu.SubTrigger>
>(({ className, children, ...props }, ref) => (
  <RadixContextMenu.SubTrigger
    ref={ref}
    className={clx(
      'bg-ui-bg-component text-ui-fg-base txt-compact-small relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 outline-none transition-colors',
      'focus-visible:bg-ui-bg-component-hover focus:bg-ui-bg-component-hover',
      'active:bg-ui-bg-component-hover',
      'data-[disabled]:text-ui-fg-disabled data-[disabled]:pointer-events-none',
      'data-[state=open]:!bg-ui-bg-component-hover',
      className,
    )}
    {...props}
  >
    {children}
    <ChevronRightMini className="text-ui-fg-muted ml-auto" />
  </RadixContextMenu.SubTrigger>
));
SubMenuTrigger.displayName = 'ContextMenu.SubMenuTrigger';

/**
 * This component is based on the [Radix UI Context Menu SubContent](https://www.radix-ui.com/primitives/docs/components/context-menu#subcontent) primitive.
 */
const SubMenuContent = React.forwardRef<
  React.ComponentRef<typeof RadixContextMenu.SubContent>,
  React.ComponentPropsWithoutRef<typeof RadixContextMenu.SubContent>
>(({ className, collisionPadding = 8, ...props }, ref) => (
  <RadixContextMenu.Portal>
    <RadixContextMenu.SubContent
      ref={ref}
      collisionPadding={collisionPadding}
      className={clx(
        'bg-ui-bg-component text-ui-fg-base shadow-elevation-flyout max-h-[var(--radix-popper-available-height)] min-w-[220px] overflow-hidden rounded-lg p-1',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className,
      )}
      {...props}
    />
  </RadixContextMenu.Portal>
));
SubMenuContent.displayName = 'ContextMenu.SubMenuContent';

/**
 * This component is based on the [Radix UI Context Menu Content](https://www.radix-ui.com/primitives/docs/components/context-menu#content) primitive.
 */
const Content = React.forwardRef<
  React.ComponentRef<typeof RadixContextMenu.Content>,
  React.ComponentPropsWithoutRef<typeof RadixContextMenu.Content>
>(({ className, collisionPadding = 8, ...props }, ref) => (
  <RadixContextMenu.Portal>
    <RadixContextMenu.Content
      ref={ref}
      collisionPadding={collisionPadding}
      className={clx(
        'bg-ui-bg-component text-ui-fg-base shadow-elevation-flyout max-h-[var(--radix-popper-available-height)] min-w-[220px] overflow-hidden rounded-lg p-1',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className,
      )}
      {...props}
    />
  </RadixContextMenu.Portal>
));
Content.displayName = 'ContextMenu.Content';

/**
 * This component is based on the [Radix UI Context Menu Item](https://www.radix-ui.com/primitives/docs/components/context-menu#item) primitive.
 */
const Item = React.forwardRef<React.ComponentRef<typeof RadixContextMenu.Item>, React.ComponentPropsWithoutRef<typeof RadixContextMenu.Item>>(
  ({ className, ...props }, ref) => (
    <RadixContextMenu.Item
      ref={ref}
      className={clx(
        'bg-ui-bg-component text-ui-fg-base txt-compact-small relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 outline-none transition-colors',
        'focus-visible:bg-ui-bg-component-hover focus:bg-ui-bg-component-hover',
        'active:bg-ui-bg-component-hover',
        'data-[disabled]:text-ui-fg-disabled data-[disabled]:pointer-events-none',
        className,
      )}
      {...props}
    />
  ),
);
Item.displayName = 'ContextMenu.Item';

/**
 * This component is based on the [Radix UI Context Menu CheckboxItem](https://www.radix-ui.com/primitives/docs/components/context-menu#checkboxitem) primitive.
 */
const CheckboxItem = React.forwardRef<
  React.ComponentRef<typeof RadixContextMenu.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof RadixContextMenu.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <RadixContextMenu.CheckboxItem
    ref={ref}
    className={clx(
      'bg-ui-bg-component text-ui-fg-base txt-compact-small relative flex cursor-pointer select-none items-center rounded-md py-1.5 pl-[31px] pr-2 outline-none transition-colors',
      'focus-visible:bg-ui-bg-component-hover focus:bg-ui-bg-component-hover',
      'active:bg-ui-bg-component-hover',
      'data-[disabled]:text-ui-fg-disabled data-[disabled]:pointer-events-none',
      'data-[state=checked]:txt-compact-small-plus',
      className,
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex size-[15px] items-center justify-center">
      <RadixContextMenu.ItemIndicator>
        <CheckMini />
      </RadixContextMenu.ItemIndicator>
    </span>
    {children}
  </RadixContextMenu.CheckboxItem>
));
CheckboxItem.displayName = 'ContextMenu.CheckboxItem';

/**
 * This component is based on the [Radix UI Context Menu RadioItem](https://www.radix-ui.com/primitives/docs/components/context-menu#radioitem) primitive.
 */
const RadioItem = React.forwardRef<
  React.ComponentRef<typeof RadixContextMenu.RadioItem>,
  React.ComponentPropsWithoutRef<typeof RadixContextMenu.RadioItem>
>(({ className, children, ...props }, ref) => (
  <RadixContextMenu.RadioItem
    ref={ref}
    className={clx(
      'bg-ui-bg-component txt-compact-small relative flex cursor-pointer select-none items-center rounded-md py-1.5 pl-[31px] pr-2 outline-none transition-colors',
      'focus-visible:bg-ui-bg-component-hover focus:bg-ui-bg-component-hover',
      'active:bg-ui-bg-component-hover',
      'data-[disabled]:text-ui-fg-disabled data-[disabled]:pointer-events-none',
      'data-[state=checked]:txt-compact-small-plus',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex size-[15px] items-center justify-center">
      <RadixContextMenu.ItemIndicator>
        <EllipseMiniSolid className="text-ui-fg-base" />
      </RadixContextMenu.ItemIndicator>
    </span>
    {children}
  </RadixContextMenu.RadioItem>
));
RadioItem.displayName = 'ContextMenu.RadioItem';

/**
 * This component is based on the [Radix UI Context Menu Label](https://www.radix-ui.com/primitives/docs/components/context-menu#label) primitive.
 */
const Label = React.forwardRef<React.ComponentRef<typeof RadixContextMenu.Label>, React.ComponentPropsWithoutRef<typeof RadixContextMenu.Label>>(
  ({ className, ...props }, ref) => (
    <RadixContextMenu.Label ref={ref} className={clx('text-ui-fg-subtle txt-compact-xsmall-plus', className)} {...props} />
  ),
);
Label.displayName = 'ContextMenu.Label';

/**
 * This component is based on the [Radix UI Context Menu Separator](https://www.radix-ui.com/primitives/docs/components/context-menu#separator) primitive.
 */
const Separator = React.forwardRef<
  React.ComponentRef<typeof RadixContextMenu.Separator>,
  React.ComponentPropsWithoutRef<typeof RadixContextMenu.Separator>
>(({ className, ...props }, ref) => (
  <RadixContextMenu.Separator
    ref={ref}
    className={clx('bg-ui-border-component border-t-ui-border-menu-top border-b-ui-border-menu-bot -mx-1 my-1 h-0.5 border-b border-t', className)}
    {...props}
  />
));
Separator.displayName = 'ContextMenu.Separator';

/**
 * This component is based on the `span` element and supports all of its props
 */
const Shortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={clx('text-ui-fg-subtle txt-compact-small ml-auto tracking-widest', className)} {...props} />
);
Shortcut.displayName = 'ContextMenu.Shortcut';

/**
 * This component is based on the `span` element and supports all of its props
 */
const Hint = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={clx('text-ui-fg-subtle txt-compact-small ml-auto tracking-widest', className)} {...props} />
);
Hint.displayName = 'ContextMenu.Hint';

const ContextMenu = Object.assign(Root, {
  Trigger,
  Group,
  Portal,
  SubMenu,
  SubMenuContent,
  SubMenuTrigger,
  Content,
  Item,
  CheckboxItem,
  RadioGroup,
  RadioItem,
  Label,
  Separator,
  Shortcut,
  Hint,
});

export {
  CheckboxItem as ContextMenuCheckboxItem,
  Content as ContextMenuContent,
  ContextMenu,
  Group as ContextMenuGroup,
  Hint as ContextMenuHint,
  Item as ContextMenuItem,
  Label as ContextMenuLabel,
  Portal as ContextMenuPortal,
  RadioGroup as ContextMenuRadioGroup,
  RadioItem as ContextMenuRadioItem,
  Root as ContextMenuRoot,
  Separator as ContextMenuSeparator,
  Shortcut as ContextMenuShortcut,
  SubMenu as ContextMenuSub,
  SubMenuContent as ContextMenuSubContent,
  SubMenuTrigger as ContextMenuSubTrigger,
  Trigger as ContextMenuTrigger,
};
