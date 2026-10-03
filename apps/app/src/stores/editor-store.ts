import { useSyncExternalStore } from "react";

export type EditorSyncStatus = "idle" | "saving" | "saved" | "error";

export interface EditorState {
  // Sync & save lifecycle
  syncStatus: EditorSyncStatus;
  lastSavedAt: number | null;
  
  // View & UI panels
  view: "content" | "config";
  configSection: string;
  editorMode: "visual" | "wysiwyg" | "markdown";
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  mobileSidebarOpen: boolean;
  focusedTreeOpen: boolean;
  
  // Right auxiliary rail (comments / AI assist)
  railOpen: boolean;
  railTab: "comments" | "ai";
  commentMode: boolean;
  activeCommentId: string | null;
  pendingAnchor: { quote: string; from: number; to: number } | null;
  
  // Search in tree
  treeSearchQuery: string;
}

const DEFAULT_STATE: EditorState = {
  syncStatus: "idle",
  lastSavedAt: null,
  view: "content",
  configSection: "branding",
  editorMode: "visual",
  sidebarCollapsed: false,
  sidebarWidth: 260,
  mobileSidebarOpen: false,
  focusedTreeOpen: false,
  railOpen: false,
  railTab: "comments",
  commentMode: false,
  activeCommentId: null,
  pendingAnchor: null,
  treeSearchQuery: "",
};

type Listener = () => void;

class EditorStore {
  private state: EditorState;
  private listeners = new Set<Listener>();

  constructor() {
    this.state = { ...DEFAULT_STATE };
    if (typeof window !== "undefined") {
      try {
        const storedMode = window.localStorage.getItem("cms.editor.contentMode");
        if (storedMode === "wysiwyg" || storedMode === "markdown" || storedMode === "visual") {
          this.state.editorMode = storedMode;
        }
        const storedRail = window.localStorage.getItem("cms.editor.railOpen");
        if (storedRail !== null) {
          this.state.railOpen = storedRail === "1";
        }
        const storedWidth = Number(window.localStorage.getItem("cms.editor.sidebarWidth"));
        if (storedWidth >= 200 && storedWidth <= 520) {
          this.state.sidebarWidth = storedWidth;
        }
        const storedCollapsed = window.localStorage.getItem("cms.editor.sidebarCollapsed");
        if (storedCollapsed !== null) {
          this.state.sidebarCollapsed = storedCollapsed === "1";
        }
      } catch {
        // ignore localStorage access errors
      }
    }
  }

  public getState(): EditorState {
    return this.state;
  }

  public setState(partial: Partial<EditorState> | ((prev: EditorState) => Partial<EditorState>)) {
    const nextUpdates = typeof partial === "function" ? partial(this.state) : partial;
    let changed = false;
    for (const key of Object.keys(nextUpdates) as Array<keyof EditorState>) {
      if (this.state[key] !== nextUpdates[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;

    this.state = { ...this.state, ...nextUpdates };
    this.listeners.forEach((listener) => listener());
  }

  public subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  // Dedicated action setters with persistence
  public setSyncStatus(syncStatus: EditorSyncStatus) {
    this.setState({
      syncStatus,
      lastSavedAt: syncStatus === "saved" ? Date.now() : this.state.lastSavedAt,
    });
  }

  public setEditorMode(mode: "visual" | "wysiwyg" | "markdown") {
    this.setState({ editorMode: mode });
    try {
      window.localStorage.setItem("cms.editor.contentMode", mode);
    } catch {}
  }

  public setRailOpen(open: boolean) {
    this.setState({ railOpen: open });
    try {
      window.localStorage.setItem("cms.editor.railOpen", open ? "1" : "0");
    } catch {}
  }

  public setSidebarCollapsed(collapsed: boolean) {
    this.setState({ sidebarCollapsed: collapsed });
    try {
      window.localStorage.setItem("cms.editor.sidebarCollapsed", collapsed ? "1" : "0");
    } catch {}
  }

  public setSidebarWidth(width: number) {
    const clamped = Math.max(200, Math.min(520, width));
    this.setState({ sidebarWidth: clamped });
    try {
      window.localStorage.setItem("cms.editor.sidebarWidth", String(clamped));
    } catch {}
  }
}

export const editorStore = new EditorStore();

/**
 * Granular selector hook subscribing exclusively to atomic state slices.
 * Prevents whole-page re-renders across the editor, sidebar, and toolbars.
 */
export function useEditorStore<T>(selector: (state: EditorState) => T): T {
  return useSyncExternalStore(
    editorStore.subscribe,
    () => selector(editorStore.getState()),
    () => selector(DEFAULT_STATE),
  );
}
