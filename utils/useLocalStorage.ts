import { useState, useCallback } from 'react';

// A tiny hook to keep a value in localStorage while keeping React state
// in sync. Works with JSON-serializable data.
//
// Usage: const [value, setValue] = useLocalStorage<T>('my-key', defaultValue);
// `setValue` behaves like setState (accepts function or value).
// Value is lazily read from storage, safe on initial render.

export default function useLocalStorage<T>(
  key: string,
  defaultValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return defaultValue;
    }

    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : defaultValue;
    } catch (err) {
      console.warn('useLocalStorage: error reading', key, err);
      return defaultValue;
    }
  });

  const setLocalState = useCallback(
    (value: React.SetStateAction<T>) => {
      setState((prev) => {
        const newValue =
          typeof value === 'function'
            ? (value as (prevState: T) => T)(prev)
            : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(newValue));
        } catch (err) {
          console.warn('useLocalStorage: error writing', key, err);
        }
        return newValue;
      });
    },
    [key]
  );

  return [state, setLocalState];
}
