import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef } from 'react';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearGuestId } from '@/utils/guestId';
import { mockOnboardingState } from '@/app/(onboarding)/store';
import { useAuthHeaders } from '@/hooks/useAuthHeaders';
import { COLORS, COLORS_ALPHA } from '@/constants/colors';

function getInitials(name: string | undefined): string {
    if (!name || !name.trim()) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (name[0] || '?').toUpperCase();
}

const FETCH_TIMEOUT_MS = 15000;

export default function ProfileScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { signOut, isSignedIn, isLoaded } = useAuth();
    const { getAuthHeaders } = useAuthHeaders();
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const fetchingRef = useRef(false);
    // Keep a stable ref to the latest fetchProfile so useFocusEffect doesn't
    // re-run on every internal Clerk tick (isSignedIn/getToken reference changes).
    const fetchProfileRef = useRef<() => Promise<void>>(async () => {});

    const fetchProfile = useCallback(async () => {
        if (fetchingRef.current) return;
        fetchingRef.current = true;
        setLoading(true);
        setError(null);
        try {
            const headers = await getAuthHeaders();
            const { API_URL } = await import('@/constants/api');
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
            const res = await fetch(`${API_URL}/users/me`, {
                headers,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!res.ok) {
                setError(res.status === 401 ? 'Please sign in again.' : "Couldn't load profile.");
                setUser(null);
                setLoading(false);
                fetchingRef.current = false;
                return;
            }
            const data = await res.json();
            setUser(data);
        } catch (err: any) {
            if (err?.name === 'AbortError') {
                setError('Request timed out. Check your connection.');
            } else {
                setError('Network error. Tap Retry to try again.');
            }
            setUser(null);
        } finally {
            setLoading(false);
            fetchingRef.current = false;
        }
    }, [getAuthHeaders]);

    // Keep ref in sync with latest version of fetchProfile
    useEffect(() => {
        fetchProfileRef.current = fetchProfile;
    }, [fetchProfile]);

    useFocusEffect(
        useCallback(() => {
            if (!isLoaded) {
                setLoading(true);
                setError(null);
                return;
            }
            // Reset guard so every focus event (or auth-state change) fetches fresh
            fetchingRef.current = false;
            fetchProfileRef.current();
        }, [isLoaded, isSignedIn]) // intentionally excludes fetchProfile to prevent Clerk-internal re-runs
    );

    const handleLogout = async () => {
        if (!isSignedIn) {
            // Guest: clear all data so next start is fresh (for testing)
            await clearGuestId();
            mockOnboardingState.geography = '';
            mockOnboardingState.seniority = '';
            mockOnboardingState.selectedLocations = [];
            mockOnboardingState.domains = [];
            mockOnboardingState.keywords = [];
            mockOnboardingState.name = '';
            router.replace('/');
            return;
        }
        const doSignOut = () => {
            signOut()
                .then(() => {
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                        try {
                            const clearClerkStorage = (store: Storage) => {
                                const keysToRemove: string[] = [];
                                for (let i = store.length - 1; i >= 0; i--) {
                                    const key = store.key(i);
                                    if (key) keysToRemove.push(key);
                                }
                                keysToRemove.forEach((k) => store.removeItem(k));
                            };
                            clearClerkStorage(window.localStorage);
                            clearClerkStorage(window.sessionStorage);
                        } catch (_) {}
                        window.location.href = '/';
                        return;
                    }
                    setTimeout(() => router.replace('/'), 200);
                })
                .catch((error) => {
                    console.error('Logout error:', error);
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                        window.alert('Could not sign out. Please try again.');
                    } else {
                        const { Alert } = require('react-native');
                        Alert.alert('Logout failed', 'Could not sign out. Please try again.');
                    }
                });
        };

        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            if (window.confirm('Are you sure you want to log out?')) {
                doSignOut();
            }
        } else {
            const { Alert } = require('react-native');
            Alert.alert(
                'Log Out',
                'Are you sure you want to log out?',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Log Out', style: 'destructive', onPress: doSignOut }
                ]
            );
        }
    };

    const displayName = user?.name || 'Guest';
    const score = user?.profile_score ?? 0;
    const skills = user?.extracted_skills || [];
    const keywords = user?.preferences?.keywords || [];
    const domains = user?.preferences?.domains || user?.fields || [];
    const prefChips = [...skills, ...keywords, ...domains].slice(0, 12);
    const cvFilename = user?.cv_storage_path ? user.cv_storage_path.split('/').pop() || 'CV uploaded' : null;
    const geographyLabel = (() => {
        const g = (user?.preferences?.geography || mockOnboardingState.geography || '').toLowerCase();
        if (g === 'morocco') return 'Morocco only 🇲🇦';
        if (g === 'global') return 'Global / Remote 🌍';
        return 'Everywhere';
    })();

    if (loading && !error) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={COLORS.accent} />
            </View>
        );
    }

    if (error) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }]}>
                <StatusBar style="dark" />
                <Text style={styles.errorMessage}>{error}</Text>
                <Pressable style={styles.retryButton} onPress={() => fetchProfile()}>
                    <Text style={styles.retryButtonText}>Retry</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />
            <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top, paddingBottom: 120 + insets.bottom }]} showsVerticalScrollIndicator={false}>

                {/* Avatar Section */}
                <View style={[styles.avatarSection, { paddingTop: 24 }]}>
                    <View style={styles.avatarCircle}>
                        <Text style={styles.avatarInitials}>{getInitials(displayName)}</Text>
                    </View>
                    <Text style={styles.nameText}>{displayName}</Text>
                    <Text style={styles.universityText}>{user?.email || ''}</Text>

                    <View style={styles.profileCompletionContainer}>
                        <Text style={styles.completionLabel}>Profile {score}% complete</Text>
                        <View style={styles.track}>
                            <View style={[styles.fill, { width: `${score}%` }]} />
                        </View>
                    </View>
                </View>

                {/* MY RESUME */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionLabel}>MY RESUME</Text>
                </View>
                <View style={styles.card}>
                    <View style={styles.resumeIconBox}>
                        <Text style={{ fontSize: 20 }}>📄</Text>
                    </View>
                    <View style={styles.resumeInfo}>
                        <Text style={styles.resumeFilename} numberOfLines={1}>{cvFilename || 'No CV uploaded'}</Text>
                        <Text style={styles.resumeUpdated}>{cvFilename ? 'Update below' : 'Add your CV for better matches'}</Text>
                    </View>
                    <Pressable style={styles.updateCvBtn} onPress={() => router.push('/(onboarding)/preview')}>
                        <Text style={styles.updateCvText}>{cvFilename ? 'Update CV' : 'Add CV'}</Text>
                    </Pressable>
                </View>

                {/* MY PREFERENCES */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionLabel}>MY PREFERENCES</Text>
                </View>
                <View style={[styles.card, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                    <View style={styles.geographyRow}>
                        <Text style={styles.geographyLabel}>Showing jobs:</Text>
                        <Text style={styles.geographyValue}>{geographyLabel}</Text>
                        <Pressable onPress={() => router.push('/(onboarding)/geography')} style={styles.changePrefBtn}>
                            <Text style={styles.changePrefText}>Change</Text>
                        </Pressable>
                    </View>
                    <View style={styles.chipsContainer}>
                        {prefChips.length > 0 ? prefChips.map((pref: string, i: number) => (
                            <View key={i} style={styles.chip}>
                                <Text style={styles.chipText}>{pref}</Text>
                            </View>
                        )) : (
                            <Text style={styles.emptyPrefs}>Add skills and domains in onboarding</Text>
                        )}
                    </View>
                </View>

                {/* ACCOUNT SETTINGS */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionLabel}>ACCOUNT SETTINGS</Text>
                </View>
                <View style={styles.settingsCard}>

                    <Pressable style={styles.settingRow}>
                        <View style={styles.settingIconCenter}>
                            <Text style={{ fontSize: 18 }}>🔔</Text>
                        </View>
                        <Text style={styles.settingLabel}>Notifications</Text>
                        <Text style={styles.settingValue}>Push</Text>
                        <Ionicons name="chevron-forward" size={20} color={COLORS.textMeta} />
                    </Pressable>

                    <Pressable style={styles.settingRow}>
                        <View style={styles.settingIconCenter}>
                            <Text style={{ fontSize: 18 }}>🔒</Text>
                        </View>
                        <Text style={styles.settingLabel}>Privacy & Security</Text>
                        <Text style={styles.settingValue}></Text>
                        <Ionicons name="chevron-forward" size={20} color={COLORS.textMeta} />
                    </Pressable>

                    <Pressable style={styles.settingRow}>
                        <View style={styles.settingIconCenter}>
                            <Text style={{ fontSize: 18 }}>❓</Text>
                        </View>
                        <Text style={styles.settingLabel}>Help & Support</Text>
                        <Text style={styles.settingValue}></Text>
                        <Ionicons name="chevron-forward" size={20} color={COLORS.textMeta} />
                    </Pressable>

                    {/* Log out / Start over */}
                    <Pressable style={[styles.settingRow, { borderBottomWidth: 0 }]} onPress={handleLogout}>
                        <View style={styles.settingIconCenter}>
                            <Ionicons name="log-out-outline" size={22} color={COLORS.accent} />
                        </View>
                        <Text style={[styles.settingLabel, { color: COLORS.accent }]}>
                            {isSignedIn ? 'Log out' : 'Start over'}
                        </Text>
                    </Pressable>

                </View>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    scrollContent: { paddingBottom: 120 },
    avatarSection: { paddingTop: 64, alignItems: 'center', paddingBottom: 24 },
    avatarCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: COLORS.accentRed, justifyContent: 'center', alignItems: 'center' },
    avatarInitials: { fontFamily: 'ClashDisplay-Bold', fontSize: 32, color: 'white' },
    nameText: { fontFamily: 'ClashDisplay-Bold', fontSize: 24, color: COLORS.textPrimary, marginTop: 14 },
    universityText: { fontFamily: 'Satoshi-Regular', fontSize: 12, color: COLORS.textMeta, letterSpacing: 1.2, marginTop: 4 },

    profileCompletionContainer: { marginTop: 16, width: 200 },
    completionLabel: { fontFamily: 'Satoshi-Medium', fontSize: 12, color: COLORS.textMuted, marginBottom: 6, textAlign: 'center' },
    track: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: 'hidden' },
    fill: { width: '72%', height: '100%', backgroundColor: COLORS.accentRed, borderRadius: 3 },

    sectionHeader: { paddingHorizontal: 24, marginBottom: 10, marginTop: 12 },
    sectionLabel: { fontFamily: 'Satoshi-Regular', fontSize: 11, color: COLORS.textMeta, letterSpacing: 1.4 },

    card: {
        marginHorizontal: 24, marginBottom: 24, backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2
    },

    resumeIconBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS_ALPHA.accentLight, justifyContent: 'center', alignItems: 'center' },
    resumeInfo: { flex: 1, gap: 2 },
    resumeFilename: { fontFamily: 'Satoshi-Medium', fontSize: 14, color: COLORS.textPrimary },
    resumeUpdated: { fontFamily: 'Satoshi-Regular', fontSize: 11, color: COLORS.textMeta },
    updateCvBtn: { backgroundColor: COLORS.accentRed, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48, borderRadius: 50, justifyContent: 'center' },
    updateCvText: { fontFamily: 'Satoshi-Medium', fontSize: 12, color: 'white' },

    chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 50, paddingHorizontal: 14, paddingVertical: 8 },
    chipText: { fontFamily: 'Satoshi-Medium', fontSize: 13, color: COLORS.textPrimary },
    emptyPrefs: { fontFamily: 'Satoshi-Regular', fontSize: 13, color: COLORS.textMuted },
    geographyRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    geographyLabel: { fontFamily: 'Satoshi-Regular', fontSize: 13, color: COLORS.textMuted },
    geographyValue: { fontFamily: 'Satoshi-Medium', fontSize: 13, color: COLORS.textPrimary },
    changePrefBtn: { marginLeft: 'auto' },
    changePrefText: { fontFamily: 'Satoshi-Medium', fontSize: 13, color: COLORS.accent },
    addChipBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: COLORS.accentRed, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },

    settingsCard: {
        marginHorizontal: 24, marginBottom: 120, backgroundColor: COLORS.surface, borderRadius: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2
    },
    settingRow: { paddingVertical: 16, minHeight: 48, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 14 },
    settingIconCenter: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    settingLabel: { flex: 1, fontFamily: 'Satoshi-Medium', fontSize: 15, color: COLORS.textPrimary },
    settingValue: { fontFamily: 'Satoshi-Regular', fontSize: 14, color: COLORS.textMeta, marginRight: 4 },
    errorMessage: { fontFamily: 'Satoshi-Medium', fontSize: 15, color: COLORS.textPrimary, textAlign: 'center', marginBottom: 16 },
    retryButton: { backgroundColor: COLORS.accentRed, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 50, minHeight: 48, justifyContent: 'center' },
    retryButtonText: { fontFamily: 'Satoshi-Medium', fontSize: 15, color: 'white' },
});
