import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthHeaders } from '@/hooks/useAuthHeaders';

const COLORS = {
    background: '#F8F9FA',
    accentRed: '#FF4422',
    accentGreen: '#10B981',
    textPrimary: '#111827',
    textMuted: '#6B7280',
    border: '#E5E7EB',
    surface: '#FFFFFF',
    surface2: '#F3F4F6',
    metaText: '#9CA3AF'
};

function formatTimeAgo(savedAt: string | undefined): string {
    if (!savedAt) return 'Saved';
    try {
        const d = new Date(savedAt);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return d.toLocaleDateString();
    } catch {
        return 'Saved';
    }
}

function displayCompany(name: string | null | undefined): string {
    if (name == null || name === '') return 'Company';
    const n = String(name).trim();
    if (n.toLowerCase() === 'unknown' || n.toLowerCase() === 'unknown company') return 'Company';
    return n;
}

export default function SavedScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { getAuthHeaders } = useAuthHeaders();
    const [savedJobs, setSavedJobs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const loadingRef = useRef(false);
    const lastFetchedAtRef = useRef(0);
    const SAVED_COOLDOWN_MS = 5000;

    const loadSaved = useCallback(async (force = false) => {
        const now = Date.now();
        if (!force && lastFetchedAtRef.current > 0 && now - lastFetchedAtRef.current < SAVED_COOLDOWN_MS) {
            setLoading(false);
            return;
        }
        if (loadingRef.current) return;
        loadingRef.current = true;
        setLoading(true);
        try {
            const headers = await getAuthHeaders();
            const { API_URL } = await import('@/constants/api');
            const res = await fetch(`${API_URL}/swipes/saved`, { headers });
            if (!res.ok) {
                setSavedJobs([]);
                return;
            }
            const data = await res.json();
            const jobs = (data.data || []).map((j: any) => ({
                id: j.id,
                title: j.title || 'Unknown',
                company: displayCompany(j.company),
                location: (j.location || 'Unknown').toUpperCase(),
                timeAgo: formatTimeAgo(j.saved_at),
                apply_url: j.apply_url || '',
                apply_email: j.apply_email || '',
                description: j.description || '',
            }));
            setSavedJobs(jobs);
            lastFetchedAtRef.current = Date.now();
        } catch {
            setSavedJobs([]);
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    }, [getAuthHeaders]);

    useFocusEffect(
        useCallback(() => {
            loadSaved();
        }, [loadSaved])
    );

    const handleApply = (item: any) => {
        const url = (item.apply_url || '').trim();
        if (url && url.startsWith('http')) {
            WebBrowser.openBrowserAsync(url);
        } else if (item.apply_email) {
            WebBrowser.openBrowserAsync(`mailto:${item.apply_email}`);
        }
    };

    const renderItem = ({ item }: { item: any }) => (
        <Pressable
            style={styles.card}
            onPress={() => router.push({ pathname: '/job-detail', params: { id: item.id } })}
        >
            <View style={styles.logoBox}>
                <Text style={styles.logoInitial}>{(displayCompany(item.company) || 'C').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.infoCenter}>
                <Text style={styles.jobTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.companyName} numberOfLines={1} ellipsizeMode="tail">{displayCompany(item.company)}</Text>
                <View style={styles.metaRow}>
                    <Ionicons name="location-outline" size={12} color={COLORS.metaText} style={{ marginRight: 2 }} />
                    <Text style={styles.metaText}>{item.location}</Text>
                    <Text style={styles.metaDot}>•</Text>
                    <Text style={styles.metaText}>{item.timeAgo}</Text>
                </View>
            </View>
            <Pressable
                style={styles.applyPill}
                onPress={(e) => { e.stopPropagation(); handleApply(item); }}
            >
                <Text style={styles.applyPillText}>Apply</Text>
            </Pressable>
        </Pressable>
    );

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <Text style={styles.headerTitle}>My List</Text>
            </View>

            {loading ? (
                <View style={styles.emptyContainer}>
                    <ActivityIndicator size="large" color={COLORS.accentRed} />
                    <Text style={[styles.emptyText, { marginTop: 12 }]}>Loading saved jobs...</Text>
                </View>
            ) : (
                <FlatList
                    data={savedJobs}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={[styles.listContent, { paddingBottom: 120 + insets.bottom }]}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>No saved jobs yet.</Text>
                            <Text style={styles.emptySubtext}>Swipe right on jobs to save them.</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    header: { paddingTop: 64, paddingHorizontal: 24, marginBottom: 16 },
    headerTitle: { fontFamily: 'Syne_800ExtraBold', fontSize: 32, color: COLORS.textPrimary },
    listContent: { paddingHorizontal: 16, paddingBottom: 120, gap: 12 },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    logoBox: {
        width: 56,
        height: 56,
        borderRadius: 12,
        backgroundColor: COLORS.surface2,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    logoInitial: { fontFamily: 'Syne_800ExtraBold', fontSize: 24, color: COLORS.textPrimary },
    infoCenter: { flex: 1, gap: 3, marginRight: 8 },
    jobTitle: { fontFamily: 'DMSans_500Medium', fontSize: 15, color: COLORS.textPrimary },
    companyName: { fontFamily: 'DMSans_400Regular', fontSize: 13, color: COLORS.textMuted },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
    metaText: { fontFamily: 'DMSans_400Regular', fontSize: 11, color: COLORS.metaText },
    metaDot: { color: COLORS.metaText, fontSize: 10, marginHorizontal: 4 },
    applyPill: {
        backgroundColor: COLORS.accentRed,
        borderRadius: 50,
        paddingVertical: 8,
        paddingHorizontal: 16,
        minWidth: 48,
        minHeight: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    applyPillText: { fontFamily: 'DMSans_500Medium', fontSize: 13, color: 'white' },
    emptyContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },
    emptyText: { fontFamily: 'DMSans_400Regular', fontSize: 14, color: COLORS.textMuted },
    emptySubtext: { fontFamily: 'DMSans_400Regular', fontSize: 12, color: COLORS.metaText, marginTop: 8 },
});
