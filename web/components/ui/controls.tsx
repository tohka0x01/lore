'use client';

import React, { type ComponentPropsWithoutRef, type ElementType, type ReactNode } from 'react';
import clsx from 'clsx';
import * as Accordion from '@radix-ui/react-accordion';
import * as Tabs from '@radix-ui/react-tabs';
import LobeAvatar from '@lobehub/ui/es/Avatar/index';
import type { AvatarProps as LobeAvatarProps } from '@lobehub/ui/es/Avatar/type';
import LobeInput from '@lobehub/ui/es/Input/Input';
import type { InputProps as LobeInputProps } from '@lobehub/ui/es/Input/type';
import LobeSelect from '@lobehub/ui/es/Select/Select';
import LobeTag from '@lobehub/ui/es/Tag/Tag';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
  className?: string;
}

export function Button({ variant = 'secondary', size = 'md', children, className, ...rest }: ButtonProps): React.JSX.Element {
  const base = 'press inline-flex items-center justify-center gap-1.5 font-medium rounded-full transition-all duration-200 ease-spring disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap';
  const sizes: Record<ButtonSize, string> = {
    sm: 'h-7 px-3 text-[12px]',
    md: 'h-9 px-4 text-[13.5px]',
    lg: 'h-11 px-5 text-[15px]',
  };
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-sys-blue text-white hover:bg-[#1E90FF]',
    secondary: 'bg-fill-primary text-txt-primary hover:bg-fill-secondary',
    ghost: 'bg-transparent text-txt-secondary hover:bg-fill-quaternary hover:text-txt-primary',
    destructive: 'bg-sys-red/15 text-sys-red hover:bg-sys-red/25',
  };
  return (
    <button className={clsx(base, sizes[size], variants[variant], className)} {...rest}>
      {children}
    </button>
  );
}

export type BadgeTone = 'default' | 'blue' | 'green' | 'orange' | 'red' | 'yellow' | 'purple' | 'teal' | 'soft';

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
}

const BADGE_TAG_COLORS: Record<BadgeTone, string> = {
  default: 'default',
  blue: 'blue',
  green: 'green',
  orange: 'orange',
  red: 'red',
  yellow: 'gold',
  purple: 'purple',
  teal: 'cyan',
  soft: 'default',
};

export function Badge({ children, tone = 'default', dot = false, className }: BadgeProps): React.JSX.Element {
  return (
    <LobeTag
      className={clsx('inline-flex items-center gap-1 px-1.5 py-[2px] text-[11px] font-medium leading-[1.4]', className)}
      color={BADGE_TAG_COLORS[tone] || BADGE_TAG_COLORS.default}
      variant={tone === 'soft' ? 'borderless' : 'filled'}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden />}
      {children}
    </LobeTag>
  );
}

type StatTone = 'default' | 'blue' | 'green' | 'orange' | 'purple' | 'teal' | 'red';

const STAT_TONES: Record<StatTone, string> = {
  default: 'text-txt-primary',
  blue: 'text-sys-blue',
  green: 'text-sys-green',
  orange: 'text-sys-orange',
  purple: 'text-sys-purple',
  teal: 'text-sys-teal',
  red: 'text-sys-red',
};

interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  compact?: boolean;
}

export function StatCard({ label, value, hint, tone = 'default', compact = false }: StatCardProps): React.JSX.Element {
  return (
    <div className={clsx('rounded-2xl border border-separator-thin bg-bg-elevated shadow-card', compact ? 'p-4' : 'p-5')}>
      <div className={clsx('font-medium text-txt-tertiary', compact ? 'text-[11px]' : 'text-[12px]')}>{label}</div>
      <div className={clsx(compact ? 'mt-1.5 text-[26px]' : 'mt-2 text-[32px]', 'font-bold leading-none tracking-[-0.02em] tabular-nums', STAT_TONES[tone] || STAT_TONES.default)}>
        {value ?? '—'}
      </div>
      {hint && <div className={clsx('text-txt-tertiary', compact ? 'mt-1 text-[11px]' : 'mt-1 text-[12px]')}>{hint}</div>}
    </div>
  );
}

interface NoticeProps {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  icon?: ReactNode;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}

const NOTICE_TONES: Record<NonNullable<NoticeProps['tone']>, string> = {
  info: 'border-sys-blue/18 bg-sys-blue/10 text-sys-blue',
  warning: 'border-sys-orange/22 bg-sys-orange/10 text-sys-orange',
  danger: 'border-sys-red/20 bg-sys-red/10 text-sys-red',
  success: 'border-sys-green/20 bg-sys-green/10 text-sys-green',
};

export function Notice({ tone = 'info', icon, title, children, className }: NoticeProps): React.JSX.Element {
  return (
    <div className={clsx('flex items-start gap-3 rounded-xl border px-4 py-3', NOTICE_TONES[tone], className)}>
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0">
        {title && <div className="text-[12px] font-semibold uppercase tracking-[0.06em]">{title}</div>}
        <div className={clsx('text-[13px] leading-relaxed', title && 'mt-1')}>{children}</div>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  text: string;
  icon?: ElementType<{ size?: number; className?: string }>;
}

export function EmptyState({ text, icon: Icon }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-separator-thin py-14 text-center">
      {Icon && <Icon size={24} className="text-txt-quaternary" />}
      <p className="text-[14px] text-txt-tertiary">{text}</p>
    </div>
  );
}

export const inputClass = 'w-full rounded-lg border border-separator bg-bg-raised px-3 py-2 text-[13px] font-mono text-txt-primary placeholder:text-txt-quaternary shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] hover:border-separator hover:bg-bg-surface focus:border-sys-blue focus:bg-bg-elevated focus:ring-2 focus:ring-sys-blue/20 focus:outline-none';

type AppInputProps = LobeInputProps;

export function AppInput({ className, variant = 'filled', ...rest }: AppInputProps): React.JSX.Element {
  return <LobeInput className={className} variant={variant} {...rest} />;
}

type AppAvatarProps = LobeAvatarProps;

export function AppAvatar(props: AppAvatarProps): React.JSX.Element {
  return <LobeAvatar {...props} />;
}

interface SelectOption {
  value: string;
  label: ReactNode;
}

interface AppSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: ReactNode;
  className?: string;
}

export function AppSelect({ value, onValueChange, options, placeholder, className }: AppSelectProps): React.JSX.Element {
  return (
    <LobeSelect
      className={className}
      options={options.map((option) => ({ label: option.label, value: option.value }))}
      placeholder={placeholder || '—'}
      style={{ width: '100%' }}
      value={value === '' ? undefined : value}
      variant="filled"
      onChange={(next: string | number | null | undefined) => onValueChange(String(next ?? ''))}
    />
  );
}

interface DisclosureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Disclosure({ open, onOpenChange, trigger, children, className }: DisclosureProps): React.JSX.Element {
  return (
    <Accordion.Root type="single" collapsible value={open ? 'open' : undefined} onValueChange={(value) => onOpenChange(value === 'open')} className={className}>
      <Accordion.Item value="open" className="border-none">
        <Accordion.Trigger asChild>
          <button type="button" className="w-full text-left">{trigger}</button>
        </Accordion.Trigger>
        <Accordion.Content>{children}</Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}

interface SegmentedTabOption {
  value: string;
  label: ReactNode;
}

interface SegmentedTabsProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SegmentedTabOption[];
  className?: string;
}

export function SegmentedTabs({ value, onValueChange, options, className }: SegmentedTabsProps): React.JSX.Element {
  return (
    <Tabs.Root value={value} onValueChange={onValueChange} className={className}>
      <Tabs.List className="flex items-center gap-1">
        {options.map((option) => (
          <Tabs.Trigger
            key={option.value}
            value={option.value}
            className="press rounded-full border px-3 py-1 text-[12px] font-medium text-txt-secondary transition-all data-[state=active]:border-sys-blue/15 data-[state=active]:bg-bg-elevated data-[state=active]:text-sys-blue data-[state=active]:shadow-sm hover:bg-fill-quaternary hover:text-txt-primary"
          >
            {option.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}
