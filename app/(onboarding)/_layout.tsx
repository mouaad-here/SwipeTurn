import { Stack } from 'expo-router';

export default function OnboardingLayout() {
    return (
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <Stack.Screen name="preferences" options={{ title: 'Preferences' }} />
            <Stack.Screen name="preferences-2" options={{ title: 'Preferences 2' }} />
            <Stack.Screen name="preferences-3" options={{ title: 'Preferences 3' }} />
        </Stack>
    );
}
