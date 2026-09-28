import { useEffect, RefObject } from 'react';

const useOnClickOutside = (
  ref: RefObject<HTMLElement | null>,
  handler: () => void,
  exceptionRef?: RefObject<HTMLElement | null>
) => {
  useEffect(() => {
    const listener = (event: MouseEvent) => {
      const target = event.target as Node;

      if (
        (ref.current && ref.current.contains(target)) ||
        (exceptionRef?.current && exceptionRef.current.contains(target))
      ) {
        return;
      }

      handler();
    };

    document.addEventListener('mousedown', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
    };
  }, [ref, handler, exceptionRef]);
};

export default useOnClickOutside;
