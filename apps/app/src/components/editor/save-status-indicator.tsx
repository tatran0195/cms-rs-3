import { useT } from '@cms/i18n/react';
import { Check, Loader2 } from 'lucide-react';
import { memo } from 'react';
import { useEditorStore } from '@/stores/editor-store';

/**
 * Isolated atomic save status indicator. Subscribes specifically to `syncStatus`
 * from `editorStore` via useSyncExternalStore, ensuring save pulses, timeouts,
 * and background status updates do not trigger re-renders in the main editor or page tree.
 */
export const SaveStatusIndicator = memo(function SaveStatusIndicator() {
  const t = useT();
  const syncStatus = useEditorStore((s) => s.syncStatus);

  if (syncStatus === 'idle') {
    return null;
  }

  return (
    <span className="hidden items-center gap-1.5 text-muted-foreground text-xs lg:flex" role="status">
      {syncStatus === 'saving' ? (
        <>
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
          <span>{t('editor.savingShort')}</span>
        </>
      ) : syncStatus === 'saved' ? (
        <>
          <Check className="size-3 text-primary" />
          <span>{t('editor.savedShort')}</span>
        </>
      ) : null}
    </span>
  );
});
