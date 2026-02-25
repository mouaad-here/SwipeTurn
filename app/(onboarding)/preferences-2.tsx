import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { mockOnboardingState } from './store';

const FIELD_OPTIONS = [
    "CS / Engineering",
    "AI / ML",
    "Design",
    "Data Science",
    "DevOps",
    "Mobile",
    "Product",
    "Cybersecurity"
];

const LOCATION_OPTIONS = [
    "Remote Only",
    "Morocco",
    "France",
    "Germany",
    "Netherlands",
    "UK",
    "UAE",
    "Anywhere"
];

export default function Preferences2Screen() {
    const router = useRouter();
    const [selectedFields, setSelectedFields] = useState<string[]>([]);
    const [selectedLocations, setSelectedLocations] = useState<string[]>([]);

    const toggleField = (option: string) => {
        setSelectedFields((prev) =>
            prev.includes(option)
                ? prev.filter((item) => item !== option)
                : [...prev, option]
        );
    };

    const toggleLocation = (option: string) => {
        setSelectedLocations((prev) =>
            prev.includes(option)
                ? prev.filter((item) => item !== option)
                : [...prev, option]
        );
    };

    const isNextDisabled = selectedFields.length === 0 || selectedLocations.length === 0;

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
                    <View style={[styles.stepDot, styles.stepDotActive]} />
                    <View style={styles.stepDot} />
                </View>

                {/* Empty view for a balanced header layout matching the back arrow size */}
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
                {/* Section 1 */}
                <Text style={styles.sectionHeading}>What's your field?</Text>
                <View style={styles.chipGrid}>
                    {FIELD_OPTIONS.map((option) => {
                        const isSelected = selectedFields.includes(option);
                        return (
                            <Pressable
                                key={option}
                                style={[styles.chip, isSelected && styles.chipSelected]}
                                onPress={() => toggleField(option)}
                            >
                                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                                    {isSelected ? "✓ " : ""}{option}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                {/* Section 2 */}
                <Text style={[styles.sectionHeading, { marginTop: 28 }]}>
                    Where do you want to work?
                </Text>
                <View style={styles.chipGrid}>
                    {LOCATION_OPTIONS.map((option) => {
                        const isSelected = selectedLocations.includes(option);
                        return (
                            <Pressable
                                key={option}
                                style={[styles.chip, isSelected && styles.chipSelected]}
                                onPress={() => toggleLocation(option)}
                            >
                                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                                    {isSelected ? "✓ " : ""}{option}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
            </ScrollView>

            <View style={styles.bottomArea}>
                <Pressable
                    style={[styles.nextButton, isNextDisabled && styles.nextButtonDisabled]}
                    disabled={isNextDisabled}
                    onPress={() => {
                        mockOnboardingState.selectedLocations = [...selectedLocations];
                        router.push('/(onboarding)/preferences-3');
                    }}
                >
                    <Text style={styles.nextButtonText}>Next Step →</Text>
                </Pressable>
                <Text style={styles.stepLabel}>STEP 2 OF 3</Text>
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
