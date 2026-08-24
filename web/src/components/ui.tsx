import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }>(
  ({ className, variant = 'primary', ...props }, ref) => (
    <button ref={ref} className={twMerge(clsx('inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500', {
      'bg-forest text-white shadow-sm hover:bg-forest/90': variant === 'primary',
      'border border-border bg-card text-ink hover:bg-stone': variant === 'secondary',
      'text-muted hover:bg-stone hover:text-ink': variant === 'ghost',
      'bg-red-600 text-white hover:bg-red-700': variant === 'danger',
    }, className))} {...props} />
  ),
)
Button.displayName = 'Button'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={twMerge('min-h-11 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20', className)} {...props} />
))
Input.displayName = 'Input'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={twMerge('rounded-2xl border border-border bg-card shadow-[0_12px_35px_-28px_rgba(30,48,37,.7)]', className)} {...props} />
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' | 'amber' }) {
  return <span className={twMerge('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', tone === 'green' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300', tone === 'amber' && 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300', tone === 'neutral' && 'bg-stone text-muted')}>{children}</span>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-medium text-ink">{label}{children}</label>
}

export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <Card className="grid place-items-center gap-2 border-dashed px-6 py-14 text-center"><div className="grid size-12 place-items-center rounded-full bg-stone text-xl">⌁</div><h3 className="text-lg font-bold">{title}</h3><div className="max-w-md text-sm text-muted">{children}</div></Card>
}
