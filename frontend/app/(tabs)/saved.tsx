import { COLORS } from '@/constants/colors';
import { useAuthHeaders } from '@/hooks/useAuthHeaders';
import { useAppStore } from '../../store/appStore';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface SavedJob {
    id: string;
    title: string;
    company: string;
    location: string;
    timeAgo: string;
    apply_url: string;
    apply_email: string;
    status: 'saved' | 'applied';
    freshness: 'fresh' | 'aging' | 'stale' | 'closed';
    is_active?: boolean;
    posted_at?: string;
}

function formatTimeAgo(savedAt: string | undefined): string {
    if (!savedAt) return '';
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
        return '';
    }
}

function displayCompany(name: string | null | undefined): string {
    if (!name) return 'Company';
    const n = String(name).trim();
    if (n.toLowerCase() === 'unknown' || n.toLowerCase() === 'unknown company') return 'Company';
    return n;
}

function getFreshness(job: any): SavedJob['freshness'] {
    if (job.is_active === false) return 'closed';
    const posted = job.posted_at ? new Date(job.posted_at) : null;
    if (!posted) return 'fresh';
    const days = Math.floor((Date.now() - posted.getTime()) / 86400000);
    if (days > 30) return 'stale';
    if (days > 14) return 'aging';
    return 'fresh';
}

const FRESHNESS_COLORS: Record<string, string> = {
    fresh: COLORS.accentSuccess,
    aging: '#D97706',
    stale: '#EF4444',
    closed: COLORS.textMeta,
};

export default function SavedScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { getAuthHeaders } = useAuthHeaders();
    const savedJobsFromStore = useAppStore(state => state.savedJobs);

    const [jobMap, setJobMap] = useState<Map<string, SavedJob>>(new Map());
    const [jobOrder, setJobOrder] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    const loadingRef = useRef(false);
    const lastFetchedAtRef = useRef(0);
    const suppressNextFocusRef = useRef(false);
    const COOLDOWN_MS = 10000;

    const loadSaved = useCallback(async (force = false) => {
        if (suppressNextFocusRef.current && !force) {
            suppressNextFocusRef.current = false;
            return;
        }
        const now = Date.now();
        if (!force && lastFetchedAtRef.current > 0 && now - lastFetchedAtRef.current < COOLDOWN_MS) {
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
            if (!res.ok) { setJobMap(new Map()); setJobOrder([]); return; }
            const data = await res.json();
            const rawJobs = data.data || [];

            // Deduplicate by ID to prevent key warnings
            const uniqueJobsMap = new Map();
            rawJobs.forEach((j: any) => {
                if (j.id && !uniqueJobsMap.has(j.id)) {
                    uniqueJobsMap.set(j.id, j);
                }
            });
            const uniqueJobs = Array.from(uniqueJobsMap.values());

            const jobs: SavedJob[] = uniqueJobs.map((j: any) => ({
                id: j.id,
                title: j.title || 'Unknown',
                company: displayCompany(j.company),
                location: ([j.city, j.country_code].filter(Boolean).join(', ') || j.location || '').toUpperCase(),
                timeAgo: formatTimeAgo(j.saved_at),
                apply_url: j.apply_url || '',
                apply_email: j.apply_email || '',
                status: j.status === 'applied' ? 'applied' : 'saved',
                freshness: getFreshness(j),
                is_active: j.is_active,
                posted_at: j.posted_at,
            }));

            // Start from backend truth
            const newMap = new Map<string, SavedJob>(jobs.map(j => [j.id, j]));
            const orderSet = new Set<string>(jobs.map(j => j.id));

            // Merge in any optimistic locally-saved jobs that might not have
            // reached the backend yet, so they don't disappear after refresh.
            savedJobsFromStore.forEach((j) => {
                if (newMap.has(j.id)) return;
                const optimisticJob: SavedJob = {
                    id: j.id,
                    title: j.title || 'Unknown',
                    company: displayCompany(j.company),
                    location: (j.location || '').toUpperCase(),
                    timeAgo: 'Just now',
                    apply_url: j.url || '',
                    apply_email: '',
                    status: 'saved',
                    freshness: 'fresh',
                    is_active: true,
                    posted_at: undefined,
                };
                newMap.set(j.id, optimisticJob);
                orderSet.add(j.id);
            });

            setJobMap(newMap);
            setJobOrder(Array.from(orderSet));
            lastFetchedAtRef.current = Date.now();
        } catch {
            setJobMap(new Map());
            setJobOrder([]);
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    }, [getAuthHeaders, savedJobsFromStore]);

    // Merge optimistic locally-saved jobs (from swipe-right) into the list immediately,
    // so the user doesn't have to wait for the next backend refresh.
    useEffect(() => {
        if (!savedJobsFromStore || savedJobsFromStore.length === 0) return;
        setJobMap(prevMap => {
            const nextMap = new Map(prevMap);
            let orderChanged = false;
            const nextOrder = new Set(jobOrder);

            savedJobsFromStore.forEach((j) => {
                if (nextMap.has(j.id)) {
                    return;
                }
                const optimisticJob: SavedJob = {
                    id: j.id,
                    title: j.title || 'Unknown',
                    company: displayCompany(j.company),
                    location: (j.location || '').toUpperCase(),
                    timeAgo: 'Just now',
                    apply_url: j.url || '',
                    apply_email: '',
                    status: 'saved',
                    freshness: 'fresh',
                    is_active: true,
                    posted_at: undefined,
                };
                nextMap.set(j.id, optimisticJob);
                nextOrder.add(j.id);
                orderChanged = true;
            });

            if (orderChanged) {
                setJobOrder(Array.from(nextOrder));
            }
            return nextMap;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [savedJobsFromStore]);

    useFocusEffect(
        useCallback(() => { loadSaved(); }, [loadSaved])
    );

    const allJobs = jobOrder.map(id => jobMap.get(id)).filter(Boolean) as SavedJob[];
    const savedCount = allJobs.filter(j => j.status === 'saved').length;
    const appliedCount = allJobs.filter(j => j.status === 'applied').length;

    const handleApply = async (item: SavedJob) => {
        // Optimistic status update
        setJobMap(prev => {
            const next = new Map(prev);
            const job = next.get(item.id);
            if (job) next.set(item.id, { ...job, status: 'applied' });
            return next;
        });

        // Suppress refetch when browser closes and app regains focus
        suppressNextFocusRef.current = true;
        lastFetchedAtRef.current = Date.now();

        const url = (item.apply_url || '').trim();
        const browserPromise = url.startsWith('http')
            ? WebBrowser.openBrowserAsync(url)
            : item.apply_email
                ? WebBrowser.openBrowserAsync(`mailto:${item.apply_email}`)
                : Promise.resolve();

        try {
            const headers = await getAuthHeaders();
            const { API_URL } = await import('@/constants/api');
            await fetch(`${API_URL}/jobs/${item.id}/apply`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
            });
        } catch { }

        await browserPromise;
        suppressNextFocusRef.current = false;
    };

    const handleRemove = async (item: SavedJob) => {
        // Optimistic removal
        setJobMap(prev => { const next = new Map(prev); next.delete(item.id); return next; });
        setJobOrder(prev => prev.filter(id => id !== item.id));
        try {
            const headers = await getAuthHeaders();
            const { API_URL } = await import('@/constants/api');
            await fetch(`${API_URL}/swipes/${item.id}`, { method: 'DELETE', headers });
        } catch {
            loadSaved(true);
        }
    };

    const confirmRemove = (item: SavedJob) => {
        Alert.alert(
            'Remove job',
            `Remove "${item.title}" from your list?`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => handleRemove(item) },
            ]
        );
    };

    const renderItem = ({ item }: { item: SavedJob }) => {
        const isClosed = item.freshness === 'closed';
        const isApplied = item.status === 'applied';
        const freshColor = FRESHNESS_COLORS[item.freshness];

        return (
            <Pressable
                style={[styles.card, isApplied && styles.cardApplied]}
                onPress={() => router.push({ pathname: '/job-detail', params: { id: item.id } })}
                onLongPress={() => confirmRemove(item)}
                delayLongPress={400}
            >
                {/* Company initial */}
                <View style={[styles.logoBox, isApplied && styles.logoBoxApplied]}>
                    <Text style={styles.logoInitial}>{(item.company || 'C').charAt(0).toUpperCase()}</Text>
                </View>

                {/* Info */}
                <View style={styles.infoCenter}>
                    <Text style={styles.jobTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.companyName} numberOfLines={1}>{item.company}</Text>
                    <View style={styles.metaRow}>
                        {item.location ? (
                            <>
                                <Ionicons name="location-outline" size={11} color={COLORS.textMeta} />
                                <Text style={styles.metaText}>{item.location}</Text>
                                <Text style={styles.metaDot}>·</Text>
                            </>
                        ) : null}
                        <Text style={[styles.metaText, { color: freshColor }]}>
                            {isClosed ? 'Closed' : item.timeAgo}
                        </Text>
                    </View>
                </View>

                {/* Right action */}
                {isApplied ? (
                    <View style={styles.appliedBadge}>
                        <Ionicons name="checkmark-circle" size={14} color={COLORS.accentSuccess} />
                        <Text style={styles.appliedText}>Applied</Text>
                    </View>
                ) : (
                    <Pressable
                        style={[styles.applyBtn, isClosed && styles.applyBtnDisabled]}
                        onPress={(e) => { e.stopPropagation(); if (!isClosed) handleApply(item); }}
                        disabled={isClosed}
                    >
                        <Text style={styles.applyBtnText}>{isClosed ? 'Closed' : 'Apply'}</Text>
                    </Pressable>
                )}
            </Pressable>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <Text style={styles.headerTitle}>My List</Text>
                {allJobs.length > 0 && (
                    <Text style={styles.headerSubtitle}>
                        {savedCount > 0 ? `${savedCount} saved` : ''}
                        {savedCount > 0 && appliedCount > 0 ? '  ·  ' : ''}
                        {appliedCount > 0 ? `${appliedCount} applied` : ''}
                    </Text>
                )}
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={COLORS.accent} />
                </View>
            ) : (
                <FlatList
                    data={allJobs}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 120 }]}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Text style={styles.emptyIcon}>📋</Text>
                            <Text style={styles.emptyTitle}>Nothing saved yet</Text>
                            <Text style={styles.emptySubtitle}>Swipe right on jobs to save them here.</Text>
                        </View>
                    }
                    ListFooterComponent={
                        allJobs.length > 0 ? (
                            <Text style={styles.hint}>Long-press a card to remove it</Text>
                        ) : null
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    header: {
        paddingHorizontal: 24,
        paddingBottom: 16,
    },
    headerTitle: {
        fontFamily: 'ClashDisplay-Bold',
        fontSize: 32,
        color: COLORS.textPrimary,
    },
    headerSubtitle: {
        fontFamily: 'Satoshi-Regular',
        fontSize: 13,
        color: COLORS.textMeta,
        marginTop: 2,
    },
    listContent: {
        paddingHorizontal: 16,
        gap: 10,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        padding: 16,
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    cardApplied: {
        borderLeftWidth: 3,
        borderLeftColor: COLORS.accentSuccess,
    },
    logoBox: {
        width: 46,
        height: 46,
        borderRadius: 12,
        backgroundColor: COLORS.surface2,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoBoxApplied: {
        backgroundColor: '#DCFCE7',
    },
    logoInitial: {
        fontFamily: 'ClashDisplay-Bold',
        fontSize: 20,
        color: COLORS.textPrimary,
    },
    infoCenter: {
        flex: 1,
        gap: 3,
    },
    jobTitle: {
        fontFamily: 'Satoshi-Medium',
        fontSize: 15,
        color: COLORS.textPrimary,
    },
    companyName: {
        fontFamily: 'Satoshi-Regular',
        fontSize: 13,
        color: COLORS.textMuted,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
    },
    metaText: {
        fontFamily: 'Satoshi-Regular',
        fontSize: 11,
        color: COLORS.textMeta,
    },
    metaDot: {
        fontSize: 11,
        color: COLORS.textMeta,
    },
    applyBtn: {
        backgroundColor: COLORS.accent,
        borderRadius: 50,
        paddingVertical: 8,
        paddingHorizontal: 16,
        minWidth: 62,
        alignItems: 'center',
    },
    applyBtnDisabled: {
        backgroundColor: COLORS.textMeta,
    },
    applyBtnText: {
        fontFamily: 'Satoshi-Medium',
        fontSize: 13,
        color: 'white',
    },
    appliedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#DCFCE7',
        borderRadius: 50,
        paddingVertical: 6,
        paddingHorizontal: 10,
    },
    appliedText: {
        fontFamily: 'Satoshi-Medium',
        fontSize: 12,
        color: COLORS.accentSuccess,
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 80,
    },
    emptyIcon: {
        fontSize: 40,
        marginBottom: 12,
    },
    emptyTitle: {
        fontFamily: 'ClashDisplay-Bold',
        fontSize: 20,
        color: COLORS.textPrimary,
        marginBottom: 6,
    },
    emptySubtitle: {
        fontFamily: 'Satoshi-Regular',
        fontSize: 14,
        color: COLORS.textMuted,
        textAlign: 'center',
        paddingHorizontal: 32,
    },
    hint: {
        fontFamily: 'Satoshi-Regular',
        fontSize: 12,
        color: COLORS.textMeta,
        textAlign: 'center',
        marginTop: 16,
        marginBottom: 8,
    },
});
