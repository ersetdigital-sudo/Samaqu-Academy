'use client';

import NextLink, { type LinkProps } from 'next/link';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

type AppLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    children?: ReactNode;
  };

export function AppLink({ prefetch, ...props }: AppLinkProps) {
  void prefetch;
  return <NextLink prefetch={false} {...props} />;
}
