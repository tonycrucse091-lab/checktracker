import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'gold'

export function Button({ variant = 'primary', size = 'default', className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'default' | 'small'; children: ReactNode }) {
  return <button className={`button button-${variant}${size === 'small' ? ' button-sm' : ''}${className ? ` ${className}` : ''}`} {...props}>{children}</button>
}
