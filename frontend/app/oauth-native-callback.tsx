import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

export default function OAuthNativeCallback() {
    // Clerk acts on the `created_session_id` query param automatically
    // via ClerkProvider at the root. We just need to catch the route
    // to prevent crashes, then redirect to root to let the normal
    // auth routing rules in useBootState / index.tsx take over.
    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" />
            <Redirect href="/" />
        </View>
    );
}
