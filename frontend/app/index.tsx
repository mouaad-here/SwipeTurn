import { COLORS } from '@/constants/colors';
import { useAuth } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

const ONBOARDING_CACHE_KEY = 'swipturn:onboarding_done';

/** Wait up to maxMs for Clerk to issue a token, polling every intervalMs. */
async function waitForToken(
    getToken: () => Promise<string | null>,
    maxMs = 4000,
    intervalMs = 200
): Promise<string | null> {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
        const token = await getToken();
        if (token) return token;
        await new Promise(r => setTimeout(r, intervalMs));
    }
    return null;
}

export default function IndexScreen() {
    const router = useRouter();
    const { isLoaded, isSignedIn, getToken } = useAuth();
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        if (!isLoaded) return;

        // If signed in, immediately start the onboarding check
        if (isSignedIn) {
            (async () => {
                try {
                    const cached = await AsyncStorage.getItem(ONBOARDING_CACHE_KEY);
                    if (cached === 'true') {
                        router.replace('/(tabs)/swipe');
                        return;
                    }

                    const token = await waitForToken(getToken);
                    if (!token) {
                        setChecking(false);
                        return;
                    }

                    const { API_URL } = await import('@/constants/api');
                    const res = await fetch(`${API_URL}/users/me`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data?.onboarding_completed_at) {
                            await AsyncStorage.setItem(ONBOARDING_CACHE_KEY, 'true');
                            router.replace('/(tabs)/swipe');
                            return;
                        }
                    }
                } catch (_) { }
                // Signed in but onboarding not done — go to onboarding
                router.replace('/(onboarding)/geography');
            })();
            return;
        }

        // Not signed in when Clerk first loads.
        // Give it a short grace period before showing the Welcome screen.
        const graceTimer = setTimeout(() => {
            setChecking(false);
        }, 1500);

        return () => clearTimeout(graceTimer);
    }, [isLoaded, isSignedIn]);

    // Show spinner while Clerk loads or while we check onboarding status
    if (!isLoaded || checking) {
        return (
            <View style={[styles.container, styles.centered]}>
                <StatusBar style="dark" />
                <ActivityIndicator size="large" color={COLORS.accent} />
            </View>
        );
    }

    return <Redirect href="/welcome" />;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    centered: {
        justifyContent: 'center',
        alignItems: 'center',
    },
});
