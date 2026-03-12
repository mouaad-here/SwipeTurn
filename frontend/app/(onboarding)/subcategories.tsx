import { OnboardingStepIndicator } from '@/components/onboarding-step-indicator';
import { COLORS } from '@/constants/colors';
import { getDraft, saveDraftStep } from '@/lib/onboarding-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CATEGORIES } from './domains';

export default function SubcategoriesScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [selectedSubs, setSelectedSubs] = useState<string[]>([]);
    const [relevantCategories, setRelevantCategories] = useState<typeof CATEGORIES>([]);

    const loadDraft = useCallback(async () => {
        const draft = await getDraft();
        // Load previously selected subcategories
        if (draft.subcategories?.length) setSelectedSubs(draft.subcategories);

        // Filter categories to only those the user selected on the previous screen
        if (draft.domains?.length) {
            const filtered = CATEGORIES.filter(
                c => draft.domains!.includes(c.label) && c.subcategories.length > 0
            );
            setRelevantCategories(filtered);
        } else {
            // Fallback: show all categories with subcategories
            setRelevantCategories(CATEGORIES.filter(c => c.subcategories.length > 0));
        }
    }, []);

    useEffect(() => {
        loadDraft();
    }, [loadDraft]);

    const toggleSub = (sub: string) => {
        setSelectedSubs((prev) =>
            prev.includes(sub) ? prev.filter((s) => s !== sub) : [...prev, sub]
        );
    };

    const handleSkip = () => {
        router.push('/(onboarding)/skills');
    };

    const handleContinue = async () => {
        await saveDraftStep({ subcategories: selectedSubs });
        router.push('/(onboarding)/skills');
    };

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
                </Pressable>
                <OnboardingStepIndicator step={4} total={6} />
                <Pressable onPress={handleSkip} style={styles.skipButton}>
                    <Text style={styles.skipText}>Skip</Text>
                </Pressable>
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                bounces={false}
                showsVerticalScrollIndicator={false}
            >
                <Text style={styles.heading}>Choose specializations</Text>
                <Text style={styles.subtitle}>
                    Select the specific areas you are focused on within your chosen domains.
                </Text>

                {relevantCategories.map((cat) => (
                    <View key={cat.id} style={styles.domainGroup}>
                        <Text style={styles.domainLabel}>{cat.label}</Text>
                        <View style={styles.subChipRow}>
                            {cat.subcategories.map((sub) => {
                                const isSelected = selectedSubs.includes(sub);
                                return (
                                    <Pressable
                                        key={sub}
                                        style={[styles.subChip, isSelected && styles.subChipSelected]}
                                        onPress={() => toggleSub(sub)}
                                    >
                                        <Text
                                            style={[
                                                styles.subChipLabel,
                                                isSelected && styles.subChipLabelSelected,
                                            ]}
                                        >
                                            {sub}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>
                ))}
            </ScrollView>

            <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
                <Pressable style={styles.continueButton} onPress={handleContinue}>
                    <Text style={styles.continueText}>Continue</Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.surface,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        marginBottom: 24,
    },
    backButton: {
        width: 48,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    skipButton: {
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    skipText: {
        fontFamily: 'Satoshi-Medium',
        fontSize: 15,
        color: COLORS.textMuted,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
    heading: {
        fontFamily: 'ClashDisplay-Bold',
        fontSize: 28,
        lineHeight: 36,
        color: COLORS.textPrimary,
        marginBottom: 12,
    },
    subtitle: {
        fontFamily: 'Satoshi-Regular',
        fontSize: 15,
        color: COLORS.textMuted,
        marginBottom: 32,
    },
    domainGroup: {
        marginBottom: 28,
    },
    domainLabel: {
        fontFamily: 'ClashDisplay-Bold',
        fontSize: 16,
        color: COLORS.textPrimary,
        marginBottom: 12,
    },
    subChipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    subChip: {
        borderWidth: 2,
        borderColor: COLORS.border,
        backgroundColor: COLORS.surface2,
        borderRadius: 50,
        paddingVertical: 12,
        paddingHorizontal: 18,
    },
    subChipSelected: {
        borderColor: COLORS.accent,
        backgroundColor: COLORS.accentTint,
    },
    subChipLabel: {
        fontFamily: 'Satoshi-Regular',
        fontSize: 14,
        color: COLORS.textPrimary,
    },
    subChipLabelSelected: {
        fontFamily: 'Satoshi-Medium',
        color: COLORS.textPrimary,
    },
    bottomArea: {
        paddingHorizontal: 24,
        paddingTop: 16,
    },
    continueButton: {
        backgroundColor: COLORS.accent,
        borderRadius: 16,
        paddingVertical: 18,
        minHeight: 56,
        justifyContent: 'center',
        alignItems: 'center',
    },
    continueText: {
        fontFamily: 'Satoshi-Medium',
        fontSize: 17,
        color: COLORS.surface,
    },
});
