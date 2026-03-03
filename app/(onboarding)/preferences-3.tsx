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

const DOMAIN_OPTIONS = [
    "Software Engineering",
    "Data / AI / ML",
    "Design / UI / UX",
    "Product Management",
    "DevOps / Cloud",
    "Marketing",
    "Customer Support",
    "Sales"
];

export default function Preferences3Screen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [selectedDomains, setSelectedDomains] = useState<string[]>(
        mockOnboardingState.domains?.length ? [...mockOnboardingState.domains] : []
    );
    const [customKeyword, setCustomKeyword] = useState('');
    const [customDomain, setCustomDomain] = useState('');
    const [keywords, setKeywords] = useState<string[]>(
        mockOnboardingState.keywords?.length ? [...mockOnboardingState.keywords] : []
    );

    const toggleDomain = (option: string) => {
        setSelectedDomains((prev) =>
            prev.includes(option)
                ? prev.filter((item) => item !== option)
                : [...prev, option]
        );
    };

    const handleAddKeyword = () => {
        const trimmed = customKeyword.trim();
        if (trimmed && !keywords.includes(trimmed)) {
            setKeywords([...keywords, trimmed]);
        }
        setCustomKeyword('');
    };

    const handleRemoveKeyword = (kw: string) => {
        setKeywords(keywords.filter(k => k !== kw));
    };

    const handleAddCustomDomain = () => {
        const trimmed = customDomain.trim();
        if (trimmed && !selectedDomains.includes(trimmed)) {
            setSelectedDomains((prev) => [...prev, trimmed]);
        }
        setCustomDomain('');
    };

    const handleRemoveDomain = (d: string) => {
        setSelectedDomains((prev) => prev.filter((x) => x !== d));
    };

    // Determine if valid to proceed
    const isNextDisabled = selectedDomains.length === 0 && keywords.length === 0;

    const handleFinish = () => {
        // Build final targeting object mapped perfectly to our semantic backend
        mockOnboardingState.domains = selectedDomains;
        mockOnboardingState.keywords = keywords;
        router.push('/(onboarding)/preferences-preview');
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
                    <View style={[styles.stepDot, styles.stepDotActive]} />
                    <View style={styles.stepDot} />
                    <View style={styles.stepDot} />
                </View>

                {/* Empty view for a balanced header layout matching the back arrow size */}
                <View style={{ width: 48 }} />
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} bounces={false}>
                {/* Section 1 */}
                <Text style={styles.sectionHeading}>What are your target domains?</Text>
                <Text style={[styles.subtitle, { marginBottom: 24, fontFamily: 'DMSans_400Regular', color: '#6B7280', fontSize: 15 }]}>
                    Select the overarching industries you want to work in.
                </Text>

                <View style={styles.chipGrid}>
                    {DOMAIN_OPTIONS.map((option) => {
                        const isSelected = selectedDomains.includes(option);
                        return (
                            <Pressable
                                key={option}
                                style={[styles.chip, isSelected && styles.chipSelected]}
                                onPress={() => toggleDomain(option)}
                            >
                                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                                    {isSelected ? "✓ " : ""}{option}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                <Text style={[styles.subtitle, { marginTop: 16, marginBottom: 12, fontSize: 14 }]}>Add your own field (e.g. Fintech, Healthcare IT)</Text>
                <View style={styles.keywordInputContainer}>
                    <TextInput
                        style={styles.keywordInput}
                        placeholder="Add custom field..."
                        placeholderTextColor="#9CA3AF"
                        value={customDomain}
                        onChangeText={setCustomDomain}
                        onSubmitEditing={handleAddCustomDomain}
                        returnKeyType="done"
                    />
                    <Pressable onPress={handleAddCustomDomain} style={styles.addKeywordButton}>
                        <Ionicons name="add" size={20} color="white" />
                    </Pressable>
                </View>
                <View style={[styles.chipGrid, { marginTop: 8 }]}>
                    {selectedDomains.filter((d) => !DOMAIN_OPTIONS.includes(d)).map((d) => (
                        <View key={d} style={styles.customDomainChip}>
                            <Text style={styles.customDomainChipText}>{d}</Text>
                            <Pressable onPress={() => handleRemoveDomain(d)} style={{ marginLeft: 6 }}>
                                <Ionicons name="close-circle" size={16} color="#6B7280" />
                            </Pressable>
                        </View>
                    ))}
                </View>

                {/* Section 2 */}
                <Text style={[styles.sectionHeading, { marginTop: 32, marginBottom: 12 }]}>Custom Keywords (Optional)</Text>
                <Text style={[styles.subtitle, { marginBottom: 16, fontFamily: 'DMSans_400Regular', color: '#6B7280', fontSize: 15 }]}>
                    Add specific job titles or technologies (e.g. "React Native")
                </Text>

                <View style={styles.keywordInputContainer}>
                    <TextInput
                        style={styles.keywordInput}
                        placeholder="Add a keyword..."
                        placeholderTextColor="#9CA3AF"
                        value={customKeyword}
                        onChangeText={setCustomKeyword}
                        onSubmitEditing={handleAddKeyword}
                        returnKeyType="done"
                    />
                    <Pressable onPress={handleAddKeyword} style={styles.addKeywordButton}>
                        <Ionicons name="add" size={20} color="white" />
                    </Pressable>
                </View>

                <View style={[styles.chipGrid, { marginTop: 12 }]}>
                    {keywords.map((kw) => (
                        <View key={kw} style={styles.keywordChip}>
                            <Text style={styles.keywordChipText}>{kw}</Text>
                            <Pressable onPress={() => handleRemoveKeyword(kw)} style={{ marginLeft: 6 }}>
                                <Ionicons name="close-circle" size={16} color="#6B7280" />
                            </Pressable>
                        </View>
                    ))}
                </View>

            </ScrollView>

            {/* Bottom */}
            <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
                <Pressable
                    style={[styles.nextButton, isNextDisabled && styles.nextButtonDisabled]}
                    disabled={isNextDisabled}
                    onPress={handleFinish}
                >
                    <Text style={styles.nextButtonText}>Next →</Text>
                </Pressable>
                <Text style={styles.stepLabel}>STEP 3 OF 5</Text>
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
    keywordInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        borderRadius: 16,
        paddingLeft: 16,
        paddingRight: 6,
        height: 54,
    },
    keywordInput: {
        flex: 1,
        fontFamily: 'DMSans_400Regular',
        fontSize: 15,
        color: '#111827',
    },
    addKeywordButton: {
        backgroundColor: '#FF4422',
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    keywordChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ECFDF5',
        borderWidth: 1,
        borderColor: '#10B981',
        borderRadius: 50,
        paddingVertical: 10,
        paddingHorizontal: 16,
    },
    keywordChipText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 14,
        color: '#10B981',
    },
    customDomainChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF8F7',
        borderWidth: 1,
        borderColor: '#FF4422',
        borderRadius: 50,
        paddingVertical: 10,
        paddingHorizontal: 16,
    },
    customDomainChipText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 14,
        color: '#FF4422',
    },
});
