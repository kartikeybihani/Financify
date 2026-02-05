// AnimatedNumber.tsx
// Smooth counting animation component for currency values

import React, { useEffect, useRef, useState, memo } from "react";
import { Text, TextStyle, Animated, Easing } from "react-native";

interface AnimatedNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  decimals?: number;
  style?: TextStyle;
  formatOptions?: {
    useKM?: boolean;
    currency?: string;
  };
}

/**
 * AnimatedNumber - Smoothly animates between number values
 * 
 * Usage:
 * <AnimatedNumber value={1234.56} prefix="$" duration={300} />
 * 
 * Features:
 * - Smooth counting animation up or down
 * - Configurable duration
 * - Currency formatting support
 * - K/M abbreviation support
 */
export const AnimatedNumber: React.FC<AnimatedNumberProps> = memo(
  ({
    value,
    prefix = "",
    suffix = "",
    duration = 300,
    decimals = 0,
    style,
    formatOptions = {},
  }) => {
    const animatedValue = useRef(new Animated.Value(value)).current;
    const [displayValue, setDisplayValue] = useState(value);
    const previousValue = useRef(value);
    const isFirstRender = useRef(true);

    // Currency formatter cache
    const formatterRef = useRef<Intl.NumberFormat | null>(null);

    const getFormatter = () => {
      if (!formatterRef.current) {
        formatterRef.current = new Intl.NumberFormat("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
      }
      return formatterRef.current;
    };

    const formatNumber = (num: number): string => {
      const { useKM = false } = formatOptions;

      if (useKM) {
        if (Math.abs(num) >= 1000000) {
          return getFormatter().format(num / 1000000) + "M";
        }
        if (Math.abs(num) >= 1000) {
          return getFormatter().format(num / 1000) + "K";
        }
      }

      return getFormatter().format(num);
    };

    useEffect(() => {
      // Skip animation on first render - show value immediately
      if (isFirstRender.current) {
        isFirstRender.current = false;
        setDisplayValue(value);
        animatedValue.setValue(value);
        previousValue.current = value;
        return;
      }

      // Skip animation if value hasn't changed
      if (value === previousValue.current) {
        return;
      }

      // Reset formatter if decimals changed
      formatterRef.current = null;

      // Animate from previous value to new value
      animatedValue.setValue(previousValue.current);

      // Create listener to update display value during animation
      const listenerId = animatedValue.addListener(({ value: animValue }) => {
        setDisplayValue(animValue);
      });

      // Run the animation
      Animated.timing(animatedValue, {
        toValue: value,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false, // Required for text value animation
      }).start(() => {
        // Ensure we end on exact value
        setDisplayValue(value);
      });

      previousValue.current = value;

      return () => {
        animatedValue.removeListener(listenerId);
      };
    }, [value, duration, animatedValue]);

    // Format the display value
    const formattedValue = formatNumber(displayValue);

    return (
      <Text style={style}>
        {prefix}
        {formattedValue}
        {suffix}
      </Text>
    );
  }
);

AnimatedNumber.displayName = "AnimatedNumber";

/**
 * AnimatedCurrency - Preset for currency animation
 * Convenience wrapper with $ prefix
 */
export const AnimatedCurrency: React.FC<
  Omit<AnimatedNumberProps, "prefix"> & { showSign?: boolean }
> = memo(({ value, showSign = false, ...props }) => {
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  
  let prefix = "$";
  if (showSign) {
    prefix = isNegative ? "-$" : "+$";
  } else if (isNegative) {
    prefix = "-$";
  }

  return <AnimatedNumber value={absValue} prefix={prefix} {...props} />;
});

AnimatedCurrency.displayName = "AnimatedCurrency";

export default AnimatedNumber;
