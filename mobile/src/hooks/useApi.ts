import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { errorText } from '../utils/format';

/**
 * Load data for a screen: runs on first open, again each time the screen comes back into focus, and on pull-to-refresh.
 * `deps` restarts the load when a filter changes.
 */
export function useApi<T>(load: () => Promise<T>, deps: ReadonlyArray<unknown> = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const loadRef = useRef(load);
  loadRef.current = load;
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const run = useCallback(async (mode: 'first' | 'refresh' | 'silent') => {
    if (mode === 'first') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      const result = await loadRef.current();
      if (alive.current) { setData(result); setError(''); }
    } catch (err) {
      if (alive.current) setError(errorText(err, 'Could not load this screen.'));
    } finally {
      if (alive.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void run('first'); }, deps);
  // come back to a screen: show what we have and quietly update it
  useFocusEffect(useCallback(() => { void run('silent'); }, [run]));

  return { data, loading, refreshing, error, reload: () => run('first'), refresh: () => run('refresh'), setData };
}
