import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

export function GoogleIcon({ className, ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.53 5.53 0 0 1-2.39 3.62v3.01h3.87c2.27-2.09 3.56-5.16 3.56-8.82Z" />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3.01c-1.07.72-2.44 1.14-4.07 1.14-3.13 0-5.78-2.11-6.73-4.95H1.26v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.27A7.21 7.21 0 0 1 4.9 12c0-.79.13-1.56.37-2.27V6.62H1.26A12 12 0 0 0 0 12c0 1.93.46 3.75 1.26 5.38l4.01-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.78c1.76 0 3.35.61 4.6 1.8l3.43-3.43A11.49 11.49 0 0 0 12 0 12 12 0 0 0 1.26 6.62l4.01 3.11C6.22 6.89 8.87 4.78 12 4.78Z"
      />
    </svg>
  );
}
