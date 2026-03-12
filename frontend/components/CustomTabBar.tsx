import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';

const COLORS = {
    background: '#FFFFFF', // Light background
    inactiveBg: '#F3F4F6', // Light grayish pill inactive
    activeBg: '#FF4422', // Accent red
    textActive: '#FFFFFF',
    textInactive: '#6B7280',
    iconActive: '#FFFFFF',
    iconInactive: '#1F2937', // Dark slate for inactive icons
};

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
    const ALLOWED_ROUTES = ['swipe', 'explore', 'saved', 'profile'];
    const routes = state.routes.filter(
        route => {
            const { options } = descriptors[route.key];
            return options.href !== null && ALLOWED_ROUTES.includes(route.name);
        }
    );

    return (
        <View style={styles.wrapper}>
            <View style={styles.container}>
                {routes.map((route, index) => {
                    const { options } = descriptors[route.key];
                    const label = options.tabBarLabel !== undefined
                        ? options.tabBarLabel
                        : options.title !== undefined
                            ? options.title
                            : route.name;

                    const isFocused = state.index === state.routes.findIndex(r => r.key === route.key);

                    const onPress = () => {
                        const event = navigation.emit({
                            type: 'tabPress',
                            target: route.key,
                            canPreventDefault: true,
                        });

                        if (!isFocused && !event.defaultPrevented) {
                            navigation.navigate(route.name);
                        }
                    };

                    const getIcon = () => {
                        const iconColor = isFocused ? COLORS.iconActive : COLORS.iconInactive;
                        switch (route.name) {
                            case 'swipe':
                                return <Ionicons name={isFocused ? "albums" : "albums-outline"} size={22} color={iconColor} />;
                            case 'saved':
                                return <Ionicons name={isFocused ? "bookmark" : "bookmark-outline"} size={22} color={iconColor} />;
                            case 'explore':
                                return <Ionicons name={isFocused ? "search" : "search-outline"} size={22} color={iconColor} />;
                            case 'profile':
                                return <Ionicons name={isFocused ? "person" : "person-outline"} size={22} color={iconColor} />;
                            default:
                                return <Ionicons name="home-outline" size={24} color={iconColor} />;
                        }
                    };

                    return (
                        <TabItem
                            key={route.key}
                            label={label as string}
                            isFocused={isFocused}
                            onPress={onPress}
                            icon={getIcon()}
                        />
                    );
                })}
            </View>
        </View>
    );
}

function TabItem({ label, isFocused, onPress, icon }: { label: string, isFocused: boolean, onPress: () => void, icon: React.ReactNode }) {
    const animatedStyle = useAnimatedStyle(() => ({
        width: withTiming(isFocused ? 100 : 56, { duration: 220 }),
        backgroundColor: withTiming(isFocused ? COLORS.activeBg : COLORS.inactiveBg, { duration: 220 }),
    }));

    const textAnimatedStyle = useAnimatedStyle(() => ({
        opacity: withTiming(isFocused ? 1 : 0, { duration: 220 }),
    }));

    return (
        <Pressable onPress={onPress}>
            <Animated.View style={[styles.tabItem, animatedStyle]}>
                <View style={styles.iconContainer}>
                    {icon}
                </View>
                {isFocused && (
                    <Animated.View style={[styles.labelContainer, textAnimatedStyle]}>
                        <Text style={styles.labelText} numberOfLines={1}>{label}</Text>
                    </Animated.View>
                )}
            </Animated.View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        position: 'absolute',
        bottom: 45, // Boosted to clear device home bars
        left: 0,
        right: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
    container: {
        flexDirection: 'row',
        backgroundColor: COLORS.background,
        padding: 8,
        borderRadius: 100, // Pill shape
        gap: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    tabItem: {
        height: 56,
        borderRadius: 50,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    iconContainer: {
        width: 56,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
    },
    labelContainer: {
        marginRight: 20,
        marginLeft: -4,
    },
    labelText: {
        color: COLORS.textActive,
        fontFamily: 'Satoshi-Medium',
        fontSize: 14,
    }
});
