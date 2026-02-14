import { Link, useLocation } from "wouter";
import { prefetchRoute } from "@/lib/prefetch";
import { useCallback, useRef, startTransition, AnchorHTMLAttributes } from "react";

interface PrefetchLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  prefetch?: boolean;
  useTransition?: boolean;
  children: React.ReactNode;
}

export function PrefetchLink({ 
  href, 
  children, 
  className,
  prefetch = true,
  useTransition = true,
  onMouseEnter,
  onFocus,
  onClick,
  ...props 
}: PrefetchLinkProps) {
  const prefetched = useRef(false);
  const [, setLocation] = useLocation();

  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    if (prefetch && !prefetched.current) {
      prefetched.current = true;
      prefetchRoute(href);
    }
    onMouseEnter?.(e);
  }, [href, prefetch, onMouseEnter]);

  const handleFocus = useCallback((e: React.FocusEvent<HTMLAnchorElement>) => {
    if (prefetch && !prefetched.current) {
      prefetched.current = true;
      prefetchRoute(href);
    }
    onFocus?.(e);
  }, [href, prefetch, onFocus]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return;
    
    e.preventDefault();
    
    if (useTransition) {
      startTransition(() => {
        setLocation(href);
      });
    } else {
      setLocation(href);
    }
  }, [href, onClick, setLocation, useTransition]);

  return (
    <Link
      href={href}
      className={className}
      onMouseEnter={handleMouseEnter}
      onFocus={handleFocus}
      onClick={handleClick}
      {...props}
    >
      {children}
    </Link>
  );
}
