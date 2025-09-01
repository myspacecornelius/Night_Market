import React, { forwardRef } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '../../lib/utils';

interface AnimatedButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref'> {
  variant?: 'earth' | 'sage' | 'ghost' | 'outline' | 'premium';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isLoading?: boolean;
  children: React.ReactNode;
}

const buttonVariants = {
  initial: { scale: 1 },
  hover: { 
    scale: 1.02,
    y: -2,
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
  },
  tap: { 
    scale: 0.98,
    y: 0,
    transition: { duration: 0.1 }
  },
};

const rippleVariants = {
  initial: { scale: 0, opacity: 0.7 },
  animate: { 
    scale: 4, 
    opacity: 0,
    transition: { duration: 0.6, ease: 'easeOut' }
  },
};

export const AnimatedButton = forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  ({ variant = 'earth', size = 'md', isLoading, className, children, ...props }, ref) => {
    const [ripples, setRipples] = React.useState<Array<{ id: number; x: number; y: number }>>([]);

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const newRipple = { id: Date.now(), x, y };
      setRipples(prev => [...prev, newRipple]);
      
      // Remove ripple after animation
      setTimeout(() => {
        setRipples(prev => prev.filter(ripple => ripple.id !== newRipple.id));
      }, 600);
      
      props.onClick?.(e);
    };

    const variantClasses = {
      earth: 'bg-earth-500 hover:bg-earth-600 text-earth-50 shadow-soft hover:shadow-glow',
      sage: 'bg-sage-500 hover:bg-sage-600 text-sage-50 shadow-soft hover:shadow-glow-sage',
      ghost: 'hover:bg-earth-100 dark:hover:bg-earth-800 text-earth-700 dark:text-earth-300',
      outline: 'border border-earth-300 dark:border-earth-600 hover:bg-earth-50 dark:hover:bg-earth-800 text-earth-700 dark:text-earth-300',
      premium: 'bg-gradient-to-r from-earth-500 via-sage-500 to-earth-600 text-white shadow-medium hover:shadow-hard',
    };

    const sizeClasses = {
      sm: 'px-3 py-1.5 text-sm rounded-lg',
      md: 'px-4 py-2 text-sm rounded-xl',
      lg: 'px-6 py-3 text-base rounded-xl',
      xl: 'px-8 py-4 text-lg rounded-2xl',
    };

    return (
      <motion.button
        ref={ref}
        className={cn(
          'relative overflow-hidden font-medium transition-all duration-300',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-earth-500/30 focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          'transform-gpu', // GPU acceleration
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        variants={buttonVariants}
        initial="initial"
        whileHover="hover"
        whileTap="tap"
        onClick={handleClick}
        {...props}
      >
        {/* Shimmer effect for premium variant */}
        {variant === 'premium' && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
        )}
        
        {/* Content */}
        <span className="relative z-10 flex items-center gap-2">
          {isLoading && (
            <motion.div
              className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
          )}
          {children}
        </span>
        
        {/* Ripple effects */}
        <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
          {ripples.map((ripple) => (
            <motion.div
              key={ripple.id}
              className="absolute bg-white/30 rounded-full pointer-events-none"
              style={{
                left: ripple.x - 10,
                top: ripple.y - 10,
                width: 20,
                height: 20,
              }}
              variants={rippleVariants}
              initial="initial"
              animate="animate"
            />
          ))}
        </div>
      </motion.button>
    );
  }
);

AnimatedButton.displayName = 'AnimatedButton';

export default AnimatedButton;