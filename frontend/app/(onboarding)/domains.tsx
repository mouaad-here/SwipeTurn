import { OnboardingStepIndicator } from '@/components/onboarding-step-indicator';
import { COLORS } from '@/constants/colors';
import { getDraft, saveDraftStep } from '@/lib/onboarding-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
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

export const CATEGORIES: { id: string; label: string; subcategories: string[] }[] = [
  { id: 'engineering', label: 'Engineering', subcategories: ['Frontend', 'Backend', 'Mobile', 'Fullstack', 'Embedded'] },
  { id: 'data_ai', label: 'Data & AI', subcategories: ['Data Science', 'Data Engineering', 'ML/AI', 'BI / Data Analysis'] },
  { id: 'devops_cloud', label: 'DevOps & Cloud', subcategories: ['AWS', 'GCP', 'Azure', 'CI/CD', 'Kubernetes', 'Docker'] },
  { id: 'design_ux', label: 'Design & UX', subcategories: ['UI Design', 'UX Research', 'Product Design', 'Figma'] },
  { id: 'cybersecurity', label: 'Cybersecurity', subcategories: ['Penetration Testing', 'Security Analysis', 'SOC'] },
  { id: 'finance_accounting', label: 'Finance & Accounting', subcategories: ['Financial Analysis', 'Audit', 'Controlling'] },
  { id: 'customer_support', label: 'Customer Support', subcategories: ['Technical Support', 'Customer Success'] },
  { id: 'product', label: 'Product', subcategories: ['Product Management', 'Product Strategy', 'Agile'] },
  { id: 'other', label: 'Other', subcategories: [] },
];

export default function DomainsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const isEditing = params.mode === 'edit';

  const insets = useSafeAreaInsets();
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const loadDraft = useCallback(async () => {
    const draft = await getDraft();
    if (draft.domains?.length) {
      const ids = CATEGORIES
        .filter(c => draft.domains!.includes(c.label))
        .map(c => c.id);
      setSelectedCategories(ids);
    }
  }, []);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleSkip = () => {
    if (isEditing) {
      if (router.canGoBack()) router.back();
      else router.replace('/(onboarding)/preview');
    } else {
      router.push('/(onboarding)/skills');
    }
  };

  const handleContinue = async () => {
    const domainLabels = selectedCategories.map(
      (id) => CATEGORIES.find((c) => c.id === id)?.label ?? id
    );

    // Prune subcategories that no longer belong to the selected domains.
    // Prevents stale subs from boosting unrelated jobs in the matching engine.
    const validSubs = new Set(
      selectedCategories.flatMap(
        (id) => CATEGORIES.find((c) => c.id === id)?.subcategories ?? []
      )
    );
    const currentDraft = await getDraft();
    const prunedSubs = (currentDraft.subcategories ?? []).filter((s) => validSubs.has(s));

    await saveDraftStep({ domains: domainLabels, subcategories: prunedSubs });

    if (isEditing) {
      // When editing from Preview, go straight back — subcategories already pruned above
      if (router.canGoBack()) router.back();
      else router.replace('/(onboarding)/preview');
    } else {
      // Normal flow: go to subcategories if any selected domain has them
      const hasSubcategories = selectedCategories.some(
        id => (CATEGORIES.find(c => c.id === id)?.subcategories?.length ?? 0) > 0
      );
      if (selectedCategories.length > 0 && hasSubcategories) {
        router.push('/(onboarding)/subcategories');
      } else {
        router.push('/(onboarding)/skills');
      }
    }
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
        <Text style={styles.heading}>What field interests you?</Text>
        <Text style={styles.subtitle}>
          Pick one or more domains that match your career interests.
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
      </ScrollView>

      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable style={styles.continueButton} onPress={handleContinue}>
          <Text style={styles.continueText}>
            {isEditing ? 'Save' : (selectedCategories.length > 0 ? 'Choose Subcategories →' : 'Skip & Continue')}
          </Text>
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
