import {
  ArrowPath,
  ChevronRight,
  DocumentText,
  EllipsisHorizontal,
  Folder,
  MagnifyingGlass,
  PencilSquare,
  Plus,
  SquareTwoStack,
  Trash,
} from '@cms/icons';
import type { Meta, StoryObj } from '@storybook/react';
import * as React from 'react';
import { ContextMenu } from './context-menu';

const meta: Meta<typeof ContextMenu> = {
  title: 'Components/ContextMenu',
  component: ContextMenu,
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj<typeof ContextMenu>;

export const Default: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenu.Trigger className="border-ui-border-base text-ui-fg-subtle txt-compact-small flex h-[220px] w-[360px] items-center justify-center rounded-lg border border-dashed select-none">
        Right click here
      </ContextMenu.Trigger>
      <ContextMenu.Content className="w-[260px]">
        <ContextMenu.Item className="gap-x-2">
          <PencilSquare className="text-ui-fg-subtle" />
          Edit
          <ContextMenu.Shortcut>⌘E</ContextMenu.Shortcut>
        </ContextMenu.Item>
        <ContextMenu.Item className="gap-x-2">
          <Plus className="text-ui-fg-subtle" />
          Add Item
          <ContextMenu.Shortcut>⌘N</ContextMenu.Shortcut>
        </ContextMenu.Item>
        <ContextMenu.Item className="gap-x-2">
          <SquareTwoStack className="text-ui-fg-subtle" />
          Duplicate
          <ContextMenu.Shortcut>⌘D</ContextMenu.Shortcut>
        </ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.Item className="gap-x-2" disabled>
          <DocumentText className="text-ui-fg-subtle" />
          View Details
          <ContextMenu.Hint>Locked</ContextMenu.Hint>
        </ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.Item className="gap-x-2 text-ui-fg-error focus:text-ui-fg-error">
          <Trash className="text-ui-fg-error" />
          Delete
          <ContextMenu.Shortcut>⌫</ContextMenu.Shortcut>
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu>
  ),
};

export const WithSubmenus: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenu.Trigger className="border-ui-border-base text-ui-fg-subtle txt-compact-small flex h-[220px] w-[360px] items-center justify-center rounded-lg border border-dashed select-none">
        Right click for Submenus
      </ContextMenu.Trigger>
      <ContextMenu.Content className="w-[260px]">
        <ContextMenu.Item className="gap-x-2">
          <Folder className="text-ui-fg-subtle" />
          New Folder
        </ContextMenu.Item>
        <ContextMenu.Item className="gap-x-2">
          <DocumentText className="text-ui-fg-subtle" />
          New File
        </ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.SubMenu>
          <ContextMenu.SubMenuTrigger className="gap-x-2">
            <EllipsisHorizontal className="text-ui-fg-subtle" />
            More Tools
          </ContextMenu.SubMenuTrigger>
          <ContextMenu.SubMenuContent className="w-[220px]">
            <ContextMenu.Item className="gap-x-2">
              <MagnifyingGlass className="text-ui-fg-subtle" />
              Search in Folder
            </ContextMenu.Item>
            <ContextMenu.Item className="gap-x-2">
              <ArrowPath className="text-ui-fg-subtle" />
              Sync Changes
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Item>Developer Tools</ContextMenu.Item>
            <ContextMenu.Item>Terminal</ContextMenu.Item>
          </ContextMenu.SubMenuContent>
        </ContextMenu.SubMenu>
        <ContextMenu.Separator />
        <ContextMenu.Item className="gap-x-2 text-ui-fg-error focus:text-ui-fg-error">
          <Trash className="text-ui-fg-error" />
          Remove
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu>
  ),
};

export const SelectMenu: Story = {
  render: () => {
    const [currencies, setCurrencies] = React.useState<string[]>(['EUR']);
    const [viewMode, setViewMode] = React.useState('compact');

    const toggleCurrency = (currency: string) => {
      setCurrencies((prev) => (prev.includes(currency) ? prev.filter((c) => c !== currency) : [...prev, currency]));
    };

    return (
      <ContextMenu>
        <ContextMenu.Trigger className="border-ui-border-base text-ui-fg-subtle txt-compact-small flex h-[220px] w-[360px] items-center justify-center rounded-lg border border-dashed select-none">
          Right click for Options & Radio
        </ContextMenu.Trigger>
        <ContextMenu.Content className="w-[260px]">
          <ContextMenu.Group>
            <ContextMenu.Label>Currencies</ContextMenu.Label>
            <ContextMenu.CheckboxItem checked={currencies.includes('EUR')} onCheckedChange={() => toggleCurrency('EUR')}>
              EUR
              <ContextMenu.Hint>Euro</ContextMenu.Hint>
            </ContextMenu.CheckboxItem>
            <ContextMenu.CheckboxItem checked={currencies.includes('USD')} onCheckedChange={() => toggleCurrency('USD')}>
              USD
              <ContextMenu.Hint>US Dollar</ContextMenu.Hint>
            </ContextMenu.CheckboxItem>
            <ContextMenu.CheckboxItem checked={currencies.includes('DKK')} onCheckedChange={() => toggleCurrency('DKK')}>
              DKK
              <ContextMenu.Hint>Danish Krone</ContextMenu.Hint>
            </ContextMenu.CheckboxItem>
          </ContextMenu.Group>
          <ContextMenu.Separator />
          <ContextMenu.Group>
            <ContextMenu.Label>Layout Mode</ContextMenu.Label>
            <ContextMenu.RadioGroup value={viewMode} onValueChange={setViewMode}>
              <ContextMenu.RadioItem value="compact">
                Compact
                <ContextMenu.Hint>Dense</ContextMenu.Hint>
              </ContextMenu.RadioItem>
              <ContextMenu.RadioItem value="standard">
                Standard
                <ContextMenu.Hint>Default</ContextMenu.Hint>
              </ContextMenu.RadioItem>
              <ContextMenu.RadioItem value="relaxed">
                Relaxed
                <ContextMenu.Hint>Spacious</ContextMenu.Hint>
              </ContextMenu.RadioItem>
            </ContextMenu.RadioGroup>
          </ContextMenu.Group>
        </ContextMenu.Content>
      </ContextMenu>
    );
  },
};
