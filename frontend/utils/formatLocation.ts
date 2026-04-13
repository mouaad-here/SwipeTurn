/**
 * Strips Unicode Regional Indicator Symbol characters (used to form flag emojis)
 * and normalizes the resulting location string.
 *
 * Flag emojis are composed of two Regional Indicator Symbol characters in the
 * ranges U+1F1E6–U+1F1FF. On Android and Windows these are not composed into
 * visible flags and instead render as stray letters or boxes.
 *
 * After stripping, we also normalize:
 *  - leading/trailing commas and whitespace
 *  - runs of consecutive spaces
 *  - artifacts like ", ," or " , "
 */
export function formatLocation(raw: string | null | undefined): string {
    if (!raw) return '';

    return raw
        // Remove any Regional Indicator Symbol letter (U+1F1E6–U+1F1FF)
        .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
        // Collapse multiple spaces into one
        .replace(/  +/g, ' ')
        // Remove leading/trailing commas and spaces
        .replace(/^[\s,]+|[\s,]+$/g, '')
        // Remove empty segments like ", ,"
        .replace(/,\s*,/g, ',')
        .trim();
}
