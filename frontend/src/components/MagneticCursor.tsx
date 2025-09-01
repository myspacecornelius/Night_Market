import React, { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

interface CursorVariant {
  scale: number;
  opacity: number;
  mixBlendMode?: string;
  backgroundColor?: string;
}

const cursorVariants: Record<string, CursorVariant> = {
  default: {
    scale: 1,
    opacity: 1,
  },
  hover: {
    scale: 1.5,
    opacity: 0.8,
    mixBlendMode: 'difference',
  },
  click: {
    scale: 0.8,
    opacity: 1,
  },
  text: {
    scale: 0.5,
    opacity: 0.8,
  },
  magnetic: {
    scale: 2,
    opacity: 0.6,
    backgroundColor: 'rgb(166, 139, 91, 0.2)',
  },
};

export const MagneticCursor: React.FC = () => {
  const cursorRef = useRef<HTMLDivElement>(null);
  const [variant, setVariant] = useState<keyof typeof cursorVariants>('default');
  const [isVisible, setIsVisible] = useState(false);
  
  const mouse = {
    x: useMotionValue(0),
    y: useMotionValue(0),
  };
  
  const smoothOptions = { damping: 20, stiffness: 300, mass: 0.5 };
  const smoothMouse = {
    x: useSpring(mouse.x, smoothOptions),
    y: useSpring(mouse.y, smoothOptions),
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouse.x.set(e.clientX);
      mouse.y.set(e.clientY);
      
      if (!isVisible) setIsVisible(true);
      
      // Detect hover targets
      const target = e.target as Element;
      const isMagnetic = target.closest('.magnetic, button, a, [role="button"]');
      const isText = target.closest('p, span, h1, h2, h3, h4, h5, h6, input, textarea');
      
      if (isMagnetic) {
        setVariant('magnetic');
        
        // Add magnetic effect to the element
        const rect = (isMagnetic as HTMLElement).getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const deltaX = e.clientX - centerX;
        const deltaY = e.clientY - centerY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        if (distance < 100) {
          const strength = Math.max(0, 1 - distance / 100);
          const moveX = deltaX * strength * 0.2;
          const moveY = deltaY * strength * 0.2;
          
          (isMagnetic as HTMLElement).style.transform = 
            `translate(${moveX}px, ${moveY}px) scale(${1 + strength * 0.05})`;
        } else {
          (isMagnetic as HTMLElement).style.transform = '';
        }
      } else if (isText) {
        setVariant('text');
      } else {
        setVariant('default');
        
        // Reset any magnetic elements
        document.querySelectorAll('.magnetic, button, a, [role="button"]').forEach(el => {
          (el as HTMLElement).style.transform = '';
        });
      }
    };

    const handleMouseLeave = () => {
      setIsVisible(false);
    };

    const handleMouseDown = () => {
      setVariant('click');
    };

    const handleMouseUp = () => {
      setVariant('default');
    };

    // Only add cursor on desktop devices
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouchDevice) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseleave', handleMouseLeave);
      document.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('mouseup', handleMouseUp);
      
      // Hide default cursor
      document.body.style.cursor = 'none';
    }

    return () => {
      if (!isTouchDevice) {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseleave', handleMouseLeave);
        document.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'auto';
      }
    };
  }, [isVisible, mouse.x, mouse.y]);

  if (!isVisible) return null;

  return (
    <motion.div
      ref={cursorRef}
      className="fixed top-0 left-0 pointer-events-none z-50 mix-blend-difference"
      style={{
        x: smoothMouse.x,
        y: smoothMouse.y,
      }}
      animate={cursorVariants[variant]}
      transition={{ type: 'spring', damping: 20, stiffness: 400 }}
    >
      <div className="relative">
        {/* Main cursor dot */}
        <div className="w-4 h-4 bg-earth-500 rounded-full -translate-x-1/2 -translate-y-1/2" />
        
        {/* Outer ring for magnetic variant */}
        {variant === 'magnetic' && (
          <motion.div
            className="absolute top-1/2 left-1/2 w-12 h-12 border border-earth-500/30 rounded-full -translate-x-1/2 -translate-y-1/2"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </div>
    </motion.div>
  );
};

export default MagneticCursor;