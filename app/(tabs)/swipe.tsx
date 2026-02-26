import { Ionicons } from '@expo/vector-icons';
import { BottomSheetFooter, BottomSheetFooterProps, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Extrapolation, FadeIn, interpolate, runOnJS, SlideOutLeft, SlideOutRight, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.15; // Decreased to make swipe much easier

// --- MOCK API ---
const api = {
    getFeed: async () => {
        return new Promise<any[]>((resolve) => {
            setTimeout(() => {
                resolve([
                    {
                        id: '1',
                        company: 'Vercel',
                        location: 'San Francisco, CA',
                        remote: true,
                        title: 'Senior Frontend Engineer',
                        description: `We are looking for a Senior Frontend Engineer to help us build the next generation of our web platform. You will work closely with design and product to build stunning, high-performance interfaces.

At Vercel, our mission is to provide the ultimate workflow for developing, previewing, and shipping web applications. You will be a core contributor to our flagship dashboard interface, used by millions of developers worldwide.

What You Will Do:
• Architect, design, and implement scalable, complex frontend systems using React and Next.js.
• Collaborate with backend engineers to define API contracts and integrate seamless data fetching.
• Mentor junior engineers and drive frontend best practices across the engineering organization.
• Own the entire lifecycle of a feature: from ideation and rapid prototyping to production deployment and monitoring.
• Deeply care about performance, accessibility, and pixel-perfect design implementation.

Qualifications:
• 5+ years of professional experience building web applications in a production environment.
• Deep understanding of React, Next.js, and modern TypeScript patterns.
• Experience with complex state management, performance optimization, and Web Vitals.
• Strong communication skills and a product-focused mindset.

Bonus points if you have experience building component libraries or working with WASM. We value developers who are passionate about the Web and actively contribute to the open-source community.`,
                        skills: [
                            { name: 'React', matched: true },
                            { name: 'Next.js', matched: true },
                            { name: 'TypeScript', matched: true },
                            { name: 'Tailwind CSS', matched: true },
                            { name: 'Node.js', matched: true },
                            { name: 'AWS', matched: true },
                            { name: 'GraphQL', matched: false },
                            { name: 'Performance Optimization', matched: true },
                            { name: 'Accessibility (a11y)', matched: true }
                        ],
                        matchScore: 92
                    },
                    {
                        id: '2',
                        company: 'Stripe',
                        location: 'Dublin, Ireland',
                        remote: false,
                        title: 'Fullstack Developer',
                        description: 'Join the payments team to build scalable infrastructure for millions of businesses worldwide. You will be responsible for end-to-end features.',
                        skills: [{ name: 'TypeScript', matched: true }, { name: 'Node.js', matched: true }, { name: 'Ruby', matched: false }],
                        matchScore: 85
                    },
                    {
                        id: '3',
                        company: 'Spotify',
                        location: 'Stockholm, SE',
                        remote: true,
                        title: 'React Native Engineer',
                        description: 'Help us build robust mobile experiences for millions of creators. Minimum 4 years of experience shipping production React Native apps. Complex animations experience is a bonus.',
                        skills: [{ name: 'React Native', matched: true }, { name: 'TypeScript', matched: true }, { name: 'Swift', matched: false }, { name: 'Kotlin', matched: false }],
                        matchScore: 78
                    }
                ]);
            }, 1000);
        });
    },
    recordSwipe: async (id: string, direction: 'left' | 'right') => {
        console.log(`[API] Swiped ${direction} on job ${id}`);
    }
}

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
                            <Text style={styles.companyInitial}>{job.company.charAt(0)}</Text>
                        </View>
                        <View style={styles.companyInfo}>
                            <Text style={styles.companyName}>{job.company}</Text>
                            <Text style={styles.companyLocation}>📍 {job.location}</Text>
                        </View>
                        {job.remote && (
                            <View style={styles.badgeRemote}>
                                <Text style={styles.badgeRemoteText}>REMOTE</Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.jobTitle} numberOfLines={2}>{job.title}</Text>
                    <View style={styles.skillsRow}>
                        {job.skills.map((skill: any, idx: number) => (
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
                    <Text style={styles.description} numberOfLines={4}>
                        {job.description}
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
    const insets = useSafeAreaInsets();
    const [feed, setFeed] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);

    const bottomSheetModalRef = React.useRef<BottomSheetModal>(null);
    const snapPoints = React.useMemo(() => ['85%', '100%'], []);
    const [selectedJob, setSelectedJob] = useState<any>(null);

    const openJobDetails = (job: any) => {
        setSelectedJob(job);
        bottomSheetModalRef.current?.present();
    };

    useEffect(() => {
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
                            onPress={() => WebBrowser.openBrowserAsync('https://example.com/apply/' + selectedJob.id)}
                        >
                            <Text style={styles.sheetApplyBtnText}>Apply Now</Text>
                        </Pressable>
                    </View>
                </BottomSheetFooter>
            );
        },
        [selectedJob, insets.bottom]
    );

    const loadFeed = async () => {
        setLoading(true);
        const data = await api.getFeed();
        setFeed(data);
        setLoading(false);
    };

    const handleSwipe = (direction: 'left' | 'right') => {
        if (feed.length === 0) return;

        const topJob = feed[0];
        setSwipeDirection(direction);
        api.recordSwipe(topJob.id, direction);

        // Short timeout to let the animation play out before removing from state
        setTimeout(() => {
            setFeed((prev) => prev.slice(1));
            setSwipeDirection(null);
        }, 150);
    };

    const handleSwipeEnd = (direction: 'left' | 'right') => {
        handleSwipe(direction);
    }

    const renderEmptyState = () => (
        <View style={styles.emptyState}>
            <Ionicons name="checkmark-done-circle-outline" size={64} color={COLORS.surface2} />
            <Text style={styles.emptyTitle}>No more jobs today</Text>
            <Text style={styles.emptySubtitle}>You've caught up with all matches.</Text>
            <Pressable style={styles.refreshButton} onPress={loadFeed}>
                <Text style={styles.refreshButtonText}>Refresh</Text>
            </Pressable>
        </View>
    );



    return (
        <GestureHandlerRootView style={styles.container}>
            <StatusBar style="dark" />

            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <View style={styles.orangeCircle}>
                        <Ionicons name="swap-horizontal" size={16} color="white" />
                    </View>
                    <Text style={styles.headerTitle}>Swip<Text style={{ color: COLORS.accentRed }}>turn</Text></Text>
                </View>
                <Pressable style={styles.bellButton}>
                    <Ionicons name="notifications" size={20} color={COLORS.textPrimary} />
                </Pressable>
            </View>

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
                                    <Text style={styles.sheetCompanyInitial}>{selectedJob.company.charAt(0)}</Text>
                                </View>
                                <View style={styles.sheetCompanyInfo}>
                                    <Text style={styles.sheetJobTitle}>{selectedJob.title}</Text>
                                    <Text style={styles.sheetCompanyName}>{selectedJob.company}</Text>

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
                                        <Text style={styles.sheetTimeText}>2 days ago</Text>
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
                                <Text style={styles.sheetDescText}>{selectedJob.description}</Text>
                                <Text style={[styles.sheetDescText, { marginTop: 16 }]}>{selectedJob.description}</Text>
                                <Text style={[styles.sheetDescText, { marginTop: 16 }]}>{selectedJob.description}</Text>
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
    orangeCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.accentRed, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontFamily: 'Syne_800ExtraBold', fontSize: 24, color: COLORS.textPrimary },
    bellButton: { padding: 8 },
    stackContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 110 },
    cardsWrapper: { width: SCREEN_WIDTH * 0.9, height: SCREEN_HEIGHT * 0.65, marginBottom: 10 },
    card: { position: 'absolute', width: '100%', height: '100%', borderRadius: 20, overflow: 'hidden', backgroundColor: COLORS.background },
    cardTop: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 16, flex: 1 },
    companyRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    companyLogo: { width: 48, height: 48, borderRadius: 12, backgroundColor: COLORS.surface2, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    companyInitial: { fontFamily: 'Syne_800ExtraBold', fontSize: 24, color: COLORS.textPrimary },
    companyInfo: { flex: 1 },
    companyName: { fontFamily: 'DMSans_500Medium', fontSize: 16, color: COLORS.textPrimary },
    companyLocation: { fontFamily: 'DMSans_400Regular', fontSize: 14, color: COLORS.textMuted, marginTop: 4 },
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
    refreshButton: { marginTop: 24, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: COLORS.accentRed, borderRadius: 24 },
    refreshButtonText: { fontFamily: 'DMSans_500Medium', fontSize: 16, color: COLORS.background },
    sheetScroll: {},
    sheetHeaderGroup: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
    sheetHeaderBtn: { padding: 8 },
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
    sheetSaveBtn: { padding: 8, backgroundColor: COLORS.surface2, borderRadius: 20 },
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
