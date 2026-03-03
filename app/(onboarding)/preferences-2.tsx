import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mockOnboardingState } from './store';

const SENIORITY_OPTIONS = [
    { id: 'student', label: 'Student / Internship / PFE 🎓' },
    { id: 'junior', label: 'Junior (0-2 years) 🌱' },
    { id: 'mid', label: 'Mid-Level (3-5 years) 🚀' },
    { id: 'senior_lead', label: 'Senior / Lead (5+ years) 👑' }
];

export default function Preferences2Screen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams();
    const geography = (params.geography as string) || mockOnboardingState.geography || '';

    const [selectedSeniority, setSelectedSeniority] = useState<string | null>(
        mockOnboardingState.seniority || null
    );

    // Filter options based on geography logic (The user wanted to handle Student globally as well, but we can customize the view)
    const displayOptions = SENIORITY_OPTIONS;

    const handleNext = () => {
        if (!selectedSeniority) return;

        mockOnboardingState.geography = geography;
        mockOnboardingState.seniority = selectedSeniority;

        router.push('/(onboarding)/preferences-3');
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
                    <View style={[styles.stepDot, styles.stepDotActive]} />
                    <View style={styles.stepDot} />
                    <View style={styles.stepDot} />
                    <View style={styles.stepDot} />
                </View>

                {/* Empty view for a balanced header layout matching the back arrow size */}
                <View style={{ width: 48 }} />
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} bounces={false}>
                <Text style={styles.sectionHeading}>What is your experience level?</Text>

                <Text style={[styles.subtitle, { marginBottom: 24, fontFamily: 'DMSans_400Regular', color: '#6B7280', fontSize: 15 }]}>
                    This helps us filter jobs that match your exact career stage.
                </Text>

                <View style={styles.chipGrid}>
                    {displayOptions.map((option) => {
                        const isSelected = selectedSeniority === option.id;
                        return (
                            <Pressable
                                key={option.id}
                                style={[styles.chip, isSelected && styles.chipSelected, { width: '100%', marginBottom: 12 }]}
                                onPress={() => setSelectedSeniority(option.id)}
                            >
                                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                                    {option.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
            </ScrollView>

            <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
                <Pressable
                    style={[styles.nextButton, !selectedSeniority && styles.nextButtonDisabled]}
                    disabled={!selectedSeniority}
                    onPress={handleNext}
                >
                    <Text style={styles.nextButtonText}>Next Step →</Text>
                </Pressable>
                <Text style={styles.stepLabel}>STEP 2 OF 5</Text>
            </View>
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
    stepsContainer: {
        flexDirection: 'row',
        gap: 8,
    },
    stepDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#E5E7EB',
    },
    stepDotActive: {
        backgroundColor: '#FF4422',
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
    sectionHeading: {
        fontFamily: 'Syne_800ExtraBold',
        fontSize: 24, // Slightly smaller than screen title
        color: '#111827',
        marginBottom: 16,
    },
    chipGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    chip: {
        borderWidth: 1,
        borderColor: '#E5E7EB',
        backgroundColor: '#FFFFFF',
        borderRadius: 50,
        paddingVertical: 12,
        paddingHorizontal: 18,
    },
    chipSelected: {
        backgroundColor: '#FF4422',
        borderColor: '#FF4422',
    },
    chipText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 14,
        color: '#111827',
    },
    chipTextSelected: {
        color: '#FFFFFF',
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
    nextButtonDisabled: {
        opacity: 0.35,
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
    subtitle: {
        fontFamily: 'DMSans_400Regular',
        fontSize: 15,
        color: '#6B7280',
        marginBottom: 32,
    },
});
