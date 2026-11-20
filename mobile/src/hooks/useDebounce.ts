import { useEffect, useState } from 'react';

/** A value that settles `delay` ms after the last change (for search boxes). */
export function useDebounce<T>(value: T, delay = 350): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return settled;
}
