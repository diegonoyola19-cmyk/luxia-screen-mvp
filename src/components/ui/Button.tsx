import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';

interface ButtonProps extends Omit<HTMLMotionProps<"button">, "variant"> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  fullWidth?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  ...props
}: PropsWithChildren<ButtonProps>) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.1 }}
      className={[
        'button',
        `button--${variant}`,
        size === 'sm' ? 'button--sm' : '',
        fullWidth ? 'button--full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}

      {...props}
    >
      {children}
    </motion.button>
  );
}
