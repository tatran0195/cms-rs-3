import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export interface SidebarContextValue {
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  toggleCollapsed: () => void;
  collapsible: boolean;
}

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  setCollapsed: () => {},
  toggleCollapsed: () => {},
  collapsible: true,
});

export function SidebarProvider({
  collapsible = true,
  children,
}: {
  collapsible?: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const toggleCollapsed = () => {
    if (!collapsible) return;
    setCollapsed((prev) => !prev);
  };

  // Keyboard shortcut: Ctrl+B or Cmd+B to toggle sidebar collapse
  useEffect(() => {
    if (!collapsible || typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'b') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      e.preventDefault();
      setCollapsed((prev) => !prev);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [collapsible]);

  const value = useMemo(
    () => ({
      collapsed: collapsible ? collapsed : false,
      setCollapsed,
      toggleCollapsed,
      collapsible,
    }),
    [collapsed, collapsible],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarContextValue {
  return useContext(SidebarContext);
}
