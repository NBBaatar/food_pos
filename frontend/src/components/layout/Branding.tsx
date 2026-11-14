import { useQuery } from '@tanstack/react-query';
import { ScanLine } from 'lucide-react';
import { brandingApi } from '@/lib/api';
import { cn } from '@/lib/utils';

const FALLBACK = {
  companyName: 'Food POS',
  footerText: 'Хоолны бүртгэлийн систем',
  copyright: `© ${new Date().getFullYear()} Food POS`,
  logoUrl: null as string | null,
};

export function useBranding() {
  return useQuery({
    queryKey: ['branding'],
    queryFn: brandingApi.get,
    staleTime: 60_000,
  });
}

interface BrandingIdentityProps {
  className?: string;
  logoClassName?: string;
  nameClassName?: string;
  showSubtitle?: boolean;
}

/** Header дээрх лого болон админаас оруулсан компанийн нэр */
export function BrandingIdentity({
  className,
  logoClassName,
  nameClassName,
  showSubtitle = true,
}: BrandingIdentityProps): JSX.Element {
  const { data } = useBranding();
  const logoUrl = data?.logoUrl ?? null;
  const companyName = data?.companyName?.trim() || FALLBACK.companyName;

  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={companyName}
          className={cn('max-h-12 max-w-[180px] shrink-0 object-contain', logoClassName)}
        />
      ) : (
        <span
          className={cn(
            'grid size-12 shrink-0 place-items-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-glow',
            logoClassName,
          )}
        >
          <ScanLine className="size-6" />
        </span>
      )}
      <div className="min-w-0">
        <p className={cn('truncate text-base font-semibold tracking-tight', nameClassName)}>
          {companyName}
        </p>
        {showSubtitle ? <p className="text-[10px] text-muted-foreground">Хоолны бүртгэл</p> : null}
      </div>
    </div>
  );
}

/** Лого дангаар нь (жишээ нь нэвтрэх хуудасны буланд) */
export function BrandingLogo({ className }: { className?: string }): JSX.Element {
  const { data } = useBranding();
  const logoUrl = data?.logoUrl ?? null;

  if (logoUrl) {
    return <img src={logoUrl} alt="Лого" className={cn('max-h-9 max-w-[160px] object-contain', className)} />;
  }

  return (
    <span className={cn('flex items-center gap-2 text-xs font-semibold text-muted-foreground', className)}>
      <ScanLine className="size-4 text-primary" />
      Food POS
    </span>
  );
}

/** Бүх хуудсанд харагдах footer */
export function SiteFooter({ className }: { className?: string }): JSX.Element {
  const { data } = useBranding();
  const footerText = data?.footerText || FALLBACK.footerText;
  const copyright = data?.copyright || FALLBACK.copyright;

  return (
    <footer
      className={cn(
        'flex flex-col gap-1 border-t border-white/[0.06] px-4 py-4 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-8',
        className,
      )}
    >
      <p>{footerText}</p>
      <p>{copyright}</p>
    </footer>
  );
}
