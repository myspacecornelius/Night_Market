import { motion as fm, AnimatePresence } from 'framer-motion'
import { motion } from '@/lib/motion'
import React from 'react'

type MotionProps = {
  children: React.ReactNode
  className?: string
}

export const Motion = ({ children, className }: MotionProps) => {
  return (
    <AnimatePresence>
      <fm.div
        className={className}
        variants={motion.variants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={motion.transition}
      >
        {children}
      </fm.div>
    </AnimatePresence>
  )
}
