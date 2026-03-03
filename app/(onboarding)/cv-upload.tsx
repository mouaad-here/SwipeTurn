import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthHeaders } from '@/hooks/useAuthHeaders';
import * as DocumentPicker from 'expo-document-picker';
import { mockOnboardingState } from './store';

const MOCK_SKILLS = [
    "React Native",
    "TypeScript",
    "Node.js",
    "UX Design",
    "Figma"
];

const EXP_LEVEL_OPTIONS = [
    { id: 'student', label: 'Student / Internship' },
    { id: 'junior', label: 'Junior' },
    { id: 'mid', label: 'Mid-Level' },
    { id: 'senior', label: 'Senior' },
    { id: 'lead', label: 'Lead' },
];

export default function CvUploadScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { getAuthHeaders } = useAuthHeaders();
    const [uploadState, setUploadState] = useState<'idle' | 'loading' | 'success'>('idle');
    const [fileName, setFileName] = useState<string>('');
    const [skills, setSkills] = useState<string[]>(MOCK_SKILLS);
    const [experienceLevel, setExperienceLevel] = useState<string>('mid');

    const [isAddingSkill, setIsAddingSkill] = useState(false);
    const [newSkillText, setNewSkillText] = useState('');
    const [skipLoading, setSkipLoading] = useState(false);

    const handleRemoveSkill = (skillToRemove: string) => {
        setSkills(prev => prev.filter(skill => skill !== skillToRemove));
    }

    const handleSubmitNewSkill = () => {
        const trimmed = newSkillText.trim();
        if (trimmed.length > 0 && !skills.includes(trimmed)) {
            setSkills(prev => [...prev, trimmed]);
        }
        setNewSkillText('');
        setIsAddingSkill(false);
    }

    const handleSkip = () => {
        if (skipLoading) return;
        setSkipLoading(true);
        // Navigate immediately so user isn't stuck waiting for API
        router.replace('/(tabs)/swipe');
        setSkipLoading(false);

        // Sync preferences to backend in background (no blocking)
        (async () => {
            try {
                const headers = await getAuthHeaders();
                const { API_URL } = await import('@/constants/api');
                const ctrl = new AbortController();
                const timeout = setTimeout(() => ctrl.abort(), 8000);
                const res = await fetch(`${API_URL}/users/preferences`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        ...headers,
                    },
                    body: JSON.stringify({
                        preferences: mockOnboardingState,
                        target_locations: mockOnboardingState.geography ? [mockOnboardingState.geography] : [],
                        experience_level: mockOnboardingState.seniority || undefined,
                        fields: mockOnboardingState.domains?.length ? mockOnboardingState.domains : undefined,
                        name: mockOnboardingState.name?.trim() || undefined,
                    }),
                    signal: ctrl.signal,
                });
                clearTimeout(timeout);
                if (!res.ok) {
                    await res.text();
                }
            } catch {
                // Sync failed; user already navigated to feed
            }
        })();
    };

    const handleUpload = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: 'application/pdf',
                copyToCacheDirectory: true,
            });

            if (result.canceled) return;

            const file = result.assets[0];
            const MAX_SIZE = 2.5 * 1024 * 1024; // 2.5 MB max limit
            if (file.size && file.size > MAX_SIZE) {
                alert('File is too large. Please upload a PDF under 2.5MB to ensure fast processing.');
                return;
            }
            // On web, FormData must receive the actual File object; on native we use { uri, name, type }
            const fileForForm =
                Platform.OS === 'web' && 'file' in file && file.file
                    ? file.file
                    : { uri: file.uri, name: file.name, type: file.mimeType || 'application/pdf' };

            setUploadState('loading');
            setFileName(file.name);

            const headers = await getAuthHeaders();

            const formData = new FormData();
            formData.append('file', fileForForm as any);
            formData.append('preferences', JSON.stringify(mockOnboardingState));

            const { API_URL } = await import('@/constants/api');
            const uploadUrl = `${API_URL}/users/upload-cv`;

            const ctrl = new AbortController();
            const timeout = setTimeout(() => ctrl.abort(), 120000); // 2 min for CV parse + embedding
            const response = await fetch(uploadUrl, {
                method: 'POST',
                headers: { ...headers },
                body: formData,
                signal: ctrl.signal,
            });
            clearTimeout(timeout);

            if (!response.ok) {
                const text = await response.text();
                let msg = text;
                try {
                    const j = JSON.parse(text);
                    msg = typeof j?.detail === 'string' ? j.detail : Array.isArray(j?.detail) ? j.detail[0] : text;
                } catch { /* use text */ }
                throw new Error(msg.slice(0, 200));
            }

            const data = await response.json();
            const extractedSkills = data?.data?.skills;
            if (extractedSkills && Array.isArray(extractedSkills) && extractedSkills.length > 0) {
                setSkills(extractedSkills);
            }
            const detectedLevel = (data?.data?.experience_level || 'mid').toLowerCase();
            const normalized = ['student','junior','mid','senior','lead'].includes(detectedLevel)
                ? detectedLevel
                : detectedLevel.includes('senior') || detectedLevel.includes('lead') ? 'senior' : 'mid';
            setExperienceLevel(normalized);

            setUploadState('success');
            // Auto-navigate after a brief delay so user sees the success state
            setTimeout(() => {
                router.replace('/(tabs)/swipe');
            }, 1500);
        } catch (err: any) {
            console.error('CV upload error:', err);
            const msg = err?.name === 'AbortError'
                ? 'Request timed out. CV parsing can take 1–2 minutes—please try again and wait.'
                : err?.message || 'Failed to upload CV. Please try again.';
            alert(msg);
            setUploadState('idle');
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#111827" />
                </Pressable>
                <View style={styles.stepsContainer}>
                    <View style={styles.stepDot} />
                    <View style={styles.stepDot} />
                    <View style={styles.stepDot} />
                    <View style={styles.stepDot} />
                    <View style={[styles.stepDot, styles.stepDotActive]} />
                </View>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
                <Text style={styles.headingLine1}>Upload your</Text>
                <Text style={styles.headingLine2}>CV</Text>
                {uploadState !== 'success' && (
                    <TouchableOpacity
                        style={styles.uploadZone}
                        activeOpacity={0.7}
                        onPress={handleUpload}
                        disabled={uploadState === 'loading'}
                    >
                        {uploadState === 'idle' ? (
                            <>
                                <View style={styles.iconCircle}>
                                    <Text style={styles.uploadArrow}>↑</Text>
                                </View>
                                <Text style={styles.uploadTitle}>Tap to upload your CV</Text>
                                <Text style={styles.uploadSubtitle}>PDF or DOCX supported (Max 2.5MB)</Text>
                                <View style={styles.selectFileButton}>
                                    <Text style={styles.selectFileButtonText}>Select File</Text>
                                </View>
                            </>
                        ) : (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#FF4422" />
                                <Text style={styles.uploadTitle}>Reading your CV...</Text>
                                <Text style={styles.uploadSubtitle} numberOfLines={1} ellipsizeMode="middle">{fileName}</Text>
                                <Text style={styles.loadingHint}>This may take 1–2 minutes. Please wait.</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                )}

                {uploadState !== 'success' && (
                    <Pressable
                        style={[styles.skipButton, skipLoading && styles.skipButtonDisabled]}
                        onPress={handleSkip}
                        disabled={skipLoading}
                        hitSlop={{ top: 12, bottom: 12, left: 24, right: 24 }}
                    >
                        {skipLoading ? (
                            <ActivityIndicator size="small" color="#6B7280" />
                        ) : (
                            <>
                                <Ionicons name="arrow-forward" size={18} color="#6B7280" />
                                <Text style={styles.skipButtonText}>Skip for now</Text>
                            </>
                        )}
                    </Pressable>
                )}

                {uploadState === 'success' && (
                    <View style={styles.successContainer}>
                        <View style={styles.uploadZoneSuccess}>
                            <Ionicons name="document-text" size={32} color="#10B981" />
                            <View style={{ marginLeft: 16, flex: 1 }}>
                                <Text style={[styles.uploadTitle, { fontSize: 16, textAlign: 'left' }]} numberOfLines={1} ellipsizeMode="middle">{fileName}</Text>
                                <Text style={[styles.uploadSubtitle, { textAlign: 'left' }]}>Successfully uploaded</Text>
                            </View>
                        </View>

                        <View style={styles.progressBarContainer}>
                            <View style={styles.progressBarFill} />
                        </View>

                        <View style={styles.skillsHeaderRow}>
                            <Text style={styles.skillsHeader}>Skills we found</Text>
                            <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                        </View>

                        <View style={styles.experienceSection}>
                            <Text style={styles.experienceLabel}>Experience level (we detected: {experienceLevel})</Text>
                            <View style={styles.experienceRow}>
                                {EXP_LEVEL_OPTIONS.map((opt) => (
                                    <Pressable
                                        key={opt.id}
                                        style={[styles.experienceChip, experienceLevel === opt.id && styles.experienceChipSelected]}
                                        onPress={() => setExperienceLevel(opt.id)}
                                    >
                                        <Text style={[styles.experienceChipText, experienceLevel === opt.id && styles.experienceChipTextSelected]}>
                                            {opt.label}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>

                        <View style={styles.skillsGrid}>
                            {skills.map((skill) => (
                                <View key={skill} style={styles.skillChip}>
                                    <Text style={styles.skillChipText}>{skill}</Text>
                                    <Pressable onPress={() => handleRemoveSkill(skill)}>
                                        <Ionicons name="close" size={16} color="#10B981" style={{ marginLeft: 4 }} />
                                    </Pressable>
                                </View>
                            ))}
                            {isAddingSkill ? (
                                <View style={styles.addMoreInputContainer}>
                                    <TextInput
                                        style={styles.addMoreInput}
                                        value={newSkillText}
                                        onChangeText={setNewSkillText}
                                        placeholder="Type skill..."
                                        placeholderTextColor="#9CA3AF"
                                        autoFocus
                                        onSubmitEditing={handleSubmitNewSkill}
                                        onBlur={() => setIsAddingSkill(false)}
                                    />
                                </View>
                            ) : (
                                <Pressable
                                    style={styles.addMoreChip}
                                    onPress={() => setIsAddingSkill(true)}
                                >
                                    <Text style={styles.addMoreText}>+ Add more</Text>
                                </Pressable>
                            )}
                        </View>
                    </View>
                )}

            </ScrollView>

            {uploadState === 'success' && (
                <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
                    <Pressable
                        style={styles.nextButton}
                        onPress={async () => {
                            try {
                                const headers = await getAuthHeaders();
                                const { API_URL } = await import('@/constants/api');
                                await fetch(`${API_URL}/users/preferences`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json', ...headers },
                                    body: JSON.stringify({ experience_level: experienceLevel }),
                                });
                            } catch (_) {}
                            router.replace('/(tabs)/swipe');
                        }}
                    >
                        <Text style={styles.nextButtonText}>Looks good, continue →</Text>
                    </Pressable>
                    <Text style={styles.stepLabel}>STEP 5 OF 5</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 60,
        paddingHorizontal: 24,
        marginBottom: 24,
    },
    backButton: {
        width: 48,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headingLine1: {
        fontFamily: 'Syne_800ExtraBold',
        fontSize: 34,
        lineHeight: 42,
        color: '#111827',
        marginBottom: 0,
    },
    headingLine2: {
        fontFamily: 'Syne_800ExtraBold',
        fontSize: 34,
        lineHeight: 42,
        color: '#FF4422',
        marginBottom: 24,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
    uploadZone: {
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: 'rgba(255, 68, 34, 0.4)',
        borderRadius: 20,
        paddingVertical: 44,
        alignItems: 'center',
        backgroundColor: '#FFF8F7',
        gap: 12,
    },
    uploadZoneSuccess: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
    },
    iconCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: 'rgba(255, 68, 34, 0.10)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    uploadArrow: {
        fontFamily: 'Syne_800ExtraBold',
        fontSize: 28,
        color: '#FF4422',
    },
    uploadTitle: {
        fontFamily: 'Syne_800ExtraBold',
        fontSize: 18,
        color: '#111827',
        textAlign: 'center',
    },
    uploadSubtitle: {
        fontFamily: 'DMSans_400Regular',
        fontSize: 13,
        color: '#6B7280',
        textAlign: 'center',
        marginTop: -4,
    },
    selectFileButton: {
        backgroundColor: '#111827',
        borderRadius: 50,
        paddingHorizontal: 32,
        paddingVertical: 12,
        marginTop: 8,
    },
    selectFileButtonText: {
        color: 'white',
        fontFamily: 'DMSans_500Medium',
        fontSize: 14,
    },
    loadingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingVertical: 20,
    },
    loadingHint: {
        fontFamily: 'DMSans_400Regular',
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 4,
    },
    successContainer: {
        marginTop: 8,
    },
    progressBarContainer: {
        height: 3,
        backgroundColor: '#E5E7EB',
        borderRadius: 2,
        marginVertical: 20,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        width: '100%', // Simulating completion
        backgroundColor: '#10B981',
    },
    experienceSection: { marginBottom: 20 },
    experienceLabel: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 14,
        color: '#6B7280',
        marginBottom: 10,
    },
    experienceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    experienceChip: {
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 50,
        paddingVertical: 10,
        paddingHorizontal: 16,
    },
    experienceChipSelected: {
        backgroundColor: '#FF4422',
        borderColor: '#FF4422',
    },
    experienceChipText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 13,
        color: '#6B7280',
    },
    experienceChipTextSelected: { color: 'white' },
    skillsHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 8,
    },
    skillsHeader: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 16,
        color: '#10B981',
    },
    skillsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    skillChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ECFDF5', // Extremely soft green
        borderWidth: 1,
        borderColor: '#10B981',
        borderRadius: 50,
        paddingVertical: 10,
        paddingHorizontal: 16,
    },
    skillChipText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 14,
        color: '#10B981',
    },
    addMoreChip: {
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: '#9CA3AF',
        borderRadius: 50,
        paddingVertical: 10,
        paddingHorizontal: 16,
        justifyContent: 'center',
    },
    addMoreText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 14,
        color: '#9CA3AF',
    },
    addMoreInputContainer: {
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: '#111827',
        borderRadius: 50,
        paddingHorizontal: 16,
        justifyContent: 'center',
        minWidth: 100,
        height: 42,
    },
    addMoreInput: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 14,
        color: '#111827',
        padding: 0,
        margin: 0,
    },
    bottomArea: {
        paddingHorizontal: 24,
        paddingBottom: 40,
        paddingTop: 16,
    },
    nextButton: {
        backgroundColor: '#FF4422',
        borderRadius: 50,
        paddingVertical: 18,
        minHeight: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    nextButtonText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 17,
        color: 'white',
    },
    skipButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 16,
        minHeight: 48,
        marginTop: 16,
    },
    skipButtonDisabled: {
        opacity: 0.6,
    },
    skipButtonText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 15,
        color: '#6B7280',
    },
    stepsContainer: { flexDirection: 'row', gap: 8 },
    stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E5E7EB' },
    stepDotActive: { backgroundColor: '#FF4422' },
    stepLabel: {
        fontFamily: 'DMSans_400Regular',
        fontSize: 12,
        color: '#9CA3AF',
        textAlign: 'center',
        letterSpacing: 1.2,
        marginTop: 16,
    },
});
