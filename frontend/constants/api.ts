export const API_URL =
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) ||
    'http://localhost:8000';
