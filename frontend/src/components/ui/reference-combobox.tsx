import { useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ReferenceCombobox({
  value,
  onChange,
  options,
  placeholder,
  required,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  className?: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => option.toLowerCase().startsWith(query));
  }, [options, value]);

  const choose = (option: string): void => {
    onChange(option);
    setOpen(false);
    setActive(0);
  };

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <input
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
            setOpen(true);
          }}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActive((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter' && open && filtered[active]) {
              event.preventDefault();
              choose(filtered[active]);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          className="flex h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 pr-9 text-sm backdrop-blur transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Сонголт нээх"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronDown className="size-4" />
        </button>
      </div>

      {open && filtered.length > 0 ? (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-white/12 bg-[hsl(240_18%_7%)]/98 p-1 shadow-glass backdrop-blur-2xl">
          {filtered.map((option, index) => (
            <button
              key={option}
              type="button"
              className={cn(
                'block w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                index === active ? 'bg-white/[0.08] text-foreground' : 'text-muted-foreground hover:bg-white/[0.05]',
              )}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(option)}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
