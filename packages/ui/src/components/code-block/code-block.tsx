'use client';

import hljs from 'highlight.js';
import * as React from 'react';
import { Copy } from '@/components/copy';
import { TooltipProvider } from '@/components/tooltip';
import { clx } from '@/utils/clx';

export type CodeSnippet = {
  /**
   * The label of the code snippet's tab or file name.
   */
  label: string;
  /**
   * The language of the code snippet. For example, `tsx`, `bash`, `json`.
   */
  language: string;
  /**
   * The code snippet string.
   */
  code: string;
  /**
   * Whether to hide the line numbers shown at the left side of the code snippet.
   */
  hideLineNumbers?: boolean;
  /**
   * Whether to hide the copy button.
   */
  hideCopy?: boolean;
};

type CodeBlockState = {
  snippets: CodeSnippet[];
  active: CodeSnippet;
  setActive: (active: CodeSnippet) => void;
} | null;

const CodeBlockContext = React.createContext<CodeBlockState>(null);

const useCodeBlockContext = () => {
  const context = React.useContext(CodeBlockContext);

  if (context === null) {
    throw new Error('useCodeBlockContext can only be used within a CodeBlockContext');
  }

  return context;
};

type RootProps = {
  snippets: CodeSnippet[];
};

/**
 * CodeBlock component formatted according to Medusa UI specifications.
 */
const Root = ({ snippets, className, children, ...props }: React.HTMLAttributes<HTMLDivElement> & RootProps) => {
  const [active, setActive] = React.useState<CodeSnippet>(snippets[0] as CodeSnippet);

  React.useEffect(() => {
    if (snippets[0]) {
      setActive(snippets[0]);
    }
  }, [snippets]);

  return (
    <TooltipProvider>
      <CodeBlockContext.Provider value={{ snippets, active, setActive }}>
        <div
          className={clx(
            'bg-ui-contrast-bg-base shadow-elevation-code-block flex flex-col overflow-hidden rounded-xl border border-[#3D3D40] !border-[#3D3D40]',
            className,
          )}
          style={{ borderColor: '#3D3D40', ...props.style }}
          {...props}
        >
          {children}
        </div>
      </CodeBlockContext.Provider>
    </TooltipProvider>
  );
};
Root.displayName = 'CodeBlock';

type HeaderProps = {
  hideLabels?: boolean;
};

const HeaderComponent = ({ children, className, hideLabels = false, ...props }: React.HTMLAttributes<HTMLDivElement> & HeaderProps) => {
  const { snippets, active, setActive } = useCodeBlockContext();

  const isMultiSnippet = snippets.length > 1;

  return (
    <div className={clx('flex items-center justify-between px-4 pt-3 pb-2.5', className)} {...props}>
      {!hideLabels && (
        <div className="flex items-center gap-x-4">
          {isMultiSnippet ? (
            snippets.map((snippet) => {
              const isActive = active.label === snippet.label;
              return (
                <button
                  type="button"
                  key={snippet.label}
                  onClick={() => setActive(snippet)}
                  className={clx(
                    'txt-compact-small-plus transition-fg relative pb-1 cursor-pointer bg-transparent border-0 outline-none',
                    isActive ? 'text-ui-contrast-fg-primary' : 'text-ui-contrast-fg-secondary hover:text-ui-contrast-fg-primary',
                  )}
                >
                  <span>{snippet.label}</span>
                  {isActive && <span className="bg-ui-contrast-fg-primary absolute bottom-0 left-0 right-0 h-0.5 rounded-full" />}
                </button>
              );
            })
          ) : (
            <span className="txt-compact-small-plus text-ui-contrast-fg-secondary select-none">{active?.label}</span>
          )}
        </div>
      )}
      <div className="flex items-center gap-x-3 ml-auto">
        {children}
        {!active.hideCopy && (
          <Copy content={active.code} className="text-ui-contrast-fg-secondary hover:text-ui-contrast-fg-primary transition-colors" />
        )}
      </div>
    </div>
  );
};
HeaderComponent.displayName = 'CodeBlock.Header';

const Meta = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={clx('txt-compact-small text-ui-contrast-fg-secondary flex items-center gap-x-2', className)} {...props} />
);
Meta.displayName = 'CodeBlock.Header.Meta';

const Header = Object.assign(HeaderComponent, { Meta });

const Body = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  const { active } = useCodeBlockContext();

  const lines = React.useMemo(() => {
    if (!active?.code) return [''];
    const lang = active.language;
    const validLanguage = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
    const highlighted = hljs.highlight(active.code, { language: validLanguage }).value;
    return highlighted.split('\n');
  }, [active?.code, active?.language]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden min-h-0">
      {children && (
        <div
          className="border-t border-[#3D3D40] !border-[#3D3D40] flex min-h-10 items-center px-4 py-2 text-ui-contrast-fg-secondary txt-compact-small"
          style={{ borderTopColor: '#3D3D40' }}
        >
          {children}
        </div>
      )}
      <div className="flex-1 px-2 pb-2 min-h-0 overflow-hidden">
        <div
          className={clx(
            'bg-ui-contrast-bg-subtle border border-[#3D3D40] !border-[#3D3D40] relative h-full overflow-auto rounded-lg p-4 font-mono text-[13px] leading-relaxed cms-codeblock-hljs cms-codeblock-scrollbar',
            className,
          )}
          style={{ borderColor: '#3D3D40', ...props.style }}
          {...props}
        >
          <style>{`
            .cms-codeblock-hljs {
              border-color: #3D3D40 !important;
            }
            .cms-codeblock-scrollbar {
              scrollbar-width: thin;
              scrollbar-color: #52525b transparent;
            }
            .cms-codeblock-scrollbar::-webkit-scrollbar {
              width: 6px;
              height: 6px;
            }
            .cms-codeblock-scrollbar::-webkit-scrollbar-track {
              background: transparent;
            }
            .cms-codeblock-scrollbar::-webkit-scrollbar-thumb {
              background: #3f3f46;
              border-radius: 9999px;
            }
            .cms-codeblock-scrollbar::-webkit-scrollbar-thumb:hover {
              background: #52525b;
            }
            .cms-codeblock-scrollbar::-webkit-scrollbar-corner {
              background: transparent;
            }
            .cms-codeblock-hljs .hljs-comment,
            .cms-codeblock-hljs .hljs-quote {
              color: #6a6a78;
              font-style: italic;
            }
            .cms-codeblock-hljs .hljs-keyword,
            .cms-codeblock-hljs .hljs-selector-tag,
            .cms-codeblock-hljs .hljs-literal,
            .cms-codeblock-hljs .hljs-type {
              color: #c792ea;
            }
            .cms-codeblock-hljs .hljs-string,
            .cms-codeblock-hljs .hljs-title,
            .cms-codeblock-hljs .hljs-name,
            .cms-codeblock-hljs .hljs-attr {
              color: #c3e88d;
            }
            .cms-codeblock-hljs .hljs-number,
            .cms-codeblock-hljs .hljs-symbol,
            .cms-codeblock-hljs .hljs-bullet {
              color: #f78c6c;
            }
            .cms-codeblock-hljs .hljs-function,
            .cms-codeblock-hljs .hljs-built_in,
            .cms-codeblock-hljs .hljs-attribute {
              color: #82aaff;
            }
            .cms-codeblock-hljs .hljs-tag,
            .cms-codeblock-hljs .hljs-meta {
              color: #89ddff;
            }
            .cms-codeblock-hljs .hljs-variable,
            .cms-codeblock-hljs .hljs-template-variable {
              color: #f4f4f5;
            }
          `}</style>
          <pre className="select-text whitespace-pre overflow-visible m-0 p-0 bg-transparent">
            <code>
              {lines.map((lineHtml, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: lines don't have unique IDs
                <div key={i} className="flex min-w-fit pr-4">
                  {!active.hideLineNumbers && (
                    <span className="w-8 shrink-0 select-none text-right pr-4 text-ui-contrast-fg-secondary/40 font-mono text-[13px] tabular-nums">
                      {i + 1}
                    </span>
                  )}
                  <span
                    className="whitespace-pre font-mono text-[13px] text-ui-contrast-fg-primary"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: safe syntax highlighted HTML string from highlight.js
                    dangerouslySetInnerHTML={{ __html: lineHtml || '&nbsp;' }}
                  />
                </div>
              ))}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
};
Body.displayName = 'CodeBlock.Body';

const CodeBlock = Object.assign(Root, { Body, Header, Meta });

export { CodeBlock };
