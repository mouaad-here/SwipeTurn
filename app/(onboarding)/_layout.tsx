import { Stack } from 'expo-router';

export default function OnboardingLayout() {
    return (
        <Stack>
            <Stack.Screen name="preferences" options={{ title: 'Preferences', headerShown: false }} />
        </Stack>
    );
}
