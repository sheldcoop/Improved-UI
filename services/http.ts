import { CONFIG } from '../config';
import { logNetworkEvent } from '../components/DebugConsole';

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchClient<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const dhanClientId = localStorage.getItem('DHAN_CLIENT_ID') || '';
  const dhanAccessToken = localStorage.getItem('DHAN_ACCESS_TOKEN') || '';
  const alphaVantageKey = localStorage.getItem('ALPHA_VANTAGE_KEY') || '';
  const useAlphaVantage = localStorage.getItem('USE_ALPHA_VANTAGE') === 'true';

  const method = options?.method || 'GET';
  const url = `${CONFIG.API_BASE_URL}${endpoint}`;
  const requestId = Math.random().toString(36).substring(7);
  const startTime = performance.now();
  const timestamp = new Date().toLocaleTimeString();

  if (!endpoint.includes('/debug/')) {
    logNetworkEvent({ id: requestId, method, url: endpoint, timestamp, type: 'req' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'x-dhan-client-id': dhanClientId,
        'x-dhan-access-token': dhanAccessToken,
        'x-alpha-vantage-key': alphaVantageKey,
        'x-use-alpha-vantage': useAlphaVantage ? 'true' : 'false'
      },
      ...options,
    });

    const endTime = performance.now();
    const duration = `${(endTime - startTime).toFixed(0)}ms`;

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
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

// Smart execution wrapper
export async function executeWithFallback<T>(
    endpoint: string, 
    options: RequestInit | undefined, 
    mockFn: () => Promise<T>
): Promise<T> {
    if (!CONFIG.USE_MOCK_DATA) {
        try {
            return await fetchClient<T>(endpoint, options);
        } catch (error) {
            console.warn(`[Auto-Fallback] Backend ${endpoint} unreachable. Using Mock Data.`);
        }
    }
    return mockFn();
}
