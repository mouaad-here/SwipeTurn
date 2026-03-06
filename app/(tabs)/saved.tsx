import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthHeaders } from '@/hooks/useAuthHeaders';
import { COLORS } from '@/constants/colors';

type Tab = 'saved' | 'applied';

interface SavedJob {
    id: string;
    title: string;
    company: string;
    location: string;
    timeAgo: string;
    apply_url: string;
    apply_email: string;
    status: string;
    applied_at?: string;
    freshness: 'fresh' | 'aging' | 'stale' | 'closed';
    is_active?: boolean;
    posted_at?: string;
}

function formatTimeAgo(savedAt: string | undefined): string {
    if (!savedAt) return 'Saved';
    try {
        const d = new Date(savedAt);
        const diffMs = Date.now() - d.getTime();
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

function getFreshness(job: any): 'fresh' | 'aging' | 'stale' | 'closed' {
    if (job.is_active === false) return 'closed';
    const posted = job.posted_at ? new Date(job.posted_at) : null;
    if (!posted) return 'fresh';
    const days = Math.floor((Date.now() - posted.getTime()) / 86400000);
    if (days > 30) return 'stale';
    if (days > 14) return 'aging';
    return 'fresh';
}

const FRESHNESS_COLORS = {
    fresh: COLORS.accentSuccess,
    aging: '#D97706',
    stale: '#EF4444',
    closed: COLORS.textMeta,
};

export default function SavedScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { getAuthHeaders } = useAuthHeaders();
    const [tab, setTab] = useState<Tab>('saved');
    const [allJobs, setAllJobs] = useState<SavedJob[]>([]);
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
            if (!res.ok) { setAllJobs([]); return; }
            const data = await res.json();
            const jobs = (data.data || []).map((j: any) => ({
                id: j.id,
                title: j.title || 'Unknown',
                company: displayCompany(j.company),
                location: ([j.city, j.country_code].filter(Boolean).join(', ') || j.location || 'Unknown').toUpperCase(),
                timeAgo: formatTimeAgo(j.saved_at),
                apply_url: j.apply_url || '',
                apply_email: j.apply_email || '',
                status: j.status || 'saved',
                applied_at: j.applied_at,
                freshness: getFreshness(j),
                is_active: j.is_active,
                posted_at: j.posted_at,
            }));
            setAllJobs(jobs);
            lastFetchedAtRef.current = Date.now();
        } catch {
            setAllJobs([]);
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    }, [getAuthHeaders]);

    useFocusEffect(
        useCallback(() => { loadSaved(); }, [loadSaved])
    );

    const savedJobs = allJobs.filter(j => j.status === 'saved');
    const appliedJobs = allJobs.filter(j => j.status === 'applied');
    const displayJobs = tab === 'saved' ? savedJobs : appliedJobs;

    const handleApply = async (item: SavedJob) => {
        try {
            const headers = await getAuthHeaders();
            const { API_URL } = await import('@/constants/api');
            await fetch(`${API_URL}/jobs/${item.id}/apply`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
            });
        } catch {}
        const url = (item.apply_url || '').trim();
        if (url && url.startsWith('http')) {
            WebBrowser.openBrowserAsync(url);
        } else if (item.apply_email) {
            WebBrowser.openBrowserAsync(`mailto:${item.apply_email}`);
        }
        loadSaved(true);
    };

    const renderItem = ({ item }: { item: SavedJob }) => {
        const freshColor = FRESHNESS_COLORS[item.freshness];
        const isClosed = item.freshness === 'closed';

        return (
            <Pressable
                style={[styles.card, isClosed && styles.cardClosed]}
                onPress={() => router.push({ pathname: '/job-detail', params: { id: item.id } })}
            >
                <View style={styles.logoBox}>
                    <Text style={styles.logoInitial}>{(item.company || 'C').charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.infoCenter}>
                    <Text style={[styles.jobTitle, isClosed && { color: COLORS.textMeta }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.companyName} numberOfLines={1}>{item.company}</Text>
                    <View style={styles.metaRow}>
                        <Ionicons name="location-outline" size={12} color={COLORS.textMeta} style={{ marginRight: 2 }} />
                        <Text style={styles.metaText}>{item.location}</Text>
                        <View style={[styles.freshDot, { backgroundColor: freshColor }]} />
                        <Text style={[styles.metaText, { color: freshColor }]}>
                            {item.freshness === 'closed' ? 'Closed' : item.timeAgo}
                        </Text>
                    </View>
                </View>
                {!isClosed && tab === 'saved' && (
                    <Pressable
                        style={styles.applyPill}
                        onPress={(e) => { e.stopPropagation(); handleApply(item); }}
                    >
                        <Text style={styles.applyPillText}>Apply</Text>
                    </Pressable>
                )}
                {tab === 'applied' && (
                    <View style={styles.appliedBadge}>
                        <Ionicons name="checkmark-circle" size={16} color={COLORS.accentSuccess} />
                        <Text style={styles.appliedText}>Applied</Text>
                    </View>
                )}
            </Pressable>
        );
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <Text style={styles.headerTitle}>My List</Text>
            </View>

            <View style={styles.tabBar}>
                <Pressable style={[styles.tab, tab === 'saved' && styles.tabActive]} onPress={() => setTab('saved')}>
                    <Text style={[styles.tabText, tab === 'saved' && styles.tabTextActive]}>
                        Saved {savedJobs.length > 0 ? `(${savedJobs.length})` : ''}
                    </Text>
                </Pressable>
                <Pressable style={[styles.tab, tab === 'applied' && styles.tabActive]} onPress={() => setTab('applied')}>
                    <Text style={[styles.tabText, tab === 'applied' && styles.tabTextActive]}>
                        Applied {appliedJobs.length > 0 ? `(${appliedJobs.length})` : ''}
                    </Text>
                </Pressable>
            </View>

            {loading ? (
                <View style={styles.emptyContainer}>
                    <ActivityIndicator size="large" color={COLORS.accent} />
                    <Text style={[styles.emptyText, { marginTop: 12 }]}>Loading...</Text>
                </View>
            ) : (
                <FlatList
                    data={displayJobs}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={[styles.listContent, { paddingBottom: 120 + insets.bottom }]}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>
                                {tab === 'saved' ? 'No saved jobs yet.' : 'No applied jobs yet.'}
                            </Text>
                            <Text style={styles.emptySubtext}>
                                {tab === 'saved' ? 'Swipe right on jobs to save them.' : 'Tap Apply on saved jobs to track them.'}
                            </Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    header: { paddingTop: 64, paddingHorizontal: 24, marginBottom: 8 },
    headerTitle: { fontFamily: 'ClashDisplay-Bold', fontSize: 32, color: COLORS.textPrimary },
    tabBar: {
        flexDirection: 'row', marginHorizontal: 16, marginBottom: 16,
        backgroundColor: COLORS.surface2, borderRadius: 12, padding: 4,
    },
    tab: {
        flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10,
    },
    tabActive: { backgroundColor: COLORS.surface },
    tabText: { fontFamily: 'Satoshi-Medium', fontSize: 14, color: COLORS.textMuted },
    tabTextActive: { color: COLORS.textPrimary },
    listContent: { paddingHorizontal: 16, paddingBottom: 120, gap: 12 },
    card: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface,
        borderRadius: 16, padding: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
    },
    cardClosed: { opacity: 0.6 },
    logoBox: {
        width: 56, height: 56, borderRadius: 12, backgroundColor: COLORS.surface2,
        justifyContent: 'center', alignItems: 'center', marginRight: 12,
    },
    logoInitial: { fontFamily: 'ClashDisplay-Bold', fontSize: 24, color: COLORS.textPrimary },
    infoCenter: { flex: 1, gap: 3, marginRight: 8 },
    jobTitle: { fontFamily: 'Satoshi-Medium', fontSize: 15, color: COLORS.textPrimary },
    companyName: { fontFamily: 'Satoshi-Regular', fontSize: 13, color: COLORS.textMuted },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
    metaText: { fontFamily: 'Satoshi-Regular', fontSize: 11, color: COLORS.textMeta },
    freshDot: { width: 6, height: 6, borderRadius: 3, marginHorizontal: 6 },
    applyPill: {
        backgroundColor: COLORS.accent, borderRadius: 50, paddingVertical: 8, paddingHorizontal: 16,
        minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center',
    },
    applyPillText: { fontFamily: 'Satoshi-Medium', fontSize: 13, color: 'white' },
    appliedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    appliedText: { fontFamily: 'Satoshi-Medium', fontSize: 12, color: COLORS.accentSuccess },
    emptyContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },
    emptyText: { fontFamily: 'Satoshi-Regular', fontSize: 14, color: COLORS.textMuted },
    emptySubtext: { fontFamily: 'Satoshi-Regular', fontSize: 12, color: COLORS.textMeta, marginTop: 8 },
});
