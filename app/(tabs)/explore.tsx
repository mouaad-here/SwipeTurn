import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthHeaders } from '@/hooks/useAuthHeaders';
import { COLORS, COLORS_ALPHA } from '@/constants/colors';

function displayCompany(name: string | null | undefined): string {
    if (name == null || name === '') return 'Company';
    const n = String(name).trim();
    if (n.toLowerCase() === 'unknown' || n.toLowerCase() === 'unknown company') return 'Company';
    return n;
}

function formatPostedAt(postedAt: string | null | undefined): string {
    if (!postedAt) return '';
    try {
        const diffDays = Math.floor((Date.now() - new Date(postedAt).getTime()) / 86400000);
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return '1d ago';
        if (diffDays < 7) return `${diffDays}d ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
        return new Date(postedAt).toLocaleDateString();
    } catch {
        return '';
    }
}

interface SearchJob {
    id: string;
    title: string;
    company: string;
    location: string;
    matchScore: number;
    matchedSkills: string[];
    apply_url: string;
    posted_at: string | null;
    remote: boolean;
    type: string;
}

export default function SearchScreen() {
    const insets = useSafeAreaInsets();
    const { getAuthHeaders } = useAuthHeaders();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchJob[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loadingRef = useRef(false);

    const runSearch = useCallback(async (q: string) => {
        if (!q.trim()) {
            setResults([]);
            setHasSearched(false);
            return;
        }
        if (loadingRef.current) return;
        loadingRef.current = true;
        setLoading(true);
        setHasSearched(true);
        try {
            const headers = await getAuthHeaders();
            const { API_URL } = await import('@/constants/api');
            const params = new URLSearchParams({ q: q.trim(), exact_priority: 'true', limit: '20' });
            const res = await fetch(`${API_URL}/jobs/search?${params}`, { headers });
            if (!res.ok) { setResults([]); return; }
            const data = await res.json();
            const rawJobs: any[] = Array.isArray(data.jobs) ? data.jobs : [];
            setResults(rawJobs.map((job) => ({
                id: job.id,
                title: job.title ?? 'Job',
                company: displayCompany(job.company),
                location: ([job.city, job.country_code].filter(Boolean).join(', ') || job.location) ?? 'Unknown',
                matchScore: typeof job.match_score === 'number' ? Math.round(job.match_score) : 0,
                matchedSkills: (job.matched_skills ?? []).slice(0, 3),
                apply_url: job.apply_url ?? '',
                posted_at: job.posted_at ?? null,
                remote: !!job.is_remote,
                type: job.job_type ?? job.type ?? '',
            })));
        } catch {
            setResults([]);
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    }, [getAuthHeaders]);

    const handleChangeText = (text: string) => {
        setQuery(text);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!text.trim()) {
            setResults([]);
            setHasSearched(false);
            return;
        }
        debounceRef.current = setTimeout(() => runSearch(text), 500);
    };

    const handleSubmit = () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        runSearch(query);
    };

    const handleClear = () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setQuery('');
        setResults([]);
        setHasSearched(false);
    };

    const renderItem = ({ item }: { item: SearchJob }) => (
        <Pressable
            style={styles.card}
            onPress={() => item.apply_url && WebBrowser.openBrowserAsync(item.apply_url)}
        >
            <View style={styles.logoBox}>
                <Text style={styles.logoInitial}>{item.company.charAt(0).toUpperCase()}</Text>
            </View>

            <View style={styles.infoCenter}>
                <Text style={styles.jobTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.companyName} numberOfLines={1}>{item.company}</Text>
                <View style={styles.metaRow}>
                    <Ionicons name="location-outline" size={11} color={COLORS.textMeta} />
                    <Text style={styles.metaText}>{item.location}</Text>
                    {item.remote && <Text style={styles.remoteBadge}>Remote</Text>}
                    {item.type ? (
                        <>
                            <Text style={styles.metaDot}>·</Text>
                            <Text style={styles.metaText}>{item.type}</Text>
                        </>
                    ) : null}
                    {formatPostedAt(item.posted_at) ? (
                        <>
                            <Text style={styles.metaDot}>·</Text>
                            <Text style={styles.metaText}>{formatPostedAt(item.posted_at)}</Text>
                        </>
                    ) : null}
                </View>
                {item.matchedSkills.length > 0 && (
                    <View style={styles.skillsRow}>
                        {item.matchedSkills.map((s, i) => (
                            <View key={i} style={styles.skillChip}>
                                <Text style={styles.skillChipText}>✓ {s}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </View>

            <View style={styles.rightCol}>
                <View style={[styles.scoreBadge, item.matchScore >= 70 ? styles.scoreBadgeGood : styles.scoreBadgeMid]}>
                    <Text style={[styles.scoreText, item.matchScore >= 70 ? styles.scoreTextGood : styles.scoreTextMid]}>
                        {item.matchScore}%
                    </Text>
                </View>
                <Pressable
                    style={styles.applyPill}
                    onPress={() => item.apply_url && WebBrowser.openBrowserAsync(item.apply_url)}
                >
                    <Text style={styles.applyPillText}>Apply</Text>
                </Pressable>
            </View>
        </Pressable>
    );

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <Text style={styles.headerTitle}>Search</Text>
            </View>

            {/* Search bar */}
            <View style={styles.searchBarWrapper}>
                <View style={styles.searchBar}>
                    <Ionicons name="search" size={18} color={COLORS.textMuted} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Job title, skill, keyword..."
                        placeholderTextColor={COLORS.textMuted}
                        value={query}
                        onChangeText={handleChangeText}
                        onSubmitEditing={handleSubmit}
                        returnKeyType="search"
                        autoCorrect={false}
                        autoCapitalize="none"
                    />
                    {query.length > 0 && (
                        <Pressable onPress={handleClear} hitSlop={10}>
                            <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                        </Pressable>
                    )}
                </View>
            </View>

            {/* States */}
            {loading ? (
                <View style={styles.centerState}>
                    <ActivityIndicator size="large" color={COLORS.accent} />
                    <Text style={styles.emptySubtitle}>Searching…</Text>
                </View>
            ) : !hasSearched ? (
                <View style={styles.centerState}>
                    <Ionicons name="search-outline" size={56} color={COLORS.border} />
                    <Text style={styles.emptyTitle}>Find your next role</Text>
                    <Text style={styles.emptySubtitle}>Type a job title, skill, or company above.</Text>
                </View>
            ) : results.length === 0 ? (
                <View style={styles.centerState}>
                    <Ionicons name="alert-circle-outline" size={56} color={COLORS.border} />
                    <Text style={styles.emptyTitle}>No results</Text>
                    <Text style={styles.emptySubtitle}>Try a different keyword or broaden your search.</Text>
                </View>
            ) : (
                <FlatList
                    data={results}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={[styles.listContent, { paddingBottom: 120 + insets.bottom }]}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    ListHeaderComponent={
                        <Text style={styles.resultsCount}>{results.length} result{results.length !== 1 ? 's' : ''} for "{query}"</Text>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    header: { paddingHorizontal: 24, marginBottom: 12 },
    headerTitle: { fontFamily: 'ClashDisplay-Bold', fontSize: 32, color: COLORS.textPrimary },

    searchBarWrapper: { paddingHorizontal: 16, marginBottom: 8 },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.surface,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: COLORS.border,
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 10,
    },
    searchInput: {
        flex: 1,
        fontFamily: 'Satoshi-Regular',
        fontSize: 15,
        color: COLORS.textPrimary,
        minHeight: 24,
    },

    resultsCount: {
        fontFamily: 'Satoshi-Regular',
        fontSize: 12,
        color: COLORS.textMuted,
        paddingHorizontal: 4,
        marginBottom: 8,
    },
    listContent: { paddingHorizontal: 16, paddingTop: 4 },

    card: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    logoBox: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: COLORS.surface2,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        flexShrink: 0,
    },
    logoInitial: { fontFamily: 'ClashDisplay-Bold', fontSize: 20, color: COLORS.textPrimary },
    infoCenter: { flex: 1, gap: 2 },
    jobTitle: { fontFamily: 'Satoshi-Medium', fontSize: 14, color: COLORS.textPrimary, lineHeight: 20 },
    companyName: { fontFamily: 'Satoshi-Regular', fontSize: 12, color: COLORS.textMuted },
    metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 3 },
    metaText: { fontFamily: 'Satoshi-Regular', fontSize: 11, color: COLORS.textMeta },
    metaDot: { color: COLORS.textMeta, fontSize: 10 },
    remoteBadge: {
        fontFamily: 'Satoshi-Medium',
        fontSize: 10,
        color: COLORS.accentSuccess,
        backgroundColor: COLORS_ALPHA.successLight,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
    skillChip: {
        backgroundColor: COLORS_ALPHA.successLight,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    skillChipText: { fontFamily: 'Satoshi-Medium', fontSize: 10, color: COLORS.accentSuccess },

    rightCol: { alignItems: 'flex-end', gap: 8, flexShrink: 0, marginLeft: 8 },
    scoreBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, minWidth: 44, alignItems: 'center' },
    scoreBadgeGood: { backgroundColor: COLORS_ALPHA.successLight },
    scoreBadgeMid: { backgroundColor: COLORS.surface2 },
    scoreText: { fontFamily: 'Satoshi-Medium', fontSize: 12 },
    scoreTextGood: { color: COLORS.accentSuccess },
    scoreTextMid: { color: COLORS.textMuted },

    applyPill: {
        backgroundColor: COLORS.accent,
        borderRadius: 50,
        paddingVertical: 8,
        paddingHorizontal: 14,
        minHeight: 36,
        justifyContent: 'center',
        alignItems: 'center',
    },
    applyPillText: { fontFamily: 'Satoshi-Medium', fontSize: 12, color: 'white' },

    centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
    emptyTitle: { fontFamily: 'ClashDisplay-Bold', fontSize: 22, color: COLORS.textPrimary, textAlign: 'center' },
    emptySubtitle: { fontFamily: 'Satoshi-Regular', fontSize: 14, color: COLORS.textMuted, textAlign: 'center' },
});
