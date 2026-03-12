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

const CATEGORIES: { id: string; label: string; subcategories: string[] }[] = [
  { id: 'engineering', label: 'Engineering', subcategories: ['Frontend', 'Backend', 'Mobile', 'Fullstack', 'Embedded'] },
  { id: 'data_ai', label: 'Data & AI', subcategories: ['Data Science', 'Data Engineering', 'ML/AI', 'BI / Data Analysis'] },
  { id: 'devops_cloud', label: 'DevOps & Cloud', subcategories: [] },
  { id: 'design_ux', label: 'Design & UX', subcategories: [] },
  { id: 'cybersecurity', label: 'Cybersecurity', subcategories: [] },
  { id: 'finance_accounting', label: 'Finance & Accounting', subcategories: [] },
  { id: 'customer_support', label: 'Customer Support', subcategories: [] },
  { id: 'product', label: 'Product', subcategories: [] },
  { id: 'other', label: 'Other', subcategories: [] },
];

export default function DomainsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSubs, setSelectedSubs] = useState<string[]>([]);

  const loadDraft = useCallback(async () => {
    const draft = await getDraft();
    if (draft.domains?.length) setSelectedCategories(draft.domains);
    if (draft.subcategories?.length) setSelectedSubs(draft.subcategories);
  }, []);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  const toggleCategory = (id: string) => {
    const cat = CATEGORIES.find((c) => c.id === id);
    const isRemoving = selectedCategories.includes(id);

    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );

    if (isRemoving && cat && cat.subcategories.length > 0) {
      setSelectedSubs((prev) =>
        prev.filter((s) => !cat.subcategories.includes(s))
      );
    }
  };

  const toggleSubcategory = (sub: string) => {
    setSelectedSubs((prev) =>
      prev.includes(sub) ? prev.filter((s) => s !== sub) : [...prev, sub]
    );
  };

  const handleSkip = () => {
    router.push('/(onboarding)/skills');
  };

  const handleContinue = async () => {
    const domainLabels = selectedCategories.map(
      (id) => CATEGORIES.find((c) => c.id === id)?.label ?? id
    );
    await saveDraftStep({
      domains: domainLabels,
      subcategories: selectedSubs,
    });
    router.push('/(onboarding)/skills');
  };

  // Show subcategories for all selected categories. If none selected, default show all available subcategories to reveal the feature.
  const expandedCategories = selectedCategories.length > 0
    ? CATEGORIES.filter((c) => selectedCategories.includes(c.id))
    : CATEGORIES;

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
        <Text style={styles.heading}>What field interests you?</Text>
        <Text style={styles.subtitle}>
          Select categories and subcategories that match your interests.
        </Text>

        <View style={styles.categoryGrid}>
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategories.includes(cat.id);
            return (
              <Pressable
                key={cat.id}
                style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                onPress={() => toggleCategory(cat.id)}
              >
                <Text
                  style={[
                    styles.categoryLabel,
                    isSelected && styles.categoryLabelSelected,
                  ]}
                >
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {expandedCategories.some((c) => c.subcategories.length > 0) && (
          <View style={styles.subsection}>
            <Text style={styles.subsectionHeading}>Subcategories</Text>
            <View style={styles.subChipRow}>
              {expandedCategories.flatMap((c) =>
                c.subcategories.map((sub) => {
                  const isSelected = selectedSubs.includes(sub);
                  return (
                    <Pressable
                      key={sub}
                      style={[styles.subChip, isSelected && styles.subChipSelected]}
                      onPress={() => toggleSubcategory(sub)}
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
                })
              )}
            </View>
          </View>
        )}
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
  progress: {
    fontFamily: 'Satoshi-Regular',
    fontSize: 14,
    color: COLORS.textMeta,
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
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryChip: {
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  categoryChipSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentTint,
  },
  categoryLabel: {
    fontFamily: 'Satoshi-Regular',
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  categoryLabelSelected: {
    fontFamily: 'Satoshi-Medium',
    color: COLORS.textPrimary,
  },
  subsection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  subsectionHeading: {
    fontFamily: 'ClashDisplay-Bold',
    fontSize: 18,
    color: COLORS.textPrimary,
    marginBottom: 16,
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
