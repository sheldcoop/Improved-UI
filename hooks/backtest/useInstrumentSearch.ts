import { useEffect } from 'react';
import { useBacktestContext } from '../../context/BacktestContext';
import { useDebounce } from '../useDebounce';
import { searchInstruments } from '../../services/backtestInternal';

/**
 * Handles debounced instrument search:
 * - Watches symbolSearchQuery with 300ms debounce
 * - Fires search when query >= 2 chars in SINGLE mode
 * - Updates searchResults and isSearching in context
 */
export const useInstrumentSearch = () => {
    const {
        mode, segment, symbolSearchQuery,
        setSearchResults, setIsSearching,
    } = useBacktestContext();

    const debouncedSearchQuery = useDebounce(symbolSearchQuery, 300);

    useEffect(() => {
        if (mode !== 'SINGLE' || !debouncedSearchQuery || debouncedSearchQuery.length < 2) {
            setSearchResults([]);
            return;
        }

        const doSearch = async () => {
            setIsSearching(true);
            try {
                const results = await searchInstruments(segment, debouncedSearchQuery);
                setSearchResults(results);
            } catch (e) {
                console.error('Instrument search failed:', e);
                setSearchResults([]);
            } finally {
                setIsSearching(false);
            }
        };

        doSearch();
    }, [debouncedSearchQuery, segment, mode]);
};
