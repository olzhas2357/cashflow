import React from 'react'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger'
}

export function Button({ variant = 'primary', ...props }: Props) {
  const style: React.CSSProperties =
    variant === 'danger'
      ? { background: '#dc2626', color: '#fff', border: 'none' }
      : variant === 'secondary'
        ? { background: '#e5e7eb', color: '#111827', border: 'none' }
        : { background: '#2563eb', color: '#fff', border: 'none' }

  return <button {...props} style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', ...style, ...(props.style ?? {}) }} />
}

