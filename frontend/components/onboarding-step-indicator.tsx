import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';

const PROGRESS_BAR_WIDTH = 80;

interface OnboardingStepIndicatorProps {
  step: number;
  total: number;
}

export function OnboardingStepIndicator({ step, total }: OnboardingStepIndicatorProps) {
  const progress = useSharedValue(step / total);

  useEffect(() => {
    progress.value = withTiming(step / total, { duration: 300 });
  }, [step, total, progress]);

  const animatedFill = useAnimatedStyle(() => ({
    width: PROGRESS_BAR_WIDTH * progress.value,
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, animatedFill]} />
      </View>
      <Text style={styles.text}>
        {step} / {total}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  track: {
    width: PROGRESS_BAR_WIDTH,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
  text: {
    fontFamily: 'Satoshi-Regular',
    fontSize: 14,
    color: COLORS.textMeta,
  },
});
