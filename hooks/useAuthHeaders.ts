import { useAuth } from '@clerk/clerk-expo';
import { useCallback } from 'react';
import { getOrCreateGuestId } from '@/utils/guestId';

export function useAuthHeaders() {
    const { isSignedIn, getToken } = useAuth();

    const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
        if (isSignedIn) {
            const token = await getToken();
            if (token) {
                return { Authorization: `Bearer ${token}` };
            }
        }
        const guestId = await getOrCreateGuestId();
        return { 'X-Guest-Id': guestId };
    }, [isSignedIn, getToken]);

    return { getAuthHeaders, isSignedIn };
}
