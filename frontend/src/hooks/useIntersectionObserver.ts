import { useEffect, useRef, useState } from 'react';

interface UseIntersectionObserverOptions {
  threshold?: number | number[];
  rootMargin?: string;
  triggerOnce?: boolean;
}

export const useIntersectionObserver = (
  options: UseIntersectionObserverOptions = {}
) => {
  const {
    threshold = 0.1,
    rootMargin = '0px',
    triggerOnce = true,
  } = options;

  const elementRef = useRef<HTMLElement>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [hasTriggered, setHasTriggered] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        const intersecting = entry.isIntersecting;
        
        setIsIntersecting(intersecting);
        
        if (intersecting && !hasTriggered) {
          setHasTriggered(true);
        }
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [threshold, rootMargin, hasTriggered]);

  const shouldAnimate = triggerOnce ? hasTriggered : isIntersecting;

  return {
    elementRef,
    isIntersecting,
    hasTriggered,
    shouldAnimate,
  };
};

export const useStaggeredIntersection = (
  count: number,
  options: UseIntersectionObserverOptions = {}
) => {
  const [intersectingIndices, setIntersectingIndices] = useState<Set<number>>(new Set());
  const refs = useRef<(HTMLElement | null)[]>(Array(count).fill(null));

  useEffect(() => {
    const observers = refs.current.map((element, index) => {
      if (!element) return null;

      const observer = new IntersectionObserver(
        (entries) => {
          const [entry] = entries;
          if (entry.isIntersecting) {
            setIntersectingIndices(prev => new Set(prev).add(index));
          } else if (!options.triggerOnce) {
            setIntersectingIndices(prev => {
              const newSet = new Set(prev);
              newSet.delete(index);
              return newSet;
            });
          }
        },
        {
          threshold: options.threshold || 0.1,
          rootMargin: options.rootMargin || '0px',
        }
      );

      observer.observe(element);
      return observer;
    });

    return () => {
      observers.forEach((observer, index) => {
        if (observer && refs.current[index]) {
          observer.unobserve(refs.current[index]!);
        }
      });
    };
  }, [options.threshold, options.rootMargin, options.triggerOnce]);

  const setRef = (index: number) => (element: HTMLElement | null) => {
    refs.current[index] = element;
  };

  const isIntersecting = (index: number) => intersectingIndices.has(index);

  return {
    setRef,
    isIntersecting,
  };
};