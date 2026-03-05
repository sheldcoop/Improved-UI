/**
 * useInstrumentSearch — Generic, context-free instrument search hook.
 *
 * Handles debounced API calls with stale-request cancellation.
 * Replaces all inline search useEffects across the app.
 *
 * Usage:
 *   const { results, isSearching } = useInstrumentSearch(symbolSearchQuery, segment);
 */

import { useState, useEffect, useRef } from 'react';
import { useDebounce } from './useDebounce';
import { searchInstruments } from '../services/marketService';
import type { Instrument } from '../services/marketService';

interface UseInstrumentSearchReturn {
    results: Instrument[];
    isSearching: boolean;
}

/**
 * Debounced instrument search with stale-request guard.
 *
 * @param query - Raw search query from the input field.
 * @param segment - Market segment ('NSE_EQ' or 'NSE_SME').
 * @param selectedInstrument - If truthy, search is suppressed (user already picked one).
 * @param delay - Debounce delay in ms (default 300).
 * @returns Object with `results` array and `isSearching` flag.
 */
export const useInstrumentSearch = (
    query: string,
    segment: string,
    selectedInstrument?: any,
    delay: number = 300,
): UseInstrumentSearchReturn => {
    const [results, setResults] = useState<Instrument[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const debouncedQuery = useDebounce(query, delay);

    // Request ID for stale-request cancellation
    const requestIdRef = useRef(0);

    useEffect(() => {
        // Skip if user already selected an instrument or query too short
        if (selectedInstrument || !debouncedQuery || debouncedQuery.length < 2) {
            if (!selectedInstrument) setResults([]);
            return;
        }

        const currentRequestId = ++requestIdRef.current;

        const doSearch = async () => {
            setIsSearching(true);
            try {
                const data = await searchInstruments(segment, debouncedQuery);
                // Only update if this is still the latest request
                if (currentRequestId === requestIdRef.current) {
                    setResults(data);
                }
            } catch (e) {
                if (currentRequestId === requestIdRef.current) {
                    console.error('Instrument search failed:', e);
                    setResults([]);
                }
            } finally {
                if (currentRequestId === requestIdRef.current) {
                    setIsSearching(false);
                }
            }
        };

        doSearch();
    }, [debouncedQuery, segment, selectedInstrument]);

    return { results, isSearching };
};
