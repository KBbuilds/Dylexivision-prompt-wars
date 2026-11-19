import type { ReactNode } from 'react';

interface ControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  dark?: boolean;
}

export function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  dark = false,
}: ControlProps) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5 gap-2">
        <span
          className={`text-sm font-medium ${dark ? 'text-[#E3ECF7]' : 'text-navy-700'}`}
        >
          {label}
        </span>
        <span
          className={`text-sm font-semibold tabular-nums ${dark ? 'text-teal-400' : 'text-teal-600'}`}
        >
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 accent-teal-600 cursor-pointer"
        aria-label={label}
      />
    </label>
  );
}

interface ButtonProps {
  children: ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: ReactNode;
  disabled?: boolean;
  active?: boolean;
  dark?: boolean;
  className?: string;
  title?: string;
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  icon,
  disabled,
  active,
  dark = false,
  className = '',
  title,
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:opacity-45 disabled:cursor-not-allowed min-h-[40px]';

  const variants: Record<string, string> = {
    primary:
      'bg-teal-600 text-white hover:bg-teal-500 shadow-sm shadow-teal-600/20',
    secondary: dark
      ? 'bg-[#1A2D49] text-[#FAF6EC] border border-[#2D4366] hover:border-teal-400 hover:text-teal-300 shadow-sm'
      : 'bg-white text-navy-800 border border-cream-200 hover:border-teal-500 hover:text-teal-600 shadow-sm',
    ghost: dark
      ? 'text-[#E3ECF7] hover:bg-[#1E3352]'
      : 'text-navy-700 hover:bg-cream-200/70',
    danger: dark
      ? 'bg-[#1A2D49] text-[#FF8A80] border border-[#2D4366] hover:border-coral-500 shadow-sm'
      : 'bg-white text-coral-600 border border-cream-200 hover:border-coral-500 shadow-sm',
  };

  const activeCls = active
    ? dark
      ? ' !border-teal-400 !text-teal-300 !bg-teal-600/25'
      : ' !border-teal-600 !text-teal-700 !bg-teal-100'
    : '';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${variants[variant]}${activeCls} ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}
