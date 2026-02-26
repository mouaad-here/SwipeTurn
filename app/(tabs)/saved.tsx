import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppStore } from '../../store/appStore';

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



export default function SavedScreen() {
    const router = useRouter();
    const savedJobs = useAppStore(state => state.savedJobs);

    const [activeTab, setActiveTab] = useState<'SAVED' | 'APPLIED'>('SAVED');

    const filteredJobs = savedJobs.filter(job => job.status === activeTab);

    const renderItem = ({ item }: { item: typeof savedJobs[0] }) => {
        const isSaved = item.status === 'SAVED';

        return (
            <Pressable
                style={styles.card}
                onPress={() => router.push({ pathname: '/job-detail', params: { id: item.id } })}
            >
                {/* Left: Company Logo Box */}
                <View style={styles.logoBox}>
                    <Text style={styles.logoInitial}>{item.company.charAt(0)}</Text>
                </View>

                {/* Center: Info */}
                <View style={styles.infoCenter}>
                    <Text style={styles.jobTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.companyName}>{item.company}</Text>

                    <View style={styles.metaRow}>
                        <Ionicons name="location-outline" size={12} color={COLORS.metaText} style={{ marginRight: 2 }} />
                        <Text style={styles.metaText}>{item.location.toUpperCase()}</Text>
                        <Text style={styles.metaDot}>•</Text>
                        <Ionicons name="time-outline" size={12} color={COLORS.metaText} style={{ marginRight: 2 }} />
                        <Text style={styles.metaText}>{item.timeAgo}</Text>
                    </View>
                </View>

                {/* Right: Badge Pill */}
                <View style={[
                    styles.badgePill,
                    { backgroundColor: isSaved ? 'rgba(255,68,34,0.10)' : 'rgba(16,185,129,0.10)' }
                ]}>
                    <Text style={[
                        styles.badgeText,
                        { color: isSaved ? COLORS.accentRed : COLORS.accentGreen }
                    ]}>
                        {item.status}
                    </Text>
                </View>
            </Pressable>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>My List</Text>
            </View>

            {/* Tabs Row */}
            <View style={styles.tabsContainer}>
                <Pressable
                    style={[styles.tab, activeTab === 'SAVED' && styles.tabActive]}
                    onPress={() => setActiveTab('SAVED')}
                >
                    <Text style={[styles.tabText, activeTab === 'SAVED' && styles.tabTextActive]}>
                        Saved
                    </Text>
                </Pressable>

                <Pressable
                    style={[styles.tab, activeTab === 'APPLIED' && styles.tabActive]}
                    onPress={() => setActiveTab('APPLIED')}
                >
                    <Text style={[styles.tabText, activeTab === 'APPLIED' && styles.tabTextActive]}>
                        Applied
                    </Text>
                </Pressable>
            </View>

            {/* FlatList */}
            <FlatList
                data={filteredJobs}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No {activeTab.toLowerCase()} jobs yet.</Text>
                    </View>
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    header: {
        paddingTop: 64,
        paddingHorizontal: 24,
        marginBottom: 16,
    },
    headerTitle: {
        fontFamily: 'Syne_800ExtraBold',
        fontSize: 32,
        color: COLORS.textPrimary,
    },
    tabsContainer: {
        flexDirection: 'row',
        paddingHorizontal: 24,
        marginBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
        marginBottom: -1, // Overlap the container border
    },
    tabActive: {
        borderBottomColor: COLORS.accentRed,
    },
    tabText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 15,
        color: COLORS.textMuted,
    },
    tabTextActive: {
        color: COLORS.accentRed,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 120, // Leave room for custom tab bar
        gap: 12,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        padding: 16,
        // Shadow for iOS
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        // Elevation for Android
        elevation: 2,
    },
    logoBox: {
        width: 56,
        height: 56,
        borderRadius: 12,
        backgroundColor: COLORS.surface2,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    logoInitial: {
        fontFamily: 'Syne_800ExtraBold',
        fontSize: 24,
        color: COLORS.textPrimary,
    },
    infoCenter: {
        flex: 1,
        gap: 3,
        marginRight: 8,
    },
    jobTitle: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 15,
        color: COLORS.textPrimary,
    },
    companyName: {
        fontFamily: 'DMSans_400Regular',
        fontSize: 13,
        color: COLORS.textMuted,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },
    metaText: {
        fontFamily: 'DMSans_400Regular',
        fontSize: 11,
        color: COLORS.metaText,
    },
    metaDot: {
        color: COLORS.metaText,
        fontSize: 10,
        marginHorizontal: 4,
    },
    badgePill: {
        borderRadius: 50,
        paddingVertical: 5,
        paddingHorizontal: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    badgeText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 11,
        letterSpacing: 0.5,
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        fontFamily: 'DMSans_400Regular',
        fontSize: 14,
        color: COLORS.textMuted,
    }
});
