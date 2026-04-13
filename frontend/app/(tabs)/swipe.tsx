import { API_URL } from '@/constants/api';
import { COLORS, COLORS_ALPHA } from '@/constants/colors';
import { useAuthHeaders } from '@/hooks/useAuthHeaders';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { BottomSheetFooter, BottomSheetFooterProps, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Extrapolation, FadeIn, interpolate, runOnJS, SlideOutLeft, SlideOutRight, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../../store/appStore';

const PAGE_SIZE = 20;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.10; // Easy swipe: ~10% of screen width

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

const SwipeCard = ({ job, index, isTopCard, swipeDirection, handleSwipeEnd, onCardTap, hasCv }: any) => {
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
                                <View style={styles.locationRow}>
                                    <Ionicons name="location-outline" size={13} color={COLORS.textMuted} />
                                    <Text style={styles.companyLocation}>{job.location}</Text>
                                </View>
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
                    <Text style={styles.description} numberOfLines={3}>
                        {job.description != null ? String(job.description) : ''}
                    </Text>
                </View>

                <View style={[styles.cardBottom, !hasCv && { display: 'none' }]}>
                    <View style={styles.matchRow}>
                        <Text style={styles.matchLabel}>CV Match <Text style={styles.matchScore}>{Math.round(job.matchScore || 0)}%</Text></Text>
                    </View>
                    <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${Math.round(job.matchScore || 0)}%` }]} />
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
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
    const [remainingToday, setRemainingToday] = useState<number | null>(null);
    const [nextResetAt, setNextResetAt] = useState<string | null>(null);
    const [batchExhausted, setBatchExhausted] = useState(false);
    const bottomSheetModalRef = React.useRef<BottomSheetModal>(null);
    const snapPoints = React.useMemo(() => ['85%', '100%'], []);
    const [selectedJob, setSelectedJob] = useState<any>(null);
    const [hasCv, setHasCv] = useState<boolean>(false);
    const feedLoadedRef = useRef(false);
    const loadingRef = useRef(false);
    const isFetchingRef = useRef(false);

    const openJobDetails = (job: any) => {
        setSelectedJob(job);
        bottomSheetModalRef.current?.present();
    };

    // Load feed once on mount
    useEffect(() => {
        if (feedLoadedRef.current) return;
        feedLoadedRef.current = true;
        loadFeed(1);
    }, []);

    const renderFooter = React.useCallback(
        (props: BottomSheetFooterProps) => {
            if (!selectedJob) return null;
            return (
                <BottomSheetFooter {...props} bottomInset={0}>
                    <View style={[styles.sheetBottomBar, { paddingBottom: Math.max(insets.bottom, 24) }]}>
                        {hasCv ? (
                            <View style={styles.sheetMatchCircle}>
                                <Text style={styles.sheetMatchScore}>{Math.round(selectedJob.matchScore || 0)}%</Text>
                                <Text style={styles.sheetMatchLabel}>MATCH</Text>
                            </View>
                        ) : <View style={{ width: 10, marginRight: 'auto' }} />}
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

    // Whenever the user navigates back to the Swipe tab, refresh the feed so that
    // changes made in Profile (geography, seniority, job type, domains, CV) are
    // reflected in the recommendations.
    useFocusEffect(
        React.useCallback(() => {
            // Batch window is server-driven; just reload page 1 silently on focus
            loadFeed(1, false, true);
        }, [])
    );

    const loadFeed = async (targetPage = 1, append = false, silent = false) => {
        if (loadingRef.current) return;
        
        // Robust parallel request protection
        if (append && isFetchingRef.current) return;

        loadingRef.current = true;
        if (!silent && !append) setLoading(true);
        if (append) {
            setIsFetchingMore(true);
            isFetchingRef.current = true;
        }

        try {
            const headers = await getAuthHeaders();

            if (targetPage === 1) {
                fetch(`${API_URL}/users/me`, { headers }).then(async r => {
                    if (r.ok) {
                        const profileData = await r.json();
                        setHasCv(!!profileData.has_cv);
                    }
                }).catch(() => { });
            }

            const response = await fetch(`${API_URL}/jobs/feed?page=${targetPage}&limit=${PAGE_SIZE}`, {
                headers: { ...headers }
            });

            if (response.status === 401 || response.status === 403) {
                if (!append) {
                    setFeed([]);
                    setPage(1);
                    setHasMore(true);
                }
                setError("Authentication error. Please log in again.");
                loadingRef.current = false;
                setLoading(false);
                setIsFetchingMore(false);
                isFetchingRef.current = false;
                return;
            }

            if (!response.ok) {
                console.error("Failed to fetch jobs feed", response.status);
                if (!silent && !append) {
                    setFeed([]);
                    setPage(1);
                    setHasMore(true);
                }
                setError(`Server returned error ${response.status}.`);
                loadingRef.current = false;
                setLoading(false);
                setIsFetchingMore(false);
                isFetchingRef.current = false;
                return;
            }

            setError(null);
            const data = await response.json();
            const rawJobs = Array.isArray(data.jobs) ? data.jobs : [];

            // Consume new batch fields from API
            const batchExhaustedFromApi = !!data.batch_exhausted;
            const remainingFromApi = typeof data.remaining_today === 'number' ? data.remaining_today : null;
            const nextResetFromApi = data.next_reset_at || null;
            const totalReturned = data.total_returned || 0;

            setBatchExhausted(batchExhaustedFromApi);
            if (remainingFromApi !== null) setRemainingToday(remainingFromApi);
            if (nextResetFromApi) setNextResetAt(nextResetFromApi);

            const isExhausted = batchExhaustedFromApi || totalReturned === 0;

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
                const locationDisplay = [job.city, job.country_code].filter(Boolean).join(', ') || (job.location != null ? String(job.location) : 'Unknown');
                return {
                    id: job.id,
                    company,
                    location: locationDisplay,
                    city: job.city,
                    remote: !!job.is_remote,
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

            setPage(targetPage);
            setHasMore(!isExhausted);

            // pure setFeed
            setFeed(prev => {
                const base = append ? prev : [];
                const seen = new Set(base.map(j => j.id));
                const next = [...base];
                for (const job of mappedJobs) {
                    if (!job.id || seen.has(job.id)) continue;
                    seen.add(job.id);
                    next.push(job);
                }
                return next;
            });


        } catch (fetchError) {
            console.error("Feed error:", fetchError, "| API_URL:", `${API_URL}/jobs/feed`);
            if (!silent && !append) {
                setFeed([]);
                setGeographyMode('both');
                setPage(1);
                setHasMore(true);
                setError("Network error. Make sure your local API_URL is using your computer's IP address instead of localhost.");
            }
        } finally {
            loadingRef.current = false;
            setLoading(false);
            setIsFetchingMore(false);
            isFetchingRef.current = false;
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
            // handleSwipeEnd should only remove the swiped card
            setFeed(prev => prev.slice(1));
            setSwipeDirection(null);
        }, 150);

        // Async record swipe to backend
        try {
            const headers = await getAuthHeaders();
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



    // Auto-pagination effect — only fetch more if batch is not exhausted
    useEffect(() => {
        if (feed.length > 0 && feed.length <= 5 && hasMore && !batchExhausted && !isFetchingRef.current && !loading) {
            loadFeed(page + 1, true, true);
        }
    }, [feed.length, hasMore, batchExhausted, page, loading]);

    const formatCountdown = (isoString: string | null): string => {
        if (!isoString) return 'tomorrow at 8 AM';
        try {
            const diff = new Date(isoString).getTime() - Date.now();
            if (diff <= 0) return 'soon';
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            if (h === 0) return `${m}m`;
            return `${h}h ${m}m`;
        } catch { return 'tomorrow at 8 AM'; }
    };

    const renderEmptyState = () => (
        <View style={styles.emptyState}>
            {error ? (
                <>
                    <Ionicons name="cloud-offline-outline" size={64} color={COLORS.accent} />
                    <Text style={styles.emptyTitle}>Connection Issue</Text>
                    <Text style={styles.emptySubtitle}>{error}</Text>
                </>
            ) : batchExhausted ? (
                <>
                    <Ionicons name="checkmark-done-circle-outline" size={64} color={COLORS.surface2} />
                    <Text style={styles.emptyTitle}>You're all caught up!</Text>
                    <Text style={styles.emptySubtitle}>
                        New jobs arrive in {formatCountdown(nextResetAt)}.
                    </Text>
                </>
            ) : (
                <>
                    <Ionicons name="checkmark-done-circle-outline" size={64} color={COLORS.surface2} />
                    <Text style={styles.emptyTitle}>No more jobs today</Text>
                    <Text style={styles.emptySubtitle}>You've caught up with all matches.</Text>
                </>
            )}
            <Pressable 
                style={styles.refreshButton} 
                onPress={() => {
                    setHasMore(true);
                    setError(null);
                    setBatchExhausted(false);
                    loadFeed(1, false, false);
                }}
            >
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
                    <Text style={styles.headerTitle}>Swipe<Text style={{ color: COLORS.accent }}>Turn</Text></Text>
                </View>
                <Pressable style={styles.bellButton} hitSlop={12}>
                    <Ionicons name="notifications" size={20} color={COLORS.textPrimary} />
                </Pressable>
            </View>

            {/* Cards Stack */}
            <View style={styles.stackContainer}>
                {loading ? (
                    <ActivityIndicator size="large" color={COLORS.accent} style={{ marginTop: 100 }} />
                ) : (feed.length === 0) ? (
                    renderEmptyState()
                ) : (
                    <View style={styles.cardsWrapper}>
                        {/* Render backwards so index 0 is on top */}
                        {feed.slice(0, 3).reverse().map((job, reverseIndex, arr) => {
                            // Calculate actual index based on the reversed array to pass to renderCard
                            const actualIndex = arr.length - 1 - reverseIndex;
                            return <SwipeCard key={job.id} job={job} index={actualIndex} isTopCard={actualIndex === 0} swipeDirection={swipeDirection} handleSwipeEnd={handleSwipeEnd} onCardTap={openJobDetails} hasCv={hasCv} />;
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
                            <Text style={styles.instructionText}>Swipe right to <Text style={[styles.instructionTextBold, { color: COLORS.accentSuccess }]}>Save</Text></Text>
                            <View style={[styles.instructionIconBox, { backgroundColor: COLORS_ALPHA.successMedium }]}>
                                <Ionicons name="heart" size={16} color={COLORS.accentSuccess} />
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

                        </View>

                        <View style={styles.sheetSkillsSection}>
                            <Text style={styles.sheetSectionTitle}>Required Skills</Text>
                            <View style={styles.sheetSkillsRow}>
                                {(Array.isArray(selectedJob.skills) ? selectedJob.skills : []).map((skill: any, idx: number) => (
                                    <View key={idx} style={[styles.sheetSkillChip, skill.matched ? styles.sheetSkillChipMatched : styles.sheetSkillChipUnmatched]}>
                                        {skill.matched ? (
                                            <View style={styles.sheetSkillMatchedRow}>
                                                <Ionicons name="checkmark-circle" size={13} color={COLORS.accentSuccess} />
                                                <Text style={styles.sheetSkillTextMatched}>{skill.name}</Text>
                                            </View>
                                        ) : (
                                            <View style={styles.sheetSkillContentUnmatched}>
                                                <View style={styles.sheetGreyDot} />
                                                <Text style={styles.sheetSkillTextUnmatched}>{skill.name}</Text>
                                            </View>
                                        )}
                                    </View>
                                ))}
                            </View>
                        </View>

                        <View style={styles.sheetDescSection}>
                            <Text style={styles.sheetSectionTitle}>Job Description</Text>
                            <Text style={styles.sheetDescText}>{(selectedJob.descriptionFull ?? selectedJob.description) != null ? String(selectedJob.descriptionFull ?? selectedJob.description) : 'No description available.'}</Text>
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
    orangeCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: COLORS.accent,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: COLORS.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    headerTitle: { fontFamily: 'ClashDisplay-Bold', fontSize: 24, color: COLORS.textPrimary },
    bellButton: { minWidth: 48, minHeight: 48, padding: 8, justifyContent: 'center', alignItems: 'center' },
    stackContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 110 },
    cardsWrapper: { width: SCREEN_WIDTH * 0.9, height: SCREEN_HEIGHT * 0.65, marginBottom: 10 },
    card: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        borderRadius: 24,
        backgroundColor: COLORS.surface,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
        elevation: 8,
    },
    cardTop: { paddingHorizontal: 24, paddingBottom: 20, paddingTop: 20, flex: 1 },
    companyRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    companyLogo: {
        width: 52,
        height: 52,
        borderRadius: 14,
        backgroundColor: COLORS.surface2,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
        borderWidth: 1,
        borderColor: COLORS.border
    },
    companyInitial: { fontFamily: 'ClashDisplay-Bold', fontSize: 26, color: COLORS.textPrimary },
    companyInfo: { flex: 1 },
    companyName: { fontFamily: 'Satoshi-Bold', fontSize: 16, color: COLORS.textPrimary, letterSpacing: -0.2 },
    companyMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    companyLocation: { fontFamily: 'Satoshi-Medium', fontSize: 14, color: COLORS.textMuted },
    postedBadge: { fontFamily: 'Satoshi-Bold', fontSize: 12, color: COLORS.accent },
    badgeRemote: { backgroundColor: COLORS_ALPHA.successLight, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
    badgeRemoteText: { fontFamily: 'Satoshi-Bold', fontSize: 12, color: COLORS.accentSuccess, letterSpacing: 0.5 },
    jobTitle: { fontFamily: 'Satoshi-Black', fontSize: 22, color: COLORS.textPrimary, lineHeight: 30, marginBottom: 16, letterSpacing: -0.5 },
    skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
    skillChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
    skillChipMatched: { backgroundColor: COLORS_ALPHA.successLight, borderColor: COLORS.accentSuccess },
    skillChipUnmatched: { backgroundColor: COLORS.surface, borderColor: COLORS.border },
    skillChipTextMatched: { fontFamily: 'Satoshi-Medium', fontSize: 12, color: COLORS.accentSuccess },
    skillChipContentUnmatched: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    greyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.textMuted },
    skillChipTextUnmatched: { fontFamily: 'Satoshi-Regular', fontSize: 12, color: COLORS.textMuted },
    description: { fontFamily: 'Satoshi-Regular', fontSize: 16, color: COLORS.textPrimary, lineHeight: 24 },
    cardBottom: { padding: 16, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
    matchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    matchLabel: { fontFamily: 'Satoshi-Medium', fontSize: 12, color: COLORS.textMuted },
    matchScore: { fontFamily: 'Satoshi-Bold', fontSize: 14, color: COLORS.accentSuccess },
    recommendedLabel: { fontFamily: 'ClashDisplay-Bold', fontSize: 7.5, color: COLORS.textPrimary, letterSpacing: 0.5 },
    progressTrack: { height: 8, backgroundColor: COLORS.surface2, borderRadius: 4, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: COLORS.accentSuccess },
    indicator: { position: 'absolute', top: 40, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 4, borderRadius: 10, transform: [{ rotate: '-15deg' }] },
    indicatorLike: { right: 40, borderColor: COLORS.accentSuccess },
    indicatorTextLike: { fontFamily: 'ClashDisplay-Bold', fontSize: 32, color: COLORS.accentSuccess, letterSpacing: 2 },
    indicatorPass: { left: 40, borderColor: COLORS.accent },
    indicatorTextPass: { fontFamily: 'ClashDisplay-Bold', fontSize: 32, color: COLORS.accent, letterSpacing: 2 },
    instructionRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20, marginTop: 10, gap: 8 },
    instructionSide: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    instructionIconBox: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    instructionText: { fontFamily: 'Satoshi-Regular', fontSize: 12, color: COLORS.textMuted },
    instructionTextBold: { fontFamily: 'Satoshi-Medium', color: COLORS.textPrimary },
    instructionDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
    emptyState: { alignItems: 'center', justifyContent: 'center', padding: 40 },
    emptyTitle: { fontFamily: 'ClashDisplay-Bold', fontSize: 24, color: COLORS.textPrimary, marginTop: 16 },
    emptySubtitle: { fontFamily: 'Satoshi-Regular', fontSize: 16, color: COLORS.textMuted, marginTop: 8, textAlign: 'center' },
    refreshButton: { marginTop: 24, paddingHorizontal: 24, paddingVertical: 12, minHeight: 48, justifyContent: 'center', backgroundColor: COLORS.accent, borderRadius: 24 },
    refreshButtonText: { fontFamily: 'Satoshi-Medium', fontSize: 16, color: '#FFFFFF' },
    sheetScroll: {},
    sheetHeaderGroup: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
    sheetHeaderBtn: { minWidth: 48, minHeight: 48, padding: 8, justifyContent: 'center', alignItems: 'center' },
    sheetHeaderTitle: { fontFamily: 'ClashDisplay-Bold', fontSize: 18, color: COLORS.textPrimary },
    sheetCard: { paddingHorizontal: 20 },
    sheetCompanyRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
    sheetCompanyLogo: { width: 64, height: 64, borderRadius: 16, backgroundColor: COLORS.surface2, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    sheetCompanyInitial: { fontFamily: 'ClashDisplay-Bold', fontSize: 32, color: COLORS.textPrimary },
    sheetCompanyInfo: { flex: 1 },
    sheetJobTitle: { fontFamily: 'ClashDisplay-Bold', fontSize: 20, color: COLORS.textPrimary, marginBottom: 4 },
    sheetCompanyName: { fontFamily: 'Satoshi-Medium', fontSize: 16, color: COLORS.textMuted, marginBottom: 8 },
    sheetLocationRow: { fontFamily: 'Satoshi-Regular', fontSize: 14, color: COLORS.textPrimary, marginBottom: 4 },
    sheetSalaryRow: { fontFamily: 'Satoshi-Regular', fontSize: 14, color: COLORS.textPrimary, marginBottom: 8 },
    sheetPillsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    sheetPill: { backgroundColor: COLORS.surface2, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    sheetPillText: { fontFamily: 'Satoshi-Medium', fontSize: 12, color: COLORS.textPrimary },
    sheetTimeText: { fontFamily: 'Satoshi-Regular', fontSize: 12, color: COLORS.textMuted },
    sheetSaveBtn: { minWidth: 48, minHeight: 48, padding: 8, backgroundColor: COLORS.surface2, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    sheetTabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: 20 },
    sheetTabActive: { paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: COLORS.accent, marginRight: 24 },
    sheetTabTextActive: { fontFamily: 'ClashDisplay-Bold', fontSize: 16, color: COLORS.accent },
    sheetTabInactive: { paddingVertical: 12, marginRight: 24 },
    sheetTabTextInactive: { fontFamily: 'Satoshi-Medium', fontSize: 16, color: COLORS.textMuted },
    sheetSkillsSection: { paddingHorizontal: 20, marginBottom: 16 },
    sheetSkillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    sheetSkillChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
    sheetSkillChipMatched: { backgroundColor: COLORS_ALPHA.successLight, borderColor: COLORS.accentSuccess },
    sheetSkillChipUnmatched: { backgroundColor: COLORS.surface, borderColor: COLORS.border },
    sheetSkillMatchedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    sheetSkillTextMatched: { fontFamily: 'Satoshi-Medium', fontSize: 12, color: COLORS.accentSuccess },
    sheetSkillContentUnmatched: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    sheetGreyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.textMuted },
    sheetSkillTextUnmatched: { fontFamily: 'Satoshi-Regular', fontSize: 12, color: COLORS.textMuted },
    sheetDescSection: { paddingHorizontal: 20, paddingBottom: 8 },
    sheetSectionTitle: { fontFamily: 'ClashDisplay-Bold', fontSize: 20, color: COLORS.textPrimary, marginBottom: 16 },
    sheetDescText: { fontFamily: 'Satoshi-Regular', fontSize: 16, color: COLORS.textSecondary, lineHeight: 26 },
    sheetBottomBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, backgroundColor: COLORS.background, borderTopWidth: 1, borderTopColor: COLORS.border },
    sheetMatchCircle: { alignItems: 'center', marginRight: 20 },
    sheetMatchScore: { fontFamily: 'ClashDisplay-Bold', fontSize: 20, color: COLORS.accentSuccess },
    sheetMatchLabel: { fontFamily: 'ClashDisplay-Bold', fontSize: 10, color: COLORS.textMuted, letterSpacing: 1 },
    sheetApplyBtn: {
        width: '60%',
        marginLeft: 'auto',
        backgroundColor: COLORS.accent,
        paddingVertical: 18,
        borderRadius: 32,
        alignItems: 'center',
        shadowColor: COLORS.accent,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 6,
    },
    sheetApplyBtnText: { fontFamily: 'Satoshi-Bold', fontSize: 17, color: '#FFFFFF', letterSpacing: 0.5 }
});
