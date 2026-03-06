import { useAuth } from '@clerk/clerk-expo';
import { useCallback } from 'react';
import { getOrCreateGuestId } from '@/utils/guestId';

export function useAuthHeaders() {
    const { isSignedIn, getToken } = useAuth();

    const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
        if (isSignedIn) {
            let token = await getToken();
            if (!token) {
                // Clerk session may not be hydrated yet on first call — retry once after a short wait
                await new Promise(r => setTimeout(r, 800));
                token = await getToken();
            }
            if (token) {
                return { Authorization: `Bearer ${token}` };
            }
        }
        const guestId = await getOrCreateGuestId();
        return { 'X-Guest-Id': guestId };
    }, [isSignedIn, getToken]);

    return { getAuthHeaders, isSignedIn };
}
