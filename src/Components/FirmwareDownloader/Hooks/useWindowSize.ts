import { useState, useEffect, useCallback, useRef } from 'react';

interface WindowSizeState {
  windowHeight: number;
  windowWidth: number;
}

interface ContainerSize {
  maxHeight: number;
}

const LAYOUT_CONFIG = {
  BASE_MIN_HEIGHT: 80,
  PAGE_PADDING: 32,
  SAFETY_MARGIN: 70,
  PARTITION_FIXED_HEIGHT: 104,
};

export function useWindowSize(): WindowSizeState {
  const [windowSize, setWindowSize] = useState<WindowSizeState>({
    windowHeight: window.innerHeight,
    windowWidth: window.innerWidth,
  });

  useEffect(() => {
    let rafId: number;
    let timeoutId: ReturnType<typeof setTimeout>;

    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          setWindowSize({
            windowHeight: window.innerHeight,
            windowWidth: window.innerWidth,
          });
        }, 50);
      });
    };

    window.addEventListener('resize', handleResize, { passive: true });
    handleResize();

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return windowSize;
}

export function useContainerSize(
  containerRef: React.RefObject<HTMLElement | null>,
  baseMinHeight: number = LAYOUT_CONFIG.BASE_MIN_HEIGHT
): ContainerSize {
  const { windowHeight } = useWindowSize();
  const [maxHeight, setMaxHeight] = useState(baseMinHeight);
  const lastCalculatedRef = useRef(0);

  const calculateMaxHeight = useCallback(() => {
    if (!containerRef.current) {
      return baseMinHeight;
    }

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const currentTop = rect.top;

    if (currentTop <= 0) {
      return baseMinHeight;
    }

    const availableHeight =
      windowHeight - currentTop - LAYOUT_CONFIG.PAGE_PADDING - LAYOUT_CONFIG.SAFETY_MARGIN;

    const calculatedMaxHeight = Math.max(baseMinHeight, Math.floor(availableHeight));

    return calculatedMaxHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowHeight, baseMinHeight]);

  useEffect(() => {
    const newMaxHeight = calculateMaxHeight();

    if (Math.abs(newMaxHeight - lastCalculatedRef.current) > 5) {
      lastCalculatedRef.current = newMaxHeight;
      setMaxHeight(newMaxHeight);
    }
  }, [calculateMaxHeight]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const newMaxHeight = calculateMaxHeight();
      if (Math.abs(newMaxHeight - lastCalculatedRef.current) > 5) {
        lastCalculatedRef.current = newMaxHeight;
        setMaxHeight(newMaxHeight);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [calculateMaxHeight]);

  return { maxHeight };
}

export function useLogContainerSize(
  containerRef: React.RefObject<HTMLElement | null>
): ContainerSize {
  return useContainerSize(containerRef, 120);
}

export function usePartitionListSize(
  containerRef: React.RefObject<HTMLElement | null>
): ContainerSize {
  const { windowHeight } = useWindowSize();
  const [maxHeight, setMaxHeight] = useState(LAYOUT_CONFIG.BASE_MIN_HEIGHT);
  const lastCalculatedRef = useRef(0);

  const calculateMaxHeight = useCallback(() => {
    if (!containerRef.current) {
      return LAYOUT_CONFIG.BASE_MIN_HEIGHT;
    }

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const currentTop = rect.top;

    if (currentTop <= 0) {
      return LAYOUT_CONFIG.BASE_MIN_HEIGHT;
    }

    const availableHeight =
      windowHeight -
      currentTop -
      LAYOUT_CONFIG.PAGE_PADDING -
      LAYOUT_CONFIG.SAFETY_MARGIN -
      LAYOUT_CONFIG.PARTITION_FIXED_HEIGHT;

    const calculatedMaxHeight = Math.max(
      LAYOUT_CONFIG.BASE_MIN_HEIGHT,
      Math.floor(availableHeight)
    );

    return calculatedMaxHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowHeight]);

  useEffect(() => {
    const newMaxHeight = calculateMaxHeight();

    if (Math.abs(newMaxHeight - lastCalculatedRef.current) > 5) {
      lastCalculatedRef.current = newMaxHeight;
      setMaxHeight(newMaxHeight);
    }
  }, [calculateMaxHeight]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const newMaxHeight = calculateMaxHeight();
      if (Math.abs(newMaxHeight - lastCalculatedRef.current) > 5) {
        lastCalculatedRef.current = newMaxHeight;
        setMaxHeight(newMaxHeight);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [calculateMaxHeight]);

  return { maxHeight };
}

export { LAYOUT_CONFIG };
