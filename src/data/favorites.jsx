import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const STORAGE_KEY = 'fifa26_favorites';
const FavoritesContext = createContext(null);

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites 必须在 <FavoritesProvider> 内使用');
  return ctx;
}

export function FavoritesProvider({ children }) {
  const [favSet, setFavSet] = useState(readStorage);

  const toggleFav = useCallback((code) => {
    setFavSet((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const isFav = useCallback((code) => favSet.has(code), [favSet]);
  const favCodes = useMemo(() => [...favSet], [favSet]);

  const value = useMemo(() => ({ toggleFav, isFav, favCodes }), [toggleFav, isFav, favCodes]);
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}
