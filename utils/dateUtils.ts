
/**
 * Formats a date string (yyyy-mm-dd) or Date object into dd-mm-yyyy format.
 * 
 * @param date - Date string or Date object
 * @returns Formatted date string (dd-mm-yyyy)
 */
export const formatDateDisplay = (date: string | Date | undefined): string => {
    if (!date) return 'N/A';

    const d = typeof date === 'string' ? new Date(date) : date;

    // Check if valid date
    if (isNaN(d.getTime())) return typeof date === 'string' ? date : 'Invalid Date';

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    return `${day}-${month}-${year}`;
};

/**
 * Parses a dd-mm-yyyy string back into yyyy-mm-dd for API compatibility.
 */
export const parseDisplayDate = (displayDate: string): string => {
    const parts = displayDate.split('-');
    if (parts.length !== 3) return displayDate;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
};
