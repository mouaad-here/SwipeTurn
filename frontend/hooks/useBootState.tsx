import { useAuth } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { API_URL } from '@/constants/api'; // Or standard import, check correct path if needed

export const GUEST_ONBOARDING_DONE_KEY = 'swipturn:onboarding_done:guest';
export const GUEST_ONBOARDING_STARTED_KEY = 'swipturn:onboarding_started:guest';
export const USER_ONBOARDING_KEY = (userId: string) => `swipturn:onboarding_done:user:${userId}`;

type InitialRoute = '/welcome' | '/(onboarding)/geography' | '/(tabs)/swipe';

interface BootContextValue {
    bootLoading: boolean;
    gateLoading: boolean;
    isSignedIn: boolean | undefined;
    effectiveOnboardingDone: boolean;
    initialRoute: InitialRoute;
    setGuestOnboardingStartedFlag: () => Promise<void>;
    setOnboardingCompleteFlag: () => Promise<void>;
    startOverGuestOnboarding: () => Promise<void>;
    firstScreenPainted: boolean;
    reportScreenPainted: () => void;
}

const BootContext = createContext<BootContextValue | null>(null);

export function BootProvider({ children }: { children: React.ReactNode }) {
    const { isLoaded: clerkLoaded, isSignedIn, userId, getToken } = useAuth({ treatPendingAsSignedOut: false });

    const [fontsLoaded] = useFonts(
        __DEV__ || Platform.OS === 'web'
            ? {
                  // Keys MUST match the fontFamily string used in StyleSheet.
                  // The Android expo-font config plugin maps 'ClashDisplay' + weight natively.
                  // For iOS/web dev we load individual faces under a single family name.
                  'ClashDisplay': require('../assets/fonts/ClashDisplay-Bold.otf'),
                  'Satoshi': require('../assets/fonts/Satoshi-Regular.otf'),
                  'Satoshi-Medium': require('../assets/fonts/Satoshi-Medium.otf'),
                  'Satoshi-Bold': require('../assets/fonts/Satoshi-Bold.otf'),
              }
            : {}
    );

    const [bootHydrated, setBootHydrated] = useState(false);
    const [gateLoading, setGateLoading] = useState(true);

    const [guestOnboardingDone, setGuestOnboardingDone] = useState(false);
    const [guestOnboardingStarted, setGuestOnboardingStarted] = useState(false);
    const [userOnboardingDone, setUserOnboardingDone] = useState(false);
    
    const [firstScreenPainted, setFirstScreenPainted] = useState(false);

    const reportScreenPainted = React.useCallback(() => {
        requestAnimationFrame(() => setFirstScreenPainted(true));
    }, []);

    useEffect(() => {
        if (!clerkLoaded) return;

        let active = true;

        async function loadStorage() {
            setGateLoading(true);

            // Ensure no stale states when identity changes
            if (active) {
                setUserOnboardingDone(false);
                setGuestOnboardingDone(false);
                setGuestOnboardingStarted(false);
            }

            try {
                if (isSignedIn && userId) {
                    const done = await AsyncStorage.getItem(USER_ONBOARDING_KEY(userId));
                    if (active) setUserOnboardingDone(done === 'true');

                    // Background backend reconciliation (blocks gateLoading if not cached)
                    if (done !== 'true' || true) {
                        try {
                            const token = await getToken();
                            if (token) {
                                // 1. Attempt to merge any orphaned guest session first
                                const pendingGuestId = await AsyncStorage.getItem('guestId');
                                if (pendingGuestId) {
                                    try {
                                        await fetch(`${API_URL}/users/merge-guest`, {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                Authorization: `Bearer ${token}`
                                            },
                                            body: JSON.stringify({ guest_id: pendingGuestId, auth_type: 'login' })
                                        });
                                        await AsyncStorage.removeItem('guestId');
                                    } catch (e) {
                                        console.warn('[BootProvider] Orphaned guest merge failed', e);
                                    }
                                }

                                // 2. Profile Fetch / Completion Verification
                                if (done !== 'true') {
                                    const res = await fetch(`${API_URL}/users/me`, {
                                        headers: { Authorization: `Bearer ${token}` }
                                    });
                                    const data = await res.json();
                                    if (data?.onboarding_completed_at && active) {
                                        await AsyncStorage.setItem(USER_ONBOARDING_KEY(userId), 'true');
                                        setUserOnboardingDone(true);
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn('[BootProvider] OAuth onboarding fetch failed', e);
                        }
                    }
                } else {
                    const done = await AsyncStorage.getItem(GUEST_ONBOARDING_DONE_KEY);
                    const started = await AsyncStorage.getItem(GUEST_ONBOARDING_STARTED_KEY);
                    if (active) {
                        setGuestOnboardingDone(done === 'true');
                        setGuestOnboardingStarted(started === 'true');
                    }
                }
            } catch (e) {
                console.warn("[BootProvider] Storage load error", e);
            } finally {
                if (active) {
                    setGateLoading(false);
                    setBootHydrated(true);
                }
            }
        }

        loadStorage();

        return () => { active = false; };
    }, [clerkLoaded, isSignedIn, userId]);

    // Compute boot state (only for very first load to manage splash screen)
    const isFontReady = (__DEV__ || Platform.OS === 'web') ? fontsLoaded : true;
    const bootLoading = !isFontReady || !clerkLoaded || !bootHydrated;
    const effectiveOnboardingDone = !!(isSignedIn ? userOnboardingDone : guestOnboardingDone);

    // Compute routing snapshot
    let initialRoute: InitialRoute = '/welcome';

    if (!bootLoading) {
        if (effectiveOnboardingDone) {
            initialRoute = '/(tabs)/swipe';
        } else if (isSignedIn || guestOnboardingStarted) {
            initialRoute = '/(onboarding)/geography';
        } else {
            initialRoute = '/welcome';
        }
    }

    // Helpers to let UI mutation trigger layout reconfiguration without hard reloads
    const setGuestOnboardingStartedFlag = async () => {
        await AsyncStorage.setItem(GUEST_ONBOARDING_STARTED_KEY, 'true');
        setGuestOnboardingStarted(true);
    };

    const setOnboardingCompleteFlag = async () => {
        if (isSignedIn && userId) {
            await AsyncStorage.setItem(USER_ONBOARDING_KEY(userId), 'true');
            setUserOnboardingDone(true);
        } else {
            await AsyncStorage.setItem(GUEST_ONBOARDING_DONE_KEY, 'true');
            // Clean up started flag
            await AsyncStorage.removeItem(GUEST_ONBOARDING_STARTED_KEY);
            setGuestOnboardingStarted(false);
            setGuestOnboardingDone(true);
        }
    };

    const startOverGuestOnboarding = async () => {
        await AsyncStorage.multiRemove([GUEST_ONBOARDING_DONE_KEY, GUEST_ONBOARDING_STARTED_KEY]);
        setGuestOnboardingDone(false);
        setGuestOnboardingStarted(false);
    };

    return (
        <BootContext.Provider value={{
            bootLoading,
            gateLoading,
            isSignedIn,
            effectiveOnboardingDone,
            initialRoute,
            setGuestOnboardingStartedFlag,
            setOnboardingCompleteFlag,
            startOverGuestOnboarding,
            firstScreenPainted,
            reportScreenPainted,
        }}>
            {children}
        </BootContext.Provider>
    );
}

export function useBootState() {
    const ctx = useContext(BootContext);
    if (!ctx) throw new Error("useBootState must be used within BootProvider");
    return ctx;
}
