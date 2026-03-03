import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mockOnboardingState } from './store';

const GEO_LABELS: Record<string, string> = {
    morocco: 'Morocco Only',
    global: 'Global / Remote',
    both: 'Everywhere (Both)'
};

const SENIORITY_LABELS: Record<string, string> = {
    student: 'Student / Internship',
    junior: 'Junior',
    mid: 'Mid-Level',
    senior_lead: 'Senior / Lead'
};

export default function PreferencesPreviewScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [displayName, setDisplayName] = useState(mockOnboardingState.name || '');
    const geo = mockOnboardingState.geography || '';
    const seniority = mockOnboardingState.seniority || '';
    const domains = mockOnboardingState.domains || [];
    const keywords = mockOnboardingState.keywords || [];

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#111827" />
                </Pressable>
                <View style={styles.stepsContainer}>
                    <View style={styles.stepDot} />
                    <View style={styles.stepDot} />
                    <View style={styles.stepDot} />
                    <View style={[styles.stepDot, styles.stepDotActive]} />
                    <View style={styles.stepDot} />
                </View>
                <View style={{ width: 48 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
                <Text style={styles.headingLine1}>Review your</Text>
                <Text style={styles.headingLine2}>choices</Text>
                <Text style={styles.subtitle}>
                    Everything looks good? Tap Next to continue.
                </Text>

                <View style={styles.card}>
                    <View style={styles.cardIconRow}>
                        <View style={styles.cardIcon}>
                            <Ionicons name="person" size={20} color="#FF4422" />
                        </View>
                        <View style={styles.cardContent}>
                            <Text style={styles.cardLabel}>Your name (optional)</Text>
                            <TextInput
                                style={styles.nameInput}
                                placeholder="e.g. John"
                                placeholderTextColor="#9CA3AF"
                                value={displayName}
                                onChangeText={(t) => { setDisplayName(t); mockOnboardingState.name = t; }}
                            />
                        </View>
                    </View>
                </View>

                <View style={styles.card}>
                    <View style={styles.cardIconRow}>
                        <View style={styles.cardIcon}>
                            <Ionicons name="location" size={20} color="#FF4422" />
                        </View>
                        <View style={styles.cardContent}>
                            <Text style={styles.cardLabel}>Location</Text>
                            <Text style={styles.cardValue}>{GEO_LABELS[geo] || geo}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.card}>
                    <View style={styles.cardIconRow}>
                        <View style={styles.cardIcon}>
                            <Ionicons name="trending-up" size={20} color="#FF4422" />
                        </View>
                        <View style={styles.cardContent}>
                            <Text style={styles.cardLabel}>Experience</Text>
                            <Text style={styles.cardValue}>{SENIORITY_LABELS[seniority] || seniority}</Text>
                        </View>
                    </View>
                </View>

                {domains.length > 0 && (
                    <View style={styles.card}>
                        <View style={styles.cardIconRow}>
                            <View style={styles.cardIcon}>
                                <Ionicons name="briefcase" size={20} color="#FF4422" />
                            </View>
                            <View style={styles.cardContent}>
                                <Text style={styles.cardLabel}>Domains</Text>
                                <View style={styles.chipRow}>
                                    {domains.map((d) => (
                                        <View key={d} style={styles.previewChip}>
                                            <Text style={styles.previewChipText}>{d}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        </View>
                    </View>
                )}

                {keywords.length > 0 && (
                    <View style={styles.card}>
                        <View style={styles.cardIconRow}>
                            <View style={styles.cardIcon}>
                                <Ionicons name="key" size={20} color="#FF4422" />
                            </View>
                            <View style={styles.cardContent}>
                                <Text style={styles.cardLabel}>Keywords</Text>
                                <View style={styles.chipRow}>
                                    {keywords.map((k) => (
                                        <View key={k} style={styles.keywordChip}>
                                            <Text style={styles.keywordChipText}>{k}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        </View>
                    </View>
                )}
            </ScrollView>

            <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
                <Pressable style={styles.editButton} onPress={() => router.back()}>
                    <Ionicons name="create-outline" size={18} color="#6B7280" />
                    <Text style={styles.editButtonText}>Edit</Text>
                </Pressable>
                <Pressable
                    style={styles.nextButton}
                    onPress={() => router.push('/(onboarding)/cv-upload')}
                >
                    <Text style={styles.nextButtonText}>Next Step →</Text>
                </Pressable>
                <Text style={styles.stepLabel}>STEP 4 OF 5</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFFFFF' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 60,
        paddingHorizontal: 24,
        marginBottom: 24,
    },
    backButton: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
    stepsContainer: { flexDirection: 'row', gap: 8 },
    stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E5E7EB' },
    stepDotActive: { backgroundColor: '#FF4422' },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 24 },
    headingLine1: {
        fontFamily: 'Syne_800ExtraBold',
        fontSize: 34,
        lineHeight: 42,
        color: '#111827',
    },
    headingLine2: {
        fontFamily: 'Syne_800ExtraBold',
        fontSize: 34,
        lineHeight: 42,
        color: '#FF4422',
        marginBottom: 16,
    },
    subtitle: {
        fontFamily: 'DMSans_400Regular',
        fontSize: 15,
        color: '#6B7280',
        marginBottom: 28,
    },
    card: {
        backgroundColor: '#FFF8F7',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 68, 34, 0.15)',
        padding: 16,
        marginBottom: 12,
    },
    cardIconRow: { flexDirection: 'row', alignItems: 'center' },
    cardIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255, 68, 34, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    cardContent: { flex: 1 },
    cardLabel: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 12,
        color: '#9CA3AF',
        marginBottom: 4,
    },
    cardValue: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 16,
        color: '#111827',
    },
    nameInput: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 16,
        color: '#111827',
        paddingVertical: 8,
        paddingHorizontal: 0,
        marginTop: 4,
        minHeight: 44,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    previewChip: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#FF4422',
        borderRadius: 50,
        paddingVertical: 6,
        paddingHorizontal: 12,
    },
    previewChipText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 13,
        color: '#FF4422',
    },
    keywordChip: {
        backgroundColor: '#ECFDF5',
        borderWidth: 1,
        borderColor: '#10B981',
        borderRadius: 50,
        paddingVertical: 6,
        paddingHorizontal: 12,
    },
    keywordChipText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 13,
        color: '#10B981',
    },
    bottomArea: { paddingHorizontal: 24, paddingBottom: 40, paddingTop: 16 },
    editButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        marginBottom: 12,
    },
    editButtonText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 15,
        color: '#6B7280',
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
    stepLabel: {
        fontFamily: 'DMSans_400Regular',
        fontSize: 12,
        color: '#9CA3AF',
        textAlign: 'center',
        letterSpacing: 1.2,
        marginTop: 16,
    },
});
