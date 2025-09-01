import React, { forwardRef } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '../lib/utils';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

interface AnimatedCardProps extends Omit<HTMLMotionProps<'div'>, 'ref'> {
  variant?: 'default' | 'glass' | 'premium' | 'floating';
  delay?: number;
  children: React.ReactNode;
}

const cardVariants = {
  hidden: {
    opacity: 0,
    y: 60,
    scale: 0.95,
    rotateX: 15,
  },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    rotateX: 0,
    transition: {
      duration: 0.8,
      delay: delay * 0.1,
      ease: [0.22, 1, 0.36, 1], // Custom easing for sophisticated feel
    },
  }),
  hover: {
    y: -8,
    scale: 1.02,
    rotateY: 2,
    transition: {
      duration: 0.3,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

const floatingVariants = {
  floating: {
    y: [-2, 2, -2],
    rotateZ: [-0.5, 0.5, -0.5],
    transition: {
      duration: 4,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

export const AnimatedCard = forwardRef<HTMLDivElement, AnimatedCardProps>(
  ({ variant = 'default', delay = 0, className, children, ...props }, ref) => {
    const { elementRef, shouldAnimate } = useIntersectionObserver({
      threshold: 0.2,
      rootMargin: '-50px',
    });

    const variantClasses = {
      default: 'bg-card border border-border shadow-soft hover:shadow-medium',
      glass: 'glass-card',
      premium: 'card-premium',
      floating: 'bg-card border border-border shadow-soft hover:shadow-medium',
    };

    return (
      <motion.div
        ref={(node) => {
          elementRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        className={cn(
          'rounded-2xl p-6 transition-all duration-400',
          variantClasses[variant],
          'transform-gpu', // Use GPU acceleration
          className
        )}
        variants={cardVariants}
        initial="hidden"
        animate={shouldAnimate ? 'visible' : 'hidden'}
        whileHover="hover"
        custom={delay}
        {...props}
      >
        {variant === 'floating' ? (
          <motion.div variants={floatingVariants} animate="floating">
            {children}
          </motion.div>
        ) : (
          children
        )}
      </motion.div>
    );
  }
);

AnimatedCard.displayName = 'AnimatedCard';

export default AnimatedCard;