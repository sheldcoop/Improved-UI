import { PaperPosition } from '../components/paper/PositionsTable';
import { fetchClient } from './http';

const BASE = '/paper-trading';

export const getPaperMonitors = async () => {
    return fetchClient<any[]>(`${BASE}/monitors`);
};

export const startPaperMonitor = async (monitorData: any) => {
    return fetchClient<any>(`${BASE}/monitors`, {
        method: 'POST',
        body: JSON.stringify(monitorData)
    });
};

export const stopPaperMonitor = async (id: string) => {
    return fetchClient<any>(`${BASE}/monitors/${id}`, {
        method: 'DELETE'
    });
};

export const getPaperPositions = async (): Promise<PaperPosition[]> => {
    return fetchClient<PaperPosition[]>(`${BASE}/positions`);
};

export const closePaperPosition = async (id: string) => {
    return fetchClient<any>(`${BASE}/positions/${id}`, {
        method: 'DELETE'
    });
};

export const getPaperHistory = async () => {
    return fetchClient<any[]>(`${BASE}/history`);
};

export const getPaperSettings = async () => {
    return fetchClient<any>(`${BASE}/settings`);
};

export const updatePaperSettings = async (settings: any) => {
    return fetchClient<any>(`${BASE}/settings`, {
        method: 'POST',
        body: JSON.stringify(settings)
    });
};

export const runPaperReplay = async (replayData: any) => {
    return fetchClient<any>(`${BASE}/replay`, {
        method: 'POST',
        body: JSON.stringify(replayData)
    });
};
