import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const COLORS = {
    background: '#F8F9FA',
    accentRed: '#FF4422',
    accentGreen: '#10B981',
    textPrimary: '#111827',
    textMuted: '#6B7280',
    border: '#E5E7EB',
    surface: '#FFFFFF',
    surface2: '#F3F4F6',
    metaText: '#9CA3AF'
};

export default function ProfileScreen() {
    const router = useRouter();

    const handleLogout = () => {
        // According to instructions, logging out routes to welcome page
        router.replace('/');
    };

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                {/* Avatar Section */}
                <View style={styles.avatarSection}>
                    <View style={styles.avatarCircle}>
                        <Text style={styles.avatarInitials}>JS</Text>
                    </View>
                    <Text style={styles.nameText}>John Smith</Text>
                    <Text style={styles.universityText}>STANFORD UNIVERSITY</Text>

                    <View style={styles.profileCompletionContainer}>
                        <Text style={styles.completionLabel}>Profile 72% complete</Text>
                        <View style={styles.track}>
                            <View style={styles.fill} />
                        </View>
                    </View>
                </View>

                {/* MY RESUME */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionLabel}>MY RESUME</Text>
                </View>
                <View style={styles.card}>
                    <View style={styles.resumeIconBox}>
                        <Text style={{ fontSize: 20 }}>📄</Text>
                    </View>
                    <View style={styles.resumeInfo}>
                        <Text style={styles.resumeFilename} numberOfLines={1}>John_Smith_CV_2026.pdf</Text>
                        <Text style={styles.resumeUpdated}>UPDATED 2 DAYS AGO</Text>
                    </View>
                    <Pressable style={styles.updateCvBtn} onPress={() => router.push('/(onboarding)/cv-upload')}>
                        <Text style={styles.updateCvText}>Update CV</Text>
                    </Pressable>
                </View>

                {/* MY PREFERENCES */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionLabel}>MY PREFERENCES</Text>
                </View>
                <View style={[styles.card, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                    <View style={styles.chipsContainer}>
                        {['React', 'TypeScript', 'Remote', 'Frontend'].map((pref, i) => (
                            <View key={i} style={styles.chip}>
                                <Text style={styles.chipText}>{pref}</Text>
                            </View>
                        ))}
                        <Pressable style={styles.addChipBtn}>
                            <Ionicons name="add" size={20} color={COLORS.accentRed} />
                        </Pressable>
                    </View>
                </View>

                {/* ACCOUNT SETTINGS */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionLabel}>ACCOUNT SETTINGS</Text>
                </View>
                <View style={styles.settingsCard}>

                    <Pressable style={styles.settingRow}>
                        <View style={styles.settingIconCenter}>
                            <Text style={{ fontSize: 18 }}>🔔</Text>
                        </View>
                        <Text style={styles.settingLabel}>Notifications</Text>
                        <Text style={styles.settingValue}>Push</Text>
                        <Ionicons name="chevron-forward" size={20} color={COLORS.metaText} />
                    </Pressable>

                    <Pressable style={styles.settingRow}>
                        <View style={styles.settingIconCenter}>
                            <Text style={{ fontSize: 18 }}>🔒</Text>
                        </View>
                        <Text style={styles.settingLabel}>Privacy & Security</Text>
                        <Text style={styles.settingValue}></Text>
                        <Ionicons name="chevron-forward" size={20} color={COLORS.metaText} />
                    </Pressable>

                    <Pressable style={styles.settingRow}>
                        <View style={styles.settingIconCenter}>
                            <Text style={{ fontSize: 18 }}>❓</Text>
                        </View>
                        <Text style={styles.settingLabel}>Help & Support</Text>
                        <Text style={styles.settingValue}></Text>
                        <Ionicons name="chevron-forward" size={20} color={COLORS.metaText} />
                    </Pressable>

                    {/* Log out */}
                    <Pressable style={[styles.settingRow, { borderBottomWidth: 0 }]} onPress={handleLogout}>
                        <View style={styles.settingIconCenter}>
                            <Ionicons name="log-out-outline" size={22} color={COLORS.accentRed} />
                        </View>
                        <Text style={[styles.settingLabel, { color: COLORS.accentRed }]}>Log out</Text>
                    </Pressable>

                </View>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    scrollContent: { paddingBottom: 120 },

    avatarSection: { paddingTop: 64, alignItems: 'center', paddingBottom: 24 },
    avatarCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: COLORS.accentRed, justifyContent: 'center', alignItems: 'center' },
    avatarInitials: { fontFamily: 'Syne_800ExtraBold', fontSize: 32, color: 'white' },
    nameText: { fontFamily: 'Syne_800ExtraBold', fontSize: 24, color: COLORS.textPrimary, marginTop: 14 },
    universityText: { fontFamily: 'DMSans_400Regular', fontSize: 12, color: COLORS.metaText, letterSpacing: 1.2, marginTop: 4 },

    profileCompletionContainer: { marginTop: 16, width: 200 },
    completionLabel: { fontFamily: 'DMSans_500Medium', fontSize: 12, color: COLORS.textMuted, marginBottom: 6, textAlign: 'center' },
    track: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: 'hidden' },
    fill: { width: '72%', height: '100%', backgroundColor: COLORS.accentRed, borderRadius: 3 },

    sectionHeader: { paddingHorizontal: 24, marginBottom: 10, marginTop: 12 },
    sectionLabel: { fontFamily: 'DMSans_400Regular', fontSize: 11, color: COLORS.metaText, letterSpacing: 1.4 },

    card: {
        marginHorizontal: 24, marginBottom: 24, backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2
    },

    resumeIconBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(255,68,34,0.10)', justifyContent: 'center', alignItems: 'center' },
    resumeInfo: { flex: 1, gap: 2 },
    resumeFilename: { fontFamily: 'DMSans_500Medium', fontSize: 14, color: COLORS.textPrimary },
    resumeUpdated: { fontFamily: 'DMSans_400Regular', fontSize: 11, color: COLORS.metaText },
    updateCvBtn: { backgroundColor: COLORS.accentRed, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 50 },
    updateCvText: { fontFamily: 'DMSans_500Medium', fontSize: 12, color: 'white' },

    chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 50, paddingHorizontal: 14, paddingVertical: 8 },
    chipText: { fontFamily: 'DMSans_500Medium', fontSize: 13, color: COLORS.textPrimary },
    addChipBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: COLORS.accentRed, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },

    settingsCard: {
        marginHorizontal: 24, marginBottom: 120, backgroundColor: COLORS.surface, borderRadius: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2
    },
    settingRow: { paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 14 },
    settingIconCenter: { width: 28, alignItems: 'center', justifyContent: 'center' },
    settingLabel: { flex: 1, fontFamily: 'DMSans_500Medium', fontSize: 15, color: COLORS.textPrimary },
    settingValue: { fontFamily: 'DMSans_400Regular', fontSize: 14, color: COLORS.metaText, marginRight: 4 }
});
