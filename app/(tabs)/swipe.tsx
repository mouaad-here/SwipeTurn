import { useAuthHeaders } from '@/hooks/useAuthHeaders';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetFooter, BottomSheetFooterProps, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Extrapolation, FadeIn, interpolate, runOnJS, SlideOutLeft, SlideOutRight, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../../store/appStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.15; // Decreased to make swipe much easier

function displayCompany(name: string | null | undefined): string {
    if (name == null || name === '') return 'Company';
    const n = String(name).trim();
    if (n.toLowerCase() === 'unknown' || n.toLowerCase() === 'unknown company') return 'Company';
    return n;
}

function formatPostedAt(postedAt: string | null | undefined): string {
    if (!postedAt) return '';
    try {
        const date = new Date(postedAt);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        if (diffMins < 1) return 'New';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return '1 day ago';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
        return date.toLocaleDateString();
    } catch {
        return '';
    }
}

// --- Constants moving inside component ---

// --- CONSTANTS ---
const COLORS = {
    background: '#FFFFFF',
    surface: '#F9FAFB',
    surface2: '#F3F4F6',
    border: '#E5E7EB',
    accentRed: '#FF4422',
    accentGreen: '#10B981',
    textPrimary: '#1F2937',
    textMuted: '#6B7280',
};



const SwipeCard = ({ job, index, isTopCard, swipeDirection, handleSwipeEnd, onCardTap }: any) => {
    const stackOffsetTop = index * 12;
    const stackScale = 1 - (index * 0.04);
    const stackZIndex = 10 - index;
    const stackOpacity = 1 - (index * 0.2);

    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);

    const panGesture = Gesture.Pan()
        .enabled(isTopCard)
        .onUpdate((event) => {
            translateX.value = event.translationX;
            translateY.value = event.translationY * 0.15; // smooth resistance on vertical drag
        })
        .onEnd((event) => {
            const isFlickLeft = event.velocityX < -500;
            const isFlickRight = event.velocityX > 500;
            const isDragLeft = event.translationX < -SWIPE_THRESHOLD;
            const isDragRight = event.translationX > SWIPE_THRESHOLD;

            if (isFlickLeft || isDragLeft || isFlickRight || isDragRight) {
                const direction = (isFlickRight || isDragRight) ? 'right' : 'left';
                translateX.value = withSpring(direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5, {
                    velocity: event.velocityX,
                    damping: 20,
                    stiffness: 100,
                });
                runOnJS(handleSwipeEnd)(direction);
            } else {
                translateX.value = withSpring(0, { damping: 15, stiffness: 150 });
                translateY.value = withSpring(0, { damping: 15, stiffness: 150 });
            }
        });

    const animatedCardStyle = useAnimatedStyle(() => {
        if (!isTopCard) return {};
        const rotate = interpolate(translateX.value, [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2], [-10, 0, 10], Extrapolation.CLAMP);
        return {
            transform: [
                { translateX: translateX.value },
                { translateY: translateY.value },
                { rotate: `${rotate}deg` },
                { scale: stackScale },
            ]
        };
    });

    const likeOpacity = useAnimatedStyle(() => {
        if (!isTopCard) return { opacity: 0 };
        return { opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD / 2], [0, 1], Extrapolation.CLAMP) };
    });

    const passOpacity = useAnimatedStyle(() => {
        if (!isTopCard) return { opacity: 0 };
        return { opacity: interpolate(translateX.value, [0, -SWIPE_THRESHOLD / 2], [0, 1], Extrapolation.CLAMP) };
    });

    const defaultTransform = [{ scale: stackScale }];

    const cardStyleLocal = [
        styles.card,
        {
            top: stackOffsetTop,
            zIndex: stackZIndex,
            opacity: stackOpacity,
            backgroundColor: index === 0 ? COLORS.surface : '#FFFFFF',
            borderColor: COLORS.border,
            borderWidth: 1,
        },
        isTopCard ? animatedCardStyle : { transform: defaultTransform }
    ];

    let animationConfig = undefined;
    if (isTopCard && swipeDirection === 'left') {
        animationConfig = SlideOutLeft.duration(200);
    } else if (isTopCard && swipeDirection === 'right') {
        animationConfig = SlideOutRight.duration(200);
    }

    const tapGesture = Gesture.Tap()
        .enabled(isTopCard)
        .maxDistance(10)
        .onEnd(() => {
            runOnJS(onCardTap)(job);
        });

    const composedGesture = Gesture.Simultaneous(panGesture, tapGesture);

    return (
        <GestureDetector gesture={composedGesture} key={job.id}>
            <Animated.View style={cardStyleLocal} exiting={animationConfig}>
                <View style={styles.cardTop}>
                    <View style={styles.companyRow}>
                        <View style={styles.companyLogo}>
                            <Text style={styles.companyInitial}>{(displayCompany(job.company) || 'C').charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={styles.companyInfo}>
                            <Text style={styles.companyName} numberOfLines={1} ellipsizeMode="tail">{displayCompany(job.company)}</Text>
                            <View style={styles.companyMetaRow}>
                                <Text style={styles.companyLocation}>📍 {job.location}</Text>
                                {formatPostedAt(job.posted_at) ? (
                                    <Text style={styles.postedBadge}>{formatPostedAt(job.posted_at)}</Text>
                                ) : null}
                            </View>
                        </View>
                        {job.remote && (
                            <View style={styles.badgeRemote}>
                                <Text style={styles.badgeRemoteText}>REMOTE</Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.jobTitle} numberOfLines={2}>{job.title}</Text>
                    <View style={styles.skillsRow}>
                        {(Array.isArray(job.skills) ? job.skills : []).map((skill: any, idx: number) => (
                            <View key={idx} style={[styles.skillChip, skill.matched ? styles.skillChipMatched : styles.skillChipUnmatched]}>
                                {skill.matched ? (
                                    <Text style={styles.skillChipTextMatched}>✓ {skill.name}</Text>
                                ) : (
                                    <View style={styles.skillChipContentUnmatched}>
                                        <View style={styles.greyDot} />
                                        <Text style={styles.skillChipTextUnmatched}>{skill.name}</Text>
                                    </View>
                                )}
                            </View>
                        ))}
                    </View>
                    <Text style={styles.description} numberOfLines={8}>
                        {job.description != null ? String(job.description) : ''}
                    </Text>
                </View>

                <View style={styles.cardBottom}>
                    <View style={styles.matchRow}>
                        <Text style={styles.matchLabel}>CV Match <Text style={styles.matchScore}>{job.matchScore}%</Text></Text>
                        <Text style={styles.recommendedLabel}>RECOMMENDED FOR YOU</Text>
                    </View>
                    <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${job.matchScore}%` }]} />
                    </View>
                </View>

                {isTopCard && (
                    <>
                        <Animated.View style={[styles.indicator, styles.indicatorLike, likeOpacity]}>
                            <Text style={styles.indicatorTextLike}>LIKE</Text>
                        </Animated.View>
                        <Animated.View style={[styles.indicator, styles.indicatorPass, passOpacity]}>
                            <Text style={styles.indicatorTextPass}>PASS</Text>
                        </Animated.View>
                    </>
                )}
            </Animated.View>
        </GestureDetector>
    );
};

export default function SwipeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const saveJob = useAppStore(state => state.saveJob);

    const [feed, setFeed] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
    const [geographyMode, setGeographyMode] = useState<string>('both');

    const bottomSheetModalRef = React.useRef<BottomSheetModal>(null);
    const snapPoints = React.useMemo(() => ['85%', '100%'], []);
    const [selectedJob, setSelectedJob] = useState<any>(null);
    const feedLoadedRef = useRef(false);
    const loadingRef = useRef(false);

    const openJobDetails = (job: any) => {
        setSelectedJob(job);
        bottomSheetModalRef.current?.present();
    };

    useEffect(() => {
        if (feedLoadedRef.current) return;
        feedLoadedRef.current = true;
        loadFeed();
    }, []);

    const renderFooter = React.useCallback(
        (props: BottomSheetFooterProps) => {
            if (!selectedJob) return null;
            return (
                <BottomSheetFooter {...props} bottomInset={0}>
                    <View style={[styles.sheetBottomBar, { paddingBottom: Math.max(insets.bottom, 24) }]}>
                        <View style={styles.sheetMatchCircle}>
                            <Text style={styles.sheetMatchScore}>{selectedJob.matchScore}%</Text>
                            <Text style={styles.sheetMatchLabel}>MATCH</Text>
                        </View>
                        <Pressable
                            style={styles.sheetApplyBtn}
                            onPress={() => {
                                if (selectedJob.url) {
                                    WebBrowser.openBrowserAsync(selectedJob.url);
                                } else {
                                    console.warn("No apply URL available for this job.");
                                }
                            }}
                        >
                            <Text style={styles.sheetApplyBtnText}>Apply Now</Text>
                        </Pressable>
                    </View>
                </BottomSheetFooter>
            );
        },
        [selectedJob, insets.bottom]
    );

    const { getAuthHeaders } = useAuthHeaders();

    const loadFeed = async () => {
        if (loadingRef.current) return;
        loadingRef.current = true;
        setLoading(true);
        try {
            const headers = await getAuthHeaders();
            const { API_URL } = await import('@/constants/api');
            const response = await fetch(`${API_URL}/jobs/feed`, {
                headers: { ...headers }
            });

            if (response.status === 401) {
                router.replace('/');
                setFeed([]);
                loadingRef.current = false;
                setLoading(false);
                return;
            }

            if (!response.ok) {
                console.error("Failed to fetch jobs feed", response.status);
                setFeed([]);
                loadingRef.current = false;
                setLoading(false);
                return;
            }

            const data = await response.json();

            // Map backend job schema to frontend swipe card expectations (audit: use city, logo_url, description_text)
            const rawJobs = Array.isArray(data.jobs) ? data.jobs : [];
            const geographyMode = data.geography_mode || 'both';
            const mappedJobs = rawJobs.map((job: any) => {
                const matched = Array.isArray(job.matched_skills) ? job.matched_skills : [];
                const missing = Array.isArray(job.missing_skills) ? job.missing_skills : [];
                const combinedSkills = [
                    ...matched.map((s: string) => ({ name: String(s), matched: true })),
                    ...missing.map((s: string) => ({ name: String(s), matched: false }))
                ];
                const descRaw = job.description_text || job.description || '';
                const descriptionPreview = typeof descRaw === 'string' ? descRaw.slice(0, 3000) : '';
                const company = displayCompany(job.company);
                const locationDisplay = job.city != null && String(job.city).trim() !== '' ? String(job.city) : (job.location != null ? String(job.location) : 'Unknown');
                return {
                    id: job.id,
                    company,
                    location: locationDisplay,
                    city: job.city,
                    remote: (job.is_remote || (job.location && String(job.location).toLowerCase().includes('remote'))) || false,
                    title: job.title != null ? String(job.title) : 'Job',
                    description: descriptionPreview,
                    descriptionFull: job.description_text || job.description || '',
                    logoUrl: job.logo_url || job.company_logo_url || null,
                    skills: combinedSkills,
                    matchScore: typeof job.match_score === 'number' ? job.match_score : 0,
                    type: job.type || job.job_type || 'full-time',
                    url: job.apply_url || job.job_url || '',
                    visa_badge: job.visa_badge,
                    posted_at: job.posted_at || job.posted_at_iso || null,
                };
            });

            setFeed(mappedJobs);
            setGeographyMode(geographyMode);
        } catch (error) {
            const { API_URL } = await import('@/constants/api');
            console.error("Feed error:", error, "| API_URL:", `${API_URL}/jobs/feed`);
            setFeed([]);
            setGeographyMode('both');
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    };

    const handleSwipeEnd = async (direction: 'left' | 'right') => {
        if (feed.length === 0) return;

        const topJob = feed[0];
        setSwipeDirection(direction);

        // Let the exit animation finish, then pop the card
        setTimeout(() => {
            if (direction === 'right') {
                saveJob(topJob);
            }
            setFeed((prev) => prev.slice(1));
            setSwipeDirection(null);
        }, 150);

        // Async record swipe to backend
        try {
            const headers = await getAuthHeaders();
            const { API_URL } = await import('@/constants/api');
            await fetch(`${API_URL}/swipes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                body: JSON.stringify({
                    job_id: topJob.id,
                    direction: direction
                })
            });
        } catch (err) {
            console.error("Failed to record swipe", err);
        }
    };



    const renderEmptyState = () => (
        <View style={styles.emptyState}>
            <Ionicons name="checkmark-done-circle-outline" size={64} color={COLORS.surface2} />
            <Text style={styles.emptyTitle}>No more jobs today</Text>
            <Text style={styles.emptySubtitle}>You've caught up with all matches.</Text>
            <Pressable style={styles.refreshButton} onPress={() => { feedLoadedRef.current = false; loadFeed(); }}>
                <Text style={styles.refreshButtonText}>Refresh</Text>
            </Pressable>
        </View>
    );



    return (
        <GestureHandlerRootView style={styles.container}>
            <StatusBar style="dark" />

            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <View style={styles.headerLeft}>
                    <View style={styles.orangeCircle}>
                        <Ionicons name="swap-horizontal" size={16} color="white" />
                    </View>
                    <Text style={styles.headerTitle}>Swip<Text style={{ color: COLORS.accentRed }}>turn</Text></Text>
                </View>
                <Pressable style={styles.bellButton} hitSlop={12}>
                    <Ionicons name="notifications" size={20} color={COLORS.textPrimary} />
                </Pressable>
            </View>
            {!loading && feed.length > 0 && (
                <View style={styles.geographyModeRow}>
                    <Text style={styles.geographyModeText}>
                        Showing: {geographyMode === 'morocco' ? 'Morocco only 🇲🇦' : geographyMode === 'global' ? 'Global / Remote 🌍' : 'Everywhere'}
                    </Text>
                </View>
            )}

            {/* Cards Stack */}
            <View style={styles.stackContainer}>
                {loading ? (
                    <ActivityIndicator size="large" color={COLORS.accentRed} style={{ marginTop: 100 }} />
                ) : feed.length === 0 ? (
                    renderEmptyState()
                ) : (
                    <View style={styles.cardsWrapper}>
                        {/* Render backwards so index 0 is on top */}
                        {feed.slice(0, 3).reverse().map((job, reverseIndex, arr) => {
                            // Calculate actual index based on the reversed array to pass to renderCard
                            const actualIndex = arr.length - 1 - reverseIndex;
                            return <SwipeCard key={job.id} job={job} index={actualIndex} isTopCard={actualIndex === 0} swipeDirection={swipeDirection} handleSwipeEnd={handleSwipeEnd} onCardTap={openJobDetails} />;
                        })}
                    </View>
                )}

                {/* Swipe Instructions Overlay */}
                {feed.length > 0 && !loading && (
                    <Animated.View style={styles.instructionRow} entering={FadeIn.delay(600)}>
                        <View style={styles.instructionSide}>
                            <View style={[styles.instructionIconBox, { backgroundColor: COLORS.surface2 }]}>
                                <Ionicons name="close" size={16} color={COLORS.textMuted} />
                            </View>
                            <Text style={styles.instructionText}>Swipe left to <Text style={styles.instructionTextBold}>Pass</Text></Text>
                        </View>

                        <View style={styles.instructionDot} />

                        <View style={styles.instructionSide}>
                            <Text style={styles.instructionText}>Swipe right to <Text style={[styles.instructionTextBold, { color: COLORS.accentGreen }]}>Save</Text></Text>
                            <View style={[styles.instructionIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                                <Ionicons name="heart" size={16} color={COLORS.accentGreen} />
                            </View>
                        </View>
                    </Animated.View>
                )}
            </View>



            {/* Bottom Sheet Modal for Job Details */}
            <BottomSheetModal
                ref={bottomSheetModalRef}
                index={0}
                snapPoints={snapPoints}
                enablePanDownToClose={true}
                topInset={insets.top}
                footerComponent={renderFooter}
                backgroundStyle={{ backgroundColor: COLORS.background }}
                handleIndicatorStyle={{ backgroundColor: COLORS.border, width: 40 }}
            >
                {selectedJob && (
                    <BottomSheetScrollView
                        style={{ flex: 1, width: '100%', height: '100%', backgroundColor: COLORS.background }}
                        contentContainerStyle={[styles.sheetScroll, { paddingBottom: Math.max(insets.bottom, 140) }]}
                        showsVerticalScrollIndicator={true}
                    >
                        <View style={styles.sheetHeaderGroup}>
                            <Pressable onPress={() => bottomSheetModalRef.current?.dismiss()} style={styles.sheetHeaderBtn}>
                                <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
                            </Pressable>
                            <Text style={styles.sheetHeaderTitle}>Vacancy Details</Text>
                            <Pressable style={styles.sheetHeaderBtn}>
                                <Ionicons name="ellipsis-vertical" size={24} color={COLORS.textPrimary} />
                            </Pressable>
                        </View>

                        <View style={styles.sheetCard}>
                            <View style={styles.sheetCompanyRow}>
                                <View style={styles.sheetCompanyLogo}>
                                    <Text style={styles.sheetCompanyInitial}>{(displayCompany(selectedJob.company) || 'C').charAt(0).toUpperCase()}</Text>
                                </View>
                                <View style={styles.sheetCompanyInfo}>
                                    <Text style={styles.sheetJobTitle}>{selectedJob.title || 'Job'}</Text>
                                    <Text style={styles.sheetCompanyName} numberOfLines={1} ellipsizeMode="tail">{displayCompany(selectedJob.company)}</Text>

                                    <Text style={styles.sheetLocationRow}>
                                        <Ionicons name="location-outline" size={14} color={COLORS.textMuted} /> {selectedJob.location}
                                    </Text>
                                    {selectedJob.salary && (
                                        <Text style={styles.sheetSalaryRow}>
                                            <Ionicons name="cash-outline" size={14} color={COLORS.textMuted} /> {selectedJob.salary}
                                        </Text>
                                    )}

                                    <View style={styles.sheetPillsRow}>
                                        <View style={styles.sheetPill}>
                                            <Text style={styles.sheetPillText}>{selectedJob.type || 'Full Time'}</Text>
                                        </View>
                                        {selectedJob.remote && (
                                            <View style={styles.sheetPill}>
                                                <Text style={styles.sheetPillText}>Remote</Text>
                                            </View>
                                        )}
                                        {formatPostedAt(selectedJob.posted_at) ? (
                                            <Text style={styles.sheetTimeText}>{formatPostedAt(selectedJob.posted_at)}</Text>
                                        ) : null}
                                    </View>
                                </View>
                                <Pressable style={styles.sheetSaveBtn}>
                                    <Ionicons name="bookmark-outline" size={20} color={COLORS.textPrimary} />
                                </Pressable>
                            </View>

                            <View style={styles.sheetTabRow}>
                                <View style={styles.sheetTabActive}>
                                    <Text style={styles.sheetTabTextActive}>About The Job</Text>
                                </View>
                                <View style={styles.sheetTabInactive}>
                                    <Text style={styles.sheetTabTextInactive}>Company Details</Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.sheetDescSection}>
                            <Text style={styles.sheetSectionTitle}>Job Description</Text>
                            <View style={styles.sheetDescBox}>
                                <Text style={styles.sheetDescText}>{(selectedJob.descriptionFull ?? selectedJob.description) != null ? String(selectedJob.descriptionFull ?? selectedJob.description) : 'No description available.'}</Text>
                            </View>
                        </View>
                        {/* Empty spacer to ensure scrollable height passes bottom threshold */}
                        <View style={{ height: 100 }} />
                    </BottomSheetScrollView>
                )}
            </BottomSheetModal>
        </GestureHandlerRootView >
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 10 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    orangeCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.accentRed, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontFamily: 'Syne_800ExtraBold', fontSize: 24, color: COLORS.textPrimary },
    bellButton: { minWidth: 48, minHeight: 48, padding: 8, justifyContent: 'center', alignItems: 'center' },
    geographyModeRow: { paddingHorizontal: 20, paddingBottom: 6 },
    geographyModeText: { fontFamily: 'DMSans_400Regular', fontSize: 12, color: COLORS.textMuted },
    stackContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 110 },
    cardsWrapper: { width: SCREEN_WIDTH * 0.9, height: SCREEN_HEIGHT * 0.65, marginBottom: 10 },
    card: { position: 'absolute', width: '100%', height: '100%', borderRadius: 20, overflow: 'hidden', backgroundColor: COLORS.background },
    cardTop: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 16, flex: 1 },
    companyRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    companyLogo: { width: 48, height: 48, borderRadius: 12, backgroundColor: COLORS.surface2, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    companyInitial: { fontFamily: 'Syne_800ExtraBold', fontSize: 24, color: COLORS.textPrimary },
    companyInfo: { flex: 1 },
    companyName: { fontFamily: 'DMSans_500Medium', fontSize: 16, color: COLORS.textPrimary },
    companyMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    companyLocation: { fontFamily: 'DMSans_400Regular', fontSize: 14, color: COLORS.textMuted },
    postedBadge: { fontFamily: 'DMSans_500Medium', fontSize: 12, color: COLORS.accentRed },
    badgeRemote: { backgroundColor: 'rgba(16, 185, 129, 0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    badgeRemoteText: { fontFamily: 'DMSans_500Medium', fontSize: 12, color: COLORS.accentGreen },
    jobTitle: { fontFamily: 'Syne_800ExtraBold', fontSize: 24, color: COLORS.textPrimary, marginBottom: 16 },
    skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    skillChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
    skillChipMatched: { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: COLORS.accentGreen },
    skillChipUnmatched: { backgroundColor: COLORS.surface, borderColor: COLORS.border },
    skillChipTextMatched: { fontFamily: 'DMSans_500Medium', fontSize: 12, color: COLORS.accentGreen },
    skillChipContentUnmatched: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    greyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.textMuted },
    skillChipTextUnmatched: { fontFamily: 'DMSans_400Regular', fontSize: 12, color: COLORS.textMuted },
    description: { fontFamily: 'DMSans_400Regular', fontSize: 16, color: COLORS.textPrimary, lineHeight: 24 },
    cardBottom: { padding: 16, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface },
    matchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    matchLabel: { fontFamily: 'DMSans_500Medium', fontSize: 12, color: COLORS.textMuted },
    matchScore: { fontFamily: 'Syne_800ExtraBold', fontSize: 14, color: COLORS.accentGreen },
    recommendedLabel: { fontFamily: 'Syne_800ExtraBold', fontSize: 7.5, color: COLORS.textPrimary, letterSpacing: 0.5 },
    progressTrack: { height: 8, backgroundColor: COLORS.surface2, borderRadius: 4, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: COLORS.accentGreen },
    indicator: { position: 'absolute', top: 40, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 4, borderRadius: 10, transform: [{ rotate: '-15deg' }] },
    indicatorLike: { right: 40, borderColor: COLORS.accentGreen },
    indicatorTextLike: { fontFamily: 'Syne_800ExtraBold', fontSize: 32, color: COLORS.accentGreen, letterSpacing: 2 },
    indicatorPass: { left: 40, borderColor: COLORS.accentRed },
    indicatorTextPass: { fontFamily: 'Syne_800ExtraBold', fontSize: 32, color: COLORS.accentRed, letterSpacing: 2 },
    instructionRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20, marginTop: 10, gap: 8 },
    instructionSide: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    instructionIconBox: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    instructionText: { fontFamily: 'DMSans_400Regular', fontSize: 12, color: COLORS.textMuted },
    instructionTextBold: { fontFamily: 'DMSans_500Medium', color: COLORS.textPrimary },
    instructionDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
    emptyState: { alignItems: 'center', justifyContent: 'center', padding: 40 },
    emptyTitle: { fontFamily: 'Syne_800ExtraBold', fontSize: 24, color: COLORS.textPrimary, marginTop: 16 },
    emptySubtitle: { fontFamily: 'DMSans_400Regular', fontSize: 16, color: COLORS.textMuted, marginTop: 8, textAlign: 'center' },
    refreshButton: { marginTop: 24, paddingHorizontal: 24, paddingVertical: 12, minHeight: 48, justifyContent: 'center', backgroundColor: COLORS.accentRed, borderRadius: 24 },
    refreshButtonText: { fontFamily: 'DMSans_500Medium', fontSize: 16, color: COLORS.background },
    sheetScroll: {},
    sheetHeaderGroup: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
    sheetHeaderBtn: { minWidth: 48, minHeight: 48, padding: 8, justifyContent: 'center', alignItems: 'center' },
    sheetHeaderTitle: { fontFamily: 'Syne_800ExtraBold', fontSize: 18, color: COLORS.textPrimary },
    sheetCard: { paddingHorizontal: 20 },
    sheetCompanyRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
    sheetCompanyLogo: { width: 64, height: 64, borderRadius: 16, backgroundColor: COLORS.surface2, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    sheetCompanyInitial: { fontFamily: 'Syne_800ExtraBold', fontSize: 32, color: COLORS.textPrimary },
    sheetCompanyInfo: { flex: 1 },
    sheetJobTitle: { fontFamily: 'Syne_800ExtraBold', fontSize: 20, color: COLORS.textPrimary, marginBottom: 4 },
    sheetCompanyName: { fontFamily: 'DMSans_500Medium', fontSize: 16, color: COLORS.textMuted, marginBottom: 8 },
    sheetLocationRow: { fontFamily: 'DMSans_400Regular', fontSize: 14, color: COLORS.textPrimary, marginBottom: 4 },
    sheetSalaryRow: { fontFamily: 'DMSans_400Regular', fontSize: 14, color: COLORS.textPrimary, marginBottom: 8 },
    sheetPillsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    sheetPill: { backgroundColor: COLORS.surface2, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    sheetPillText: { fontFamily: 'DMSans_500Medium', fontSize: 12, color: COLORS.textPrimary },
    sheetTimeText: { fontFamily: 'DMSans_400Regular', fontSize: 12, color: COLORS.textMuted },
    sheetSaveBtn: { minWidth: 48, minHeight: 48, padding: 8, backgroundColor: COLORS.surface2, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    sheetTabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: 20 },
    sheetTabActive: { paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: COLORS.accentRed, marginRight: 24 },
    sheetTabTextActive: { fontFamily: 'Syne_800ExtraBold', fontSize: 16, color: COLORS.accentRed },
    sheetTabInactive: { paddingVertical: 12, marginRight: 24 },
    sheetTabTextInactive: { fontFamily: 'DMSans_500Medium', fontSize: 16, color: COLORS.textMuted },
    sheetDescSection: { paddingHorizontal: 20 },
    sheetSectionTitle: { fontFamily: 'Syne_800ExtraBold', fontSize: 20, color: COLORS.textPrimary, marginBottom: 16 },
    sheetDescBox: { backgroundColor: COLORS.surface, padding: 16, borderRadius: 12 },
    sheetDescText: { fontFamily: 'DMSans_400Regular', fontSize: 16, color: COLORS.textPrimary, lineHeight: 24 },
    sheetBottomBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, backgroundColor: COLORS.background, borderTopWidth: 1, borderTopColor: COLORS.border },
    sheetMatchCircle: { alignItems: 'center', marginRight: 20 },
    sheetMatchScore: { fontFamily: 'Syne_800ExtraBold', fontSize: 20, color: COLORS.accentGreen },
    sheetMatchLabel: { fontFamily: 'Syne_800ExtraBold', fontSize: 10, color: COLORS.textMuted, letterSpacing: 1 },
    sheetApplyBtn: { width: '60%', marginLeft: 'auto', backgroundColor: COLORS.accentRed, paddingVertical: 16, borderRadius: 28, alignItems: 'center' },
    sheetApplyBtnText: { fontFamily: 'DMSans_500Medium', fontSize: 16, color: COLORS.background }
});
