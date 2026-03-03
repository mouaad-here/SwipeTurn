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

const COLORS = {
    background: '#F8F9FA',
    surface: '#FFFFFF',
    accentRed: '#FF4422',
    textPrimary: '#111827',
    textMuted: '#6B7280',
    border: '#E5E7EB',
};

function displayCompany(name: string | null | undefined): string {
    if (name == null || name === '') return 'Company';
    const n = String(name).trim();
    if (n.toLowerCase() === 'unknown' || n.toLowerCase() === 'unknown company') return 'Company';
    return n;
}

export default function JobDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { getAuthHeaders } = useAuthHeaders();
    const [job, setJob] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            if (!id) {
                setError('No job ID');
                setLoading(false);
                return;
            }
            try {
                const headers = await getAuthHeaders();
                const { API_URL } = await import('@/constants/api');
                const res = await fetch(`${API_URL}/jobs/${id}`, { headers });
                if (!res.ok) throw new Error('Failed to load job');
                const data = await res.json();
                setJob(data);
            } catch (e: any) {
                setError(e?.message || 'Failed to load job');
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    const handleApply = () => {
        const url = job?.apply_url || job?.apply_email ? `mailto:${job.apply_email}` : null;
        if (url && url.startsWith('http')) {
            WebBrowser.openBrowserAsync(url);
        } else if (job?.apply_email) {
            WebBrowser.openBrowserAsync(`mailto:${job.apply_email}`);
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ActivityIndicator size="large" color={COLORS.accentRed} />
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

    const applyUrl = (job.apply_url || '').trim();
    const hasApply = applyUrl.startsWith('http') || job.apply_email;

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
                            <Text style={styles.company} numberOfLines={1} ellipsizeMode="tail">{displayCompany(job.company)}</Text>
                            <View style={styles.metaRow}>
                                <Ionicons name="location-outline" size={14} color={COLORS.textMuted} />
                                <Text style={styles.meta}>{job.city || job.location || 'Unknown'}</Text>
                            </View>
                            {job.match_score != null && (
                                <Text style={styles.matchScore}>{job.match_score}% match</Text>
                            )}
                        </View>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Job Description</Text>
                    <View style={styles.descBox}>
                        <Text style={styles.descText}>{job.description_text || job.description || 'No description available.'}</Text>
                    </View>
                </View>

                {(job.matched_skills?.length || job.missing_skills?.length) ? (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Skills</Text>
                        <View style={styles.skillsRow}>
                            {(job.matched_skills || []).map((s: string, i: number) => (
                                <View key={i} style={[styles.skillChip, styles.skillMatched]}>
                                    <Text style={styles.skillMatchedText}>✓ {s}</Text>
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
            </ScrollView>

            {hasApply && (
                <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
                    <Pressable style={styles.applyBtn} onPress={handleApply}>
                        <Text style={styles.applyBtnText}>Apply Now</Text>
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
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    headerBtn: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
    headerTitle: {
        flex: 1,
        fontFamily: 'Syne_800ExtraBold',
        fontSize: 18,
        color: COLORS.textPrimary,
        textAlign: 'center',
    },
    scroll: { flex: 1 },
    scrollContent: { padding: 16 },
    card: {
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    companyRow: { flexDirection: 'row' },
    logoBox: {
        width: 56,
        height: 56,
        borderRadius: 12,
        backgroundColor: COLORS.border,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    logoText: { fontFamily: 'Syne_800ExtraBold', fontSize: 24, color: COLORS.textPrimary },
    companyInfo: { flex: 1 },
    title: { fontFamily: 'DMSans_500Medium', fontSize: 18, color: COLORS.textPrimary },
    company: { fontFamily: 'DMSans_400Regular', fontSize: 14, color: COLORS.textMuted, marginTop: 4 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    meta: { fontFamily: 'DMSans_400Regular', fontSize: 13, color: COLORS.textMuted },
    matchScore: { fontFamily: 'DMSans_500Medium', fontSize: 12, color: COLORS.accentRed, marginTop: 6 },
    section: { marginBottom: 16 },
    sectionTitle: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 14,
        color: COLORS.textMuted,
        marginBottom: 8,
        letterSpacing: 0.5,
    },
    descBox: {
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    descText: {
        fontFamily: 'DMSans_400Regular',
        fontSize: 15,
        lineHeight: 24,
        color: COLORS.textPrimary,
    },
    skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    skillChip: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 50,
    },
    skillMatched: { backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 1, borderColor: '#10B981' },
    skillMissing: { backgroundColor: COLORS.border },
    skillMatchedText: { fontFamily: 'DMSans_500Medium', fontSize: 13, color: '#10B981' },
    skillMissingText: { fontFamily: 'DMSans_400Regular', fontSize: 13, color: COLORS.textMuted },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 16,
        paddingTop: 16,
        backgroundColor: COLORS.background,
    },
    applyBtn: {
        backgroundColor: COLORS.accentRed,
        borderRadius: 50,
        paddingVertical: 16,
        minHeight: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    applyBtnText: { fontFamily: 'DMSans_500Medium', fontSize: 17, color: 'white' },
    errorText: { fontFamily: 'DMSans_400Regular', fontSize: 16, color: COLORS.textMuted, marginBottom: 16 },
    backBtn: { paddingVertical: 12, paddingHorizontal: 24, backgroundColor: COLORS.accentRed, borderRadius: 50 },
    backBtnText: { fontFamily: 'DMSans_500Medium', fontSize: 14, color: 'white' },
});
