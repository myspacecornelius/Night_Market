export const motion = {
  transition: {
    duration: 0.3,
    ease: 'easeInOut',
  },
  variants: {
    initial: {
      opacity: 0,
      y: 20,
    },
    animate: {
      opacity: 1,
      y: 0,
    },
    exit: {
      opacity: 0,
      y: -20,
    },
  },
}
