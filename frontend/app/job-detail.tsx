import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
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

function getJobFreshness(job: any) {
    if (!job.is_active) return { status: 'closed', label: 'No longer active' };
    const posted = job.posted_at ? new Date(job.posted_at) : null;
    if (!posted) return { status: 'fresh', label: '' };
    const daysOld = Math.floor((Date.now() - posted.getTime()) / 86400000);
    if (daysOld > 30) return { status: 'stale', label: `Posted ${daysOld} days ago — may be filled` };
    if (daysOld > 14) return { status: 'aging', label: `Posted ${daysOld} days ago` };
    return { status: 'fresh', label: `Posted ${daysOld} days ago` };
}

export default function JobDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { getAuthHeaders } = useAuthHeaders();
    const [job, setJob] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            if (!id) { setError('No job ID'); setLoading(false); return; }
            try {
                const headers = await getAuthHeaders();
                const { API_URL } = await import('@/constants/api');
                const res = await fetch(`${API_URL}/jobs/${id}`, { headers });
                if (!res.ok) throw new Error('Failed to load job');
                setJob(await res.json());
            } catch (e: any) {
                setError(e?.message || 'Failed to load job');
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    const handleApply = async () => {
        if (applying) return;
        setApplying(true);
        try {
            const headers = await getAuthHeaders();
            const { API_URL } = await import('@/constants/api');
            const res = await fetch(`${API_URL}/jobs/${id}/apply`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            const url = data?.apply_url || job?.apply_url || '';
            if (url && url.startsWith('http')) {
                await WebBrowser.openBrowserAsync(url);
            } else if (job?.apply_email) {
                await WebBrowser.openBrowserAsync(`mailto:${job.apply_email}`);
            }
        } catch {
            const url = (job?.apply_url || '').trim();
            if (url && url.startsWith('http')) WebBrowser.openBrowserAsync(url);
        } finally {
            setApplying(false);
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ActivityIndicator size="large" color={COLORS.accent} />
            </View>
        );
    }
    if (error || !job) {
        return (
            <View style={[styles.container, styles.centered]}>
                <Text style={styles.errorText}>{error || 'Job not found'}</Text>
                <Pressable style={styles.backBtn} onPress={() => router.back()}>
                    <Text style={styles.backBtnText}>Go back</Text>
                </Pressable>
            </View>
        );
    }

    const freshness = getJobFreshness(job);
    const applyUrl = (job.apply_url || '').trim();
    const hasApply = (applyUrl.startsWith('http') || job.apply_email) && freshness.status !== 'closed';
    const metaParts = [
        [job.city, job.country_code].filter(Boolean).join(', ') || job.location,
        job.job_type || job.type,
        job.remote_type === 'fully_remote' ? 'Remote' : job.remote_type === 'hybrid' ? 'Hybrid' : null,
    ].filter(Boolean);

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <Pressable onPress={() => router.back()} style={styles.headerBtn}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
                </Pressable>
                <Text style={styles.headerTitle} numberOfLines={1}>Job Details</Text>
                <View style={styles.headerBtn} />
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
                showsVerticalScrollIndicator={true}
            >
                <View style={styles.card}>
                    <View style={styles.companyRow}>
                        <View style={styles.logoBox}>
                            <Text style={styles.logoText}>{(displayCompany(job.company) || 'C').charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={styles.companyInfo}>
                            <Text style={styles.title}>{job.title}</Text>
                            <Text style={styles.company} numberOfLines={1}>{displayCompany(job.company)}</Text>
                            <Text style={styles.meta}>{metaParts.join(' · ')}</Text>
                            {job.match_score != null && job.match_score > 0 && (
                                <Text style={styles.matchScore}>{Math.round(job.match_score)}% match</Text>
                            )}
                        </View>
                    </View>
                </View>

                {freshness.label ? (
                    <View style={[styles.freshnessBar, freshness.status === 'stale' && styles.freshnessStale, freshness.status === 'closed' && styles.freshnessClosed]}>
                        <Text style={[styles.freshnessText, freshness.status === 'stale' && { color: '#D97706' }, freshness.status === 'closed' && { color: COLORS.accent }]}>
                            {freshness.label}
                        </Text>
                    </View>
                ) : null}

                {(job.matched_skills?.length || job.missing_skills?.length) ? (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Required Skills</Text>
                        <View style={styles.skillsRow}>
                            {(job.matched_skills || []).map((s: string, i: number) => (
                                <View key={i} style={[styles.skillChip, styles.skillMatched]}>
                                    <Text style={styles.skillMatchedText}>{s}</Text>
                                </View>
                            ))}
                            {(job.missing_skills || []).map((s: string, i: number) => (
                                <View key={`m-${i}`} style={[styles.skillChip, styles.skillMissing]}>
                                    <Text style={styles.skillMissingText}>{s}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                ) : null}

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Description</Text>
                    <View style={styles.descBox}>
                        <Text style={styles.descText}>{job.description_text || job.description || 'No description available.'}</Text>
                    </View>
                </View>
            </ScrollView>

            {hasApply && (
                <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
                    <Pressable style={styles.applyBtn} onPress={handleApply} disabled={applying}>
                        <Text style={styles.applyBtnText}>{applying ? 'Opening...' : 'Apply Now'}</Text>
                    </Pressable>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    centered: { justifyContent: 'center', alignItems: 'center' },
    header: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
        paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    headerBtn: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { flex: 1, fontFamily: 'ClashDisplay-Bold', fontSize: 18, color: COLORS.textPrimary, textAlign: 'center' },
    scroll: { flex: 1 },
    scrollContent: { padding: 16 },
    card: {
        backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
    },
    companyRow: { flexDirection: 'row' },
    logoBox: {
        width: 56, height: 56, borderRadius: 12, backgroundColor: COLORS.border,
        justifyContent: 'center', alignItems: 'center', marginRight: 12,
    },
    logoText: { fontFamily: 'ClashDisplay-Bold', fontSize: 24, color: COLORS.textPrimary },
    companyInfo: { flex: 1 },
    title: { fontFamily: 'ClashDisplay-Semibold', fontSize: 18, color: COLORS.textPrimary },
    company: { fontFamily: 'Satoshi-Regular', fontSize: 14, color: COLORS.textMuted, marginTop: 4 },
    meta: { fontFamily: 'Satoshi-Regular', fontSize: 13, color: COLORS.textMuted, marginTop: 4 },
    matchScore: { fontFamily: 'Satoshi-Bold', fontSize: 13, color: COLORS.accent, marginTop: 6 },
    freshnessBar: {
        backgroundColor: COLORS.surface2, borderRadius: 8, padding: 10, marginBottom: 16, alignItems: 'center',
    },
    freshnessStale: { backgroundColor: '#FEF3C7' },
    freshnessClosed: { backgroundColor: '#FEE2E2' },
    freshnessText: { fontFamily: 'Satoshi-Medium', fontSize: 12, color: COLORS.textMeta },
    section: { marginBottom: 16 },
    sectionTitle: { fontFamily: 'Satoshi-Medium', fontSize: 14, color: COLORS.textMuted, marginBottom: 8, letterSpacing: 0.5 },
    descBox: {
        backgroundColor: COLORS.surface, borderRadius: 12, padding: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    descText: { fontFamily: 'Satoshi-Regular', fontSize: 15, lineHeight: 24, color: COLORS.textPrimary },
    skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    skillChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 50 },
    skillMatched: { backgroundColor: COLORS_ALPHA.successLight, borderWidth: 1, borderColor: COLORS.accentSuccess },
    skillMissing: { backgroundColor: COLORS.surface2 },
    skillMatchedText: { fontFamily: 'Satoshi-Medium', fontSize: 13, color: COLORS.accentSuccess },
    skillMissingText: { fontFamily: 'Satoshi-Regular', fontSize: 13, color: COLORS.textMuted },
    footer: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingHorizontal: 16, paddingTop: 16, backgroundColor: COLORS.background,
    },
    applyBtn: {
        backgroundColor: COLORS.accent, borderRadius: 50, paddingVertical: 16,
        minHeight: 48, justifyContent: 'center', alignItems: 'center',
    },
    applyBtnText: { fontFamily: 'Satoshi-Medium', fontSize: 17, color: 'white' },
    errorText: { fontFamily: 'Satoshi-Regular', fontSize: 16, color: COLORS.textMuted, marginBottom: 16 },
    backBtn: { paddingVertical: 12, paddingHorizontal: 24, backgroundColor: COLORS.accent, borderRadius: 50 },
    backBtnText: { fontFamily: 'Satoshi-Medium', fontSize: 14, color: 'white' },
});
