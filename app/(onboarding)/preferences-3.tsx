import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { mockOnboardingState } from './store';

const EXPERIENCE_OPTIONS = [
    { label: "Student · 0 yr", icon: "school-outline" as const },
    { label: "Junior · 1-2 yr", icon: "briefcase-outline" as const },
    { label: "Mid · 3-5 yr", icon: "rocket-outline" as const }
];

const LANGUAGE_OPTIONS = [
    "English",
    "French",
    "Arabic",
    "Spanish",
    "German",
    "Dutch"
];

const VISA_OPTIONS = [
    "No visa needed (Remote)",
    "Moroccan — need visa",
    "EU Resident",
    "EU Citizen"
];

export default function Preferences3Screen() {
    const router = useRouter();
    const [selectedExperience, setSelectedExperience] = useState<string>('');
    const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
    const [selectedVisa, setSelectedVisa] = useState<string>('');

    // Conditionally show visa section if user picked EU/UK locations in Step 2.
    const [showVisaOptions, setShowVisaOptions] = useState(false);

    useEffect(() => {
        // Check if the user selected any EU/UK locations in the mock store
        const euUkLocations = ["France", "Germany", "Netherlands", "UK", "Anywhere"];
        const needsVisaSection = mockOnboardingState.selectedLocations.some(
            loc => euUkLocations.includes(loc)
        );
        setShowVisaOptions(needsVisaSection);
    }, []);

    const toggleLanguage = (option: string) => {
        setSelectedLanguages((prev) =>
            prev.includes(option)
                ? prev.filter((item) => item !== option)
                : [...prev, option]
        );
    };

    // Determine if valid to proceed
    const isNextDisabled =
        !selectedExperience ||
        selectedLanguages.length === 0 ||
        (showVisaOptions && !selectedVisa);

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#111827" />
                </Pressable>

                <View style={styles.stepsContainer}>
                    <View style={styles.stepDot} />
                    <View style={styles.stepDot} />
                    <View style={[styles.stepDot, styles.stepDotActive]} />
                </View>

                {/* Empty view for a balanced header layout matching the back arrow size */}
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} bounces={false}>
                {/* Section 1 */}
                <Text style={styles.sectionHeading}>What's your experience level?</Text>
                <View style={styles.experienceGrid}>
                    {EXPERIENCE_OPTIONS.map((option) => {
                        const isSelected = selectedExperience === option.label;
                        return (
                            <Pressable
                                key={option.label}
                                style={[styles.experienceChip, isSelected && styles.experienceChipSelected]}
                                onPress={() => setSelectedExperience(option.label)}
                            >
                                <Ionicons
                                    name={option.icon}
                                    size={24}
                                    color={isSelected ? '#FFFFFF' : '#6B7280'}
                                    style={{ marginBottom: 4 }}
                                />
                                <Text style={[styles.experienceChipText, isSelected && { color: '#FFFFFF' }]}>
                                    {option.label.split(' · ')[0]}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                {/* Section 2 */}
                <Text style={[styles.sectionHeading, { marginTop: 28 }]}>
                    Languages you speak
                </Text>
                <View style={styles.chipGrid}>
                    {LANGUAGE_OPTIONS.map((option) => {
                        const isSelected = selectedLanguages.includes(option);
                        return (
                            <Pressable
                                key={option}
                                style={[styles.chip, isSelected && styles.chipSelected]}
                                onPress={() => toggleLanguage(option)}
                            >
                                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                                    {isSelected ? "✓ " : ""}{option}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                {/* Section 3 (Conditional) */}
                {showVisaOptions && (
                    <>
                        <Text style={[styles.sectionHeading, { marginTop: 28 }]}>
                            Work authorization
                        </Text>
                        <View style={styles.chipGrid}>
                            {VISA_OPTIONS.map((option) => {
                                const isSelected = selectedVisa === option;
                                return (
                                    <Pressable
                                        key={option}
                                        style={[styles.chip, isSelected && styles.chipSelected]}
                                        onPress={() => setSelectedVisa(option)}
                                    >
                                        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                                            {isSelected ? "✓ " : ""}{option}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </>
                )}
            </ScrollView>

            {/* Bottom */}
            <View style={styles.bottomArea}>
                <Pressable
                    style={[styles.nextButton, isNextDisabled && styles.nextButtonDisabled]}
                    disabled={isNextDisabled}
                    onPress={() => router.replace('/(onboarding)/cv-upload')}
                >
                    <Text style={styles.nextButtonText}>Finish Setup →</Text>
                </Pressable>
                <Text style={styles.stepLabel}>STEP 3 OF 3</Text>
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
        width: 40,
        height: 40,
        justifyContent: 'center',
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
        fontSize: 24,
        color: '#111827',
        marginBottom: 16,
    },
    experienceGrid: {
        flexDirection: 'row',
        backgroundColor: '#F3F4F6',
        borderRadius: 16,
        padding: 6,
    },
    experienceChip: {
        flex: 1,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    experienceChipSelected: {
        backgroundColor: '#FF4422',
    },
    experienceChipText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
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
