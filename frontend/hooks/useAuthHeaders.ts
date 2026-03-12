import { getOrCreateGuestId } from '@/utils/guestId';
import { useAuth } from '@clerk/clerk-expo';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Production-quality auth header hook.
 *
 * Key design decisions:
 * 1. Uses a ref for isSignedIn so the async closure always reads the LATEST
 *    value, not a stale closure capture. This is critical for OAuth flows where
 *    isSignedIn flips true mid-execution.
 * 2. When signed in, polls getToken() for up to 5s — Clerk needs time to
 *    hydrate JWTs after deep-link app restarts (Google OAuth on Android).
 * 3. When signed in but token never arrives (impossible in normal flow),
 *    returns empty headers → backend 401 → tabs auth guard handles redirect.
 *    NEVER falls back to guest mode for signed-in users.
 */
export function useAuthHeaders() {
    const { isSignedIn, getToken } = useAuth();
    const isSignedInRef = useRef(isSignedIn);

    // Keep the ref in sync with the latest isSignedIn value
    useEffect(() => {
        isSignedInRef.current = isSignedIn;
    }, [isSignedIn]);

    const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
        // Read from ref — not the closure — to get the CURRENT auth state
        if (isSignedInRef.current) {
            const deadline = Date.now() + 5000;
            while (Date.now() < deadline) {
                const token = await getToken();
                if (token) return { Authorization: `Bearer ${token}` };
                await new Promise(r => setTimeout(r, 250));
            }
            // Token never arrived — return empty so backend returns 401
            return {};
        }
        // Guest user: use guest ID header
        const guestId = await getOrCreateGuestId();
        return { 'X-Guest-Id': guestId };
    }, [getToken]);

    return { getAuthHeaders, isSignedIn };
}
