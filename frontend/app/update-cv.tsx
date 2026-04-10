/**
 * update-cv.tsx ÔÇö Standalone CV upload modal (not part of onboarding flow)
 * Opened from Profile > My Resume > Update CV / Add CV
 * After upload completes, simply goes back to profile.
 */
import API_URL from '@/constants/api';
import { COLORS } from '@/constants/colors';
import { useAuthHeaders } from '@/features/auth/hooks/useAuthHeaders';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FEED_CACHE_KEY = 'swipturn_feed_cache';

export default function UpdateCvScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { getAuthHeaders } = useAuthHeaders();

    const [uploading, setUploading] = useState(false);
    const [uploaded, setUploaded] = useState(false);
    const [filename, setFilename] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [skills, setSkills] = useState<string[]>([]);

    const handleUpload = useCallback(async () => {
        setError(null);
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: [
                    'application/pdf',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                ],
                copyToCacheDirectory: true,
            });
            if (result.canceled) return;
            const file = result.assets[0];
            setFilename(file.name);
            setUploading(true);

            const formData = new FormData();
            formData.append('file', {
                uri: file.uri,
                name: file.name,
                type: file.mimeType ?? 'application/pdf',
            } as unknown as Blob);

            const headers = await getAuthHeaders();
            const controller = new AbortController();
            // CV upload involves LLM parsing (~10-15s) ÔÇö give it a generous timeout
            const timeoutId = setTimeout(() => controller.abort(), 90_000);
            let res: Response;
            try {
                res = await fetch(`${API_URL}/users/upload-cv`, {
                    method: 'POST',
                    headers: { ...headers },
                    body: formData,
                    signal: controller.signal,
                });
            } catch (fetchErr: any) {
                clearTimeout(timeoutId);
                if (fetchErr?.name === 'AbortError') {
                    setError('Upload timed out ÔÇö the server took too long. Please try again.');
                } else {
                    setError('Network error. Check your connection and try again.');
                }
                setUploading(false);
                return;
            }
            clearTimeout(timeoutId);

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(data.detail || data.error || `Upload failed (${res.status})`);
                setUploading(false);
                return;
            }

            // Backend returns { success: true, data: { skills: [...], parsed_experience_level, message } }
            const skills = data?.data?.skills;
            if (Array.isArray(skills)) {
                setSkills(skills.slice(0, 8));
            }
            // Invalidate swipe feed cache so recommendations reload with new CV signal
            try {
                await AsyncStorage.removeItem(FEED_CACHE_KEY);
            } catch {}
            setUploaded(true);
        } catch (err: any) {
            setError(err?.message || 'Something went wrong. Please try again.');
        } finally {
            setUploading(false);
        }
    }, [getAuthHeaders]);

    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
            <StatusBar style="dark" />

            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
                    <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
                </Pressable>
                <Text style={styles.headerTitle}>Update CV</Text>
                <View style={{ width: 40 }} />
            </View>

            <View style={styles.body}>
                {!uploaded ? (
                    <>
                        <View style={styles.illustrationBox}>
                            <Text style={styles.illustrationIcon}>­ƒôä</Text>
                        </View>

                        <Text style={styles.title}>Upload your CV</Text>
                        <Text style={styles.subtitle}>
                            PDF or Word document.{'\n'}We'll extract your skills automatically.
                        </Text>

                        {filename && !uploading && (
                            <View style={styles.fileRow}>
                                <Ionicons name="document-attach-outline" size={18} color={COLORS.textMuted} />
                                <Text style={styles.fileText} numberOfLines={1}>{filename}</Text>
                            </View>
                        )}

                        {error && <Text style={styles.errorText}>{error}</Text>}

                        <Pressable
                            style={[styles.uploadBtn, uploading && styles.uploadBtnDisabled]}
                            onPress={handleUpload}
                            disabled={uploading}
                        >
                            {uploading ? (
                                <ActivityIndicator size="small" color="white" />
                            ) : (
                                <>
                                    <Ionicons name="cloud-upload-outline" size={18} color="white" />
                                    <Text style={styles.uploadBtnText}>
                                        {filename ? 'Upload Different File' : 'Choose File'}
                                    </Text>
                                </>
                            )}
                        </Pressable>
                    </>
                ) : (
                    <>
                        <View style={styles.successCircle}>
                            <Ionicons name="checkmark-circle" size={64} color={COLORS.accentSuccess} />
                        </View>
                        <Text style={styles.title}>CV Updated!</Text>
                        <Text style={styles.subtitle}>
                            {filename ? `"${filename}" uploaded successfully.` : 'Your CV has been updated.'}
                        </Text>

                        {skills.length > 0 && (
                            <View style={styles.skillsBox}>
                                <Text style={styles.skillsLabel}>Skills extracted:</Text>
                                <View style={styles.skillsRow}>
                                    {skills.map((s, i) => (
                                        <View key={i} style={styles.skillChip}>
                                            <Text style={styles.skillChipText}>{s}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}

                        <Pressable style={styles.doneBtn} onPress={() => router.back()}>
                            <Text style={styles.doneBtnText}>Back to Profile</Text>
                        </Pressable>

                        <Pressable style={styles.uploadAnotherBtn} onPress={() => setUploaded(false)}>
                            <Text style={styles.uploadAnotherText}>Upload different file</Text>
                        </Pressable>
                    </>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    backBtn: { width: 40, height: 40, justifyContent: 'center' },
    headerTitle: {
        fontFamily: 'ClashDisplay', fontWeight: '700',
        fontSize: 20,
        color: COLORS.textPrimary,
    },
    body: {
        flex: 1,
        paddingHorizontal: 32,
        paddingTop: 40,
        alignItems: 'center',
    },
    illustrationBox: {
        width: 96, height: 96,
        borderRadius: 24,
        backgroundColor: COLORS.surface,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    illustrationIcon: { fontSize: 44 },
    successCircle: { marginBottom: 24 },
    title: {
        fontFamily: 'ClashDisplay', fontWeight: '700',
        fontSize: 26,
        color: COLORS.textPrimary,
        textAlign: 'center',
        marginBottom: 10,
    },
    subtitle: {
        fontFamily: 'Satoshi', fontWeight: '400',
        fontSize: 15,
        color: COLORS.textMuted,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 28,
    },
    fileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: COLORS.surface,
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 14,
        marginBottom: 20,
        alignSelf: 'stretch',
    },
    fileText: {
        fontFamily: 'Satoshi', fontWeight: '500',
        fontSize: 13,
        color: COLORS.textMuted,
        flex: 1,
    },
    errorText: {
        fontFamily: 'Satoshi', fontWeight: '400',
        fontSize: 13,
        color: '#EF4444',
        textAlign: 'center',
        marginBottom: 12,
    },
    uploadBtn: {
        backgroundColor: COLORS.accent,
        borderRadius: 50,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 16,
        paddingHorizontal: 32,
        alignSelf: 'stretch',
        minHeight: 56,
    },
    uploadBtnDisabled: { opacity: 0.6 },
    uploadBtnText: {
        fontFamily: 'Satoshi', fontWeight: '500',
        fontSize: 16,
        color: 'white',
    },
    skillsBox: {
        alignSelf: 'stretch',
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        padding: 16,
        marginBottom: 28,
    },
    skillsLabel: {
        fontFamily: 'Satoshi', fontWeight: '500',
        fontSize: 13,
        color: COLORS.textMuted,
        marginBottom: 10,
    },
    skillsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    skillChip: {
        backgroundColor: COLORS.surface2,
        borderRadius: 50,
        paddingVertical: 5,
        paddingHorizontal: 12,
    },
    skillChipText: {
        fontFamily: 'Satoshi', fontWeight: '400',
        fontSize: 13,
        color: COLORS.textPrimary,
    },
    doneBtn: {
        backgroundColor: COLORS.accent,
        borderRadius: 50,
        paddingVertical: 16,
        paddingHorizontal: 32,
        alignSelf: 'stretch',
        alignItems: 'center',
        minHeight: 56,
        marginBottom: 14,
    },
    doneBtnText: {
        fontFamily: 'Satoshi', fontWeight: '500',
        fontSize: 16,
        color: 'white',
    },
    uploadAnotherBtn: { paddingVertical: 8 },
    uploadAnotherText: {
        fontFamily: 'Satoshi', fontWeight: '400',
        fontSize: 14,
        color: COLORS.textMuted,
        textDecorationLine: 'underline',
    },
});
