import { useEffect, useState, useCallback, useRef } from 'react';

interface UseFetchOptions {
  pollInterval?: number; // Poll interval in milliseconds (default: 3000)
  skip?: boolean; // Skip fetching if true
  onError?: (error: Error) => void;
}

export function useFetch<T = any>(
  url: string,
  options: UseFetchOptions = {}
) {
  const { pollInterval = 3000, skip = false, onError } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState<Error | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const getAuthToken = useCallback(() => {
    try {
      return localStorage.getItem('authToken');
    } catch {
      return null;
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (skip) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(url, { headers });

      if (response.status === 401) {
        // Token expired or invalid
        localStorage.removeItem('authToken');
        throw new Error('Unauthorized - please login again');
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      if (onError) {
        onError(error);
      }
    } finally {
      setLoading(false);
    }
  }, [url, skip, getAuthToken, onError]);

  // Fetch on mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Set up polling interval
  useEffect(() => {
    if (skip) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(fetchData, pollInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchData, pollInterval, skip]);

  // Manual refetch function
  const refetch = useCallback(() => {
    return fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch };
}
