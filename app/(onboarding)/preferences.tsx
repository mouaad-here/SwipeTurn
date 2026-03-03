import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mockOnboardingState } from './store';
import { useAuthHeaders } from '@/hooks/useAuthHeaders';

const PREFERENCE_OPTIONS = [
    { id: 'morocco', label: 'Morocco Only 🇲🇦' },
    { id: 'global', label: 'Global / Remote 🌍' },
    { id: 'both', label: 'Everywhere (Both)' }
];

export default function PreferencesScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { getAuthHeaders } = useAuthHeaders();
    const [selectedOption, setSelectedOption] = useState<string | null>(
        mockOnboardingState.geography || null
    );
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleNext = async () => {
        if (!selectedOption || isSubmitting) return;
        setIsSubmitting(true);
        mockOnboardingState.geography = selectedOption;
        try {
            const headers = await getAuthHeaders();
            const { API_URL } = await import('@/constants/api');
            await fetch(`${API_URL}/users/preferences`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...headers },
                body: JSON.stringify({ preferences: { ...mockOnboardingState, geography: selectedOption } }),
            });
        } catch (_) {}
        router.push({
            pathname: '/(onboarding)/preferences-2',
            params: { geography: selectedOption }
        });
        setIsSubmitting(false);
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
                    <View style={[styles.stepDot, styles.stepDotActive]} />
                    <View style={styles.stepDot} />
                    <View style={styles.stepDot} />
                    <View style={styles.stepDot} />
                    <View style={styles.stepDot} />
                </View>

                {/* Empty view for a balanced header layout matching the back arrow size */}
                <View style={{ width: 48 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
                <Text style={styles.headingLine1}>Where do you</Text>
                <Text style={styles.headingLine2}>want to work?</Text>

                <Text style={styles.subtitle}>
                    Select your target location to help us find the perfect match.
                </Text>

                <View style={styles.chipGrid}>
                    {PREFERENCE_OPTIONS.map((option) => {
                        const isSelected = selectedOption === option.id;
                        return (
                            <Pressable
                                key={option.id}
                                style={[styles.chip, isSelected && styles.chipSelected, { width: '100%', marginBottom: 12 }]}
                                onPress={() => setSelectedOption(option.id)}
                            >
                                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                                    {option.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
            </ScrollView>

            {/* Bottom */}
            <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
                <Pressable
                    style={[styles.nextButton, (!selectedOption || isSubmitting) && styles.nextButtonDisabled]}
                    disabled={!selectedOption || isSubmitting}
                    onPress={handleNext}
                >
                    {isSubmitting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                        <Text style={styles.nextButtonText}>Next Step →</Text>
                    )}
                </Pressable>
                <Text style={styles.stepLabel}>STEP 1 OF 5</Text>
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
        marginBottom: 32,
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
});
