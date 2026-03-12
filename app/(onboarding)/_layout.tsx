import { COLORS } from '@/constants/colors';
import { Stack } from 'expo-router';

export default function OnboardingLayout() {
    return (
        <Stack screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            gestureEnabled: false,
            contentStyle: { backgroundColor: COLORS.surface }
        }}>
            <Stack.Screen name="geography" options={{ title: 'Geography' }} />
            <Stack.Screen name="seniority" options={{ title: 'Seniority' }} />
            <Stack.Screen name="job-type" options={{ title: 'Job Type' }} />
            <Stack.Screen name="domains" options={{ title: 'Domains' }} />
            <Stack.Screen name="skills" options={{ title: 'Skills' }} />
            <Stack.Screen name="preview" options={{ title: 'Preview' }} />
        </Stack>
    );
}
