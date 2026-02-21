import { CONFIG } from '../config';
import { logNetworkEvent } from '../components/DebugConsole';

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchClient<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const method = options?.method || 'GET';
  const url = `${CONFIG.API_BASE_URL}${endpoint}`;
  const requestId = Math.random().toString(36).substring(7);
  const startTime = performance.now();
  const timestamp = new Date().toLocaleTimeString();

  if (!endpoint.includes('/debug/')) {
    logNetworkEvent({ id: requestId, method, url: endpoint, timestamp, type: 'req' });
  }

  try {
    const headers: Record<string, string> = {};
    const hasBody = options?.body !== undefined && options?.body !== null;
    if (hasBody) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      headers,

      ...options,
    });

    const endTime = performance.now();
    const duration = `${(endTime - startTime).toFixed(0)}ms`;

    if (!response.ok) {
      // Try to extract the backend's error message from the JSON body
      let backendMessage = `${response.status} ${response.statusText}`;
      try {
        const errBody = await response.json();
        if (errBody?.message) backendMessage = errBody.message;
      } catch { /* ignore parse errors */ }
      throw new Error(backendMessage);
    }

    if (!endpoint.includes('/debug/')) {
      logNetworkEvent({ id: requestId, method, url: endpoint, status: response.status, duration, timestamp: new Date().toLocaleTimeString(), type: 'res' });
    }

    return await response.json();
  } catch (error: any) {
    if (!endpoint.includes('/debug/')) {
      logNetworkEvent({ id: requestId, method, url: endpoint, status: 0, duration: 'ERR', timestamp: new Date().toLocaleTimeString(), type: 'err' });
    }
    throw error;
  }
}

// Global flag — set to true whenever a fallback fires so the UI can warn the user
export let usingMockFallback = false;

// Smart execution wrapper — throws on failure instead of silently using mock data
// for critical endpoints (backtest, optimization). Mock data is only used in
// USE_MOCK_DATA=true dev mode.
export async function executeWithFallback<T>(
  endpoint: string,
  options: RequestInit | undefined,
  mockFn: () => Promise<T>
): Promise<T> {
  if (!CONFIG.USE_MOCK_DATA) {
    try {
      const result = await fetchClient<T>(endpoint, options);
      usingMockFallback = false;
      return result;
    } catch (error) {
      usingMockFallback = true;
      console.error(`[Backend Error] ${endpoint} failed. Falling back to mock data — results are NOT real.`, error);
      // Re-throw for critical endpoints so callers can show a proper error instead of silently using fake data
      const criticalEndpoints = ['/market/backtest/run', '/optimization/run', '/optimization/wfo'];
      if (criticalEndpoints.some(e => endpoint.includes(e))) {
        throw error; // rethrow the original error which has the real backend message
      }
    }
  }
  return mockFn();
}
