import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-white/15 bg-white/[0.06] text-foreground',
        success: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
        warning: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
        danger: 'border-rose-400/25 bg-rose-400/10 text-rose-200',
        info: 'border-sky-400/25 bg-sky-400/10 text-sky-200',
        gold: 'border-primary/30 bg-primary/10 text-primary',
        outline: 'border-white/15 text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps): JSX.Element {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
