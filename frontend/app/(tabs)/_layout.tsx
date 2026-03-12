import { useAuth } from '@clerk/clerk-expo';
import { Tabs, useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';

import { CustomTabBar } from '../../components/CustomTabBar';

/**
 * Auth guard that ONLY redirects on logout transitions (signed-in → signed-out).
 *
 * Why a ref? Guest users (isSignedIn=false from first render) are legitimate
 * tab users. Redirecting ALL non-signed-in users causes an infinite loop
 * because Welcome → "Continue without account" → onboarding → tabs → redirect → ...
 *
 * By tracking the PREVIOUS auth state, we only fire the redirect when a user
 * who WAS authenticated becomes unauthenticated (i.e. explicit logout or
 * token expiry). This is the production-quality pattern for mixed auth apps.
 */
function useLogoutRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const wasSignedIn = useRef<boolean | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    // First load — record whether we're signed in, don't redirect
    if (wasSignedIn.current === null) {
      wasSignedIn.current = !!isSignedIn;
      return;
    }

    // Detect transition: was signed in, now not → this is a real logout
    if (wasSignedIn.current && !isSignedIn) {
      wasSignedIn.current = false;
      router.dismissAll();
      router.replace('/');
      return;
    }

    // Update tracking for any other transitions (e.g., guest → signed in)
    wasSignedIn.current = !!isSignedIn;
  }, [isLoaded, isSignedIn]);
}

export default function TabLayout() {
  useLogoutRedirect();

  return (
    <Tabs
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}>
      <Tabs.Screen
        name="swipe"
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: 'Saved',
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Search',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="index"
        options={{ href: null }}
      />
    </Tabs>
  );
}
