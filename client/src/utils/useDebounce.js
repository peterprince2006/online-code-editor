// client/src/utils/useDebounce.js
import { useRef } from "react";

export default function useDebounce() {
  const refs = useRef({});

  const debounce = (key, fn, delay = 300) => {
    if (refs.current[key]) clearTimeout(refs.current[key]);
    refs.current[key] = setTimeout(() => {
      fn();
      refs.current[key] = null;
    }, delay);
  };

  return debounce;
}
