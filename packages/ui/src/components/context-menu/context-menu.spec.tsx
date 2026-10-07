import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from './context-menu';

describe('ContextMenu', () => {
  it('renders trigger correctly', () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger data-testid="trigger">Right click me</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Item 1</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    expect(screen.getByTestId('trigger')).toBeInTheDocument();
    expect(screen.getByText('Right click me')).toBeInTheDocument();
  });

  it('exposes compound subcomponents on ContextMenu', () => {
    expect(ContextMenu.Trigger).toBeDefined();
    expect(ContextMenu.Content).toBeDefined();
    expect(ContextMenu.Item).toBeDefined();
    expect(ContextMenu.CheckboxItem).toBeDefined();
    expect(ContextMenu.RadioItem).toBeDefined();
    expect(ContextMenu.SubMenu).toBeDefined();
    expect(ContextMenu.SubMenuTrigger).toBeDefined();
    expect(ContextMenu.SubMenuContent).toBeDefined();
    expect(ContextMenu.Separator).toBeDefined();
    expect(ContextMenu.Label).toBeDefined();
    expect(ContextMenu.Shortcut).toBeDefined();
    expect(ContextMenu.Hint).toBeDefined();
  });
});
