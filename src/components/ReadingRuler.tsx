import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, EyeOff, Lock, Unlock } from 'lucide-react';
import type { RulerColor, RulerFocusArea } from '@/settings';

interface ReadingRulerProps {
  enabled: boolean;
  height: number;
  color: RulerColor;
  opacity: number;
  focusArea: RulerFocusArea;
  dark: boolean;
  onDisable: () => void;
  children: ReactNode;
}

const RULER_COLOR_STYLES: Record<
  RulerColor,
  { border: string; tint: string }
> = {
  teal: {
    border: 'rgba(13, 125, 110, 0.78)',
    tint: 'rgba(31, 175, 156, 0.10)',
  },
  amber: {
    border: 'rgba(217, 119, 6, 0.78)',
    tint: 'rgba(251, 191, 36, 0.14)',
  },
  blue: {
    border: 'rgba(2, 132, 199, 0.78)',
    tint: 'rgba(56, 189, 248, 0.13)',
  },
  rose: {
    border: 'rgba(226, 87, 76, 0.78)',
    tint: 'rgba(226, 87, 76, 0.11)',
  },
  neutral: {
    border: 'rgba(100, 116, 139, 0.75)',
    tint: 'rgba(148, 163, 184, 0.10)',
  },
};

export function ReadingRuler({
  enabled,
  height,
  color,
  opacity,
  focusArea,
  dark,
  onDisable,
  children,
}: ReadingRulerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [rulerY, setRulerY] = useState(140);
  const [locked, setLocked] = useState(false);

  const areaMultiplier =
    focusArea === 'narrow' ? 0.75 : focusArea === 'wide' ? 1.45 : 1;
  const effectiveHeight = Math.round(height * areaMultiplier);

  const moveRuler = (deltaY: number) => {
    const container = containerRef.current;
    const maxH = container ? container.clientHeight : 600;
    setRulerY((prev) =>
      Math.max(effectiveHeight / 2, Math.min(maxH - effectiveHeight / 2, prev + deltaY)),
    );
  };

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
      const step = Math.max(24, Math.round(effectiveHeight * 0.65));
      const container = containerRef.current;
      const maxH = container ? container.clientHeight : 600;
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        setLocked(true);
        setRulerY((prev) =>
          Math.max(
            effectiveHeight / 2,
            Math.min(maxH - effectiveHeight / 2, prev + step),
          ),
        );
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        setLocked(true);
        setRulerY((prev) =>
          Math.max(
            effectiveHeight / 2,
            Math.min(maxH - effectiveHeight / 2, prev - step),
          ),
        );
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, effectiveHeight]);

  if (!enabled) {
    return <>{children}</>;
  }

  const updateFromClientY = (clientY: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const localY = clientY - rect.top;
    const clamped = Math.max(
      effectiveHeight / 2,
      Math.min(rect.height - effectiveHeight / 2, localY),
    );
    setRulerY(clamped);
  };

  const palette = RULER_COLOR_STYLES[color];
  const maskRgba = dark
    ? `rgba(6, 12, 22, ${opacity.toFixed(2)})`
    : `rgba(15, 27, 46, ${(opacity * 0.68).toFixed(2)})`;

  const topMaskHeight = Math.max(0, rulerY - effectiveHeight / 2);

  return (
    <div
      ref={containerRef}
      className="relative select-text"
      onPointerMove={(e) => {
        if (!locked && e.pointerType === 'mouse') {
          updateFromClientY(e.clientY);
        }
      }}
      onPointerDown={(e) => {
        // Touch & click repositioning support
        if (e.pointerType !== 'mouse') {
          updateFromClientY(e.clientY);
        }
      }}
    >
      {/* Floating quick bar for keyboard/touch users */}
      <div
        className={`sticky top-16 z-20 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm ${
          dark
            ? 'border-[#2D4366] bg-[#0F1B2E]/95 text-[#FAF6EC]'
            : 'border-cream-200 bg-white/95 text-navy-900'
        }`}
      >
        <span>
          Reading Ruler active — move pointer, tap line, or press ↑ / ↓
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setLocked(true);
              moveRuler(-Math.max(24, Math.round(effectiveHeight * 0.65)));
            }}
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 min-h-[32px] ${
              dark
                ? 'border-[#2D4366] bg-[#1A2D49] text-[#FAF6EC]'
                : 'border-cream-200 bg-cream-50 text-navy-800'
            }`}
            aria-label="Move reading ruler up"
            title="Move ruler up"
          >
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            Up
          </button>
          <button
            type="button"
            onClick={() => {
              setLocked(true);
              moveRuler(Math.max(24, Math.round(effectiveHeight * 0.65)));
            }}
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 min-h-[32px] ${
              dark
                ? 'border-[#2D4366] bg-[#1A2D49] text-[#FAF6EC]'
                : 'border-cream-200 bg-cream-50 text-navy-800'
            }`}
            aria-label="Move reading ruler down"
            title="Move ruler down"
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            Down
          </button>
          <button
            type="button"
            onClick={() => setLocked((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 min-h-[32px] ${
              locked
                ? 'border-teal-500 bg-teal-600 text-white'
                : dark
                  ? 'border-[#2D4366] bg-[#1A2D49] text-[#FAF6EC]'
                  : 'border-cream-200 bg-cream-50 text-navy-800'
            }`}
            title={locked ? 'Unlock pointer follow' : 'Lock ruler position'}
          >
            {locked ? (
              <Lock className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Unlock className="h-3.5 w-3.5" aria-hidden />
            )}
            {locked ? 'Locked' : 'Follow'}
          </button>
          <button
            type="button"
            onClick={onDisable}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 min-h-[32px] ${
              dark
                ? 'border-[#2D4366] bg-[#1A2D49] text-[#FF8A80]'
                : 'border-cream-200 bg-white text-coral-600'
            }`}
          >
            <EyeOff className="h-3.5 w-3.5" aria-hidden />
            Turn off
          </button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl">
        {children}

        {/* Overlay mask + spotlight band (pointer-events-none so text stays selectable & clickable) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
        >
          {/* Top dim mask */}
          <div
            style={{
              height: `${topMaskHeight}px`,
              backgroundColor: maskRgba,
            }}
          />
          {/* Clear spotlight band */}
          <div
            style={{
              height: `${effectiveHeight}px`,
              backgroundColor: palette.tint,
              borderTop: `2px solid ${palette.border}`,
              borderBottom: `2px solid ${palette.border}`,
            }}
          />
          {/* Bottom dim mask */}
          <div
            className="h-full"
            style={{
              backgroundColor: maskRgba,
            }}
          />
        </div>
      </div>
    </div>
  );
}
