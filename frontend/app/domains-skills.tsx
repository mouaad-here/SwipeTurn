import { CATEGORIES } from '@/app/(onboarding)/domains';
import { COLORS, COLORS_ALPHA } from '@/constants/colors';
import { useAuthHeaders } from '@/hooks/useAuthHeaders';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FEED_CACHE_KEY = 'swipturn_feed_cache';

export default function DomainsSkillsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getAuthHeaders } = useAuthHeaders();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load current domains once from backend. We intentionally do NOT include
  // getAuthHeaders in the dependency array to avoid reloading and wiping
  // local selections on every auth tick.
  useEffect(() => {
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const { API_URL } = await import('@/constants/api');
        const res = await fetch(`${API_URL}/users/me`, { headers });
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const user = await res.json();
        const domains: string[] = user?.preferences?.domains || user?.fields || [];
        if (domains.length) {
          const ids = CATEGORIES
            .filter(c => domains.includes(c.label))
            .map(c => c.id);
          setSelectedIds(ids);
        }
      } catch {
        // ignore, user can still interact
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCategory = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id],
    );
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const { API_URL } = await import('@/constants/api');
      const domainLabels = selectedIds.map(
        id => CATEGORIES.find(c => c.id === id)?.label ?? id,
      );
      await fetch(`${API_URL}/users/preferences`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferences: {
            domains: domainLabels,
          },
        }),
      });
      try {
        await AsyncStorage.removeItem(FEED_CACHE_KEY);
      } catch {
        // ignore
      }
      router.back();
    } catch {
      setSaving(false);
    }
  };

  const hasSelection = selectedIds.length > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.headerIconBtn}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </Pressable>
        <View style={styles.headerTitleWrapper}>
          <Text style={styles.headerTitle}>Domains & Skills</Text>
          <Text style={styles.headerSubtitle}>Tune what you want to see</Text>
        </View>
        <View style={styles.headerRightSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + 96 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionLabel}>DOMAINS</Text>
            <Text style={styles.sectionDescription}>
              Choose the fields you’re interested in. Your CV and skills help us
              refine matches inside these domains.
            </Text>

            <View style={styles.categoryGrid}>
              {CATEGORIES.map(cat => {
                const isSelected = selectedIds.includes(cat.id);
                return (
                  <Pressable
                    key={cat.id}
                    style={[
                      styles.categoryChip,
                      isSelected && styles.categoryChipSelected,
                    ]}
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

            <View style={styles.hintBox}>
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={COLORS.textMeta}
              />
              <Text style={styles.hintText}>
                Skills mostly come from your CV. Updating your CV in Profile will
                refine your skills automatically.
              </Text>
            </View>
          </ScrollView>

          <View
            style={[
              styles.bottomBar,
              { paddingBottom: insets.bottom + 20 },
            ]}
          >
            <Pressable
              style={[
                styles.saveBtn,
                !hasSelection && !saving && styles.saveBtnSecondary,
              ]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnText}>
                  {hasSelection ? 'Save changes' : 'Skip for now'}
                </Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitleWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: 'ClashDisplay-Bold',
    fontSize: 20,
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontFamily: 'Satoshi-Regular',
    fontSize: 12,
    color: COLORS.textMeta,
    marginTop: 2,
  },
  headerRightSpacer: {
    width: 40,
    height: 40,
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  sectionLabel: {
    fontFamily: 'Satoshi-Medium',
    fontSize: 11,
    color: COLORS.textMeta,
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  sectionDescription: {
    fontFamily: 'Satoshi-Regular',
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 18,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  categoryChipSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS_ALPHA.accentLight,
  },
  categoryLabel: {
    fontFamily: 'Satoshi-Regular',
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  categoryLabelSelected: {
    fontFamily: 'Satoshi-Medium',
    color: COLORS.textPrimary,
  },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 24,
    padding: 12,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  hintText: {
    flex: 1,
    fontFamily: 'Satoshi-Regular',
    fontSize: 13,
    color: COLORS.textMeta,
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  saveBtn: {
    minHeight: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
  },
  saveBtnSecondary: {
    backgroundColor: COLORS.textMeta,
  },
  saveBtnText: {
    fontFamily: 'Satoshi-Medium',
    fontSize: 15,
    color: '#FFFFFF',
  },
});

