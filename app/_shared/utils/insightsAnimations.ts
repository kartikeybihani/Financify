import { Animated, Easing } from 'react-native';

export interface AnimationConfig {
  duration: number;
  delay: number;
  easing: any;
  useNativeDriver: boolean;
}

export class InsightsAnimationManager {
  /**
   * Create staggered entrance animations for list items
   */
  static createStaggeredAnimations(
    count: number,
    baseDelay: number = 150,
    duration: number = 500
  ): Animated.Value[] {
    return Array(count)
      .fill(0)
      .map((_, index) => new Animated.Value(0))
      .map((anim, index) => {
        // Start animation with staggered delay
        Animated.timing(anim, {
          toValue: 1,
          duration,
          delay: index * baseDelay,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
        
        return anim;
      });
  }

  /**
   * Create fade-in animation for sections
   */
  static createSectionFadeIn(delay: number = 0): Animated.Value {
    const anim = new Animated.Value(0);
    
    Animated.timing(anim, {
      toValue: 1,
      duration: 600,
      delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    
    return anim;
  }

  /**
   * Create slide-in animation for sections
   */
  static createSectionSlideIn(delay: number = 0, fromRight: boolean = true): Animated.Value {
    const anim = new Animated.Value(fromRight ? 50 : -50);
    
    Animated.timing(anim, {
      toValue: 0,
      duration: 500,
      delay,
      easing: Easing.out(Easing.back(1.1)),
      useNativeDriver: true,
    }).start();
    
    return anim;
  }

  /**
   * Create scale animation for cards
   */
  static createCardScaleAnimation(delay: number = 0): Animated.Value {
    const anim = new Animated.Value(0.8);
    
    Animated.timing(anim, {
      toValue: 1,
      duration: 400,
      delay,
      easing: Easing.out(Easing.back(1.2)),
      useNativeDriver: true,
    }).start();
    
    return anim;
  }

  /**
   * Create pulse animation for loading states
   */
  static createPulseAnimation(): Animated.Value {
    const anim = new Animated.Value(1);
    
    const pulse = () => {
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1.05,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => pulse());
    };
    
    pulse();
    return anim;
  }

  /**
   * Create shimmer animation for skeleton loading
   */
  static createShimmerAnimation(): Animated.Value {
    const anim = new Animated.Value(0);
    
    const shimmer = () => {
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => shimmer());
    };
    
    shimmer();
    return anim;
  }

  /**
   * Create bounce animation for success states
   */
  static createBounceAnimation(): Animated.Value {
    const anim = new Animated.Value(1);
    
    Animated.sequence([
      Animated.timing(anim, {
        toValue: 1.2,
        duration: 200,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.timing(anim, {
        toValue: 1,
        duration: 200,
        easing: Easing.in(Easing.back(1.5)),
        useNativeDriver: true,
      }),
    ]).start();
    
    return anim;
  }

  /**
   * Get interpolated styles for common animations
   */
  static getInterpolatedStyles(anim: Animated.Value) {
    return {
      opacity: anim,
      transform: [
        {
          translateY: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [20, 0],
          }),
        },
        {
          scale: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.95, 1],
          }),
        },
      ],
    };
  }

  /**
   * Get slide-in styles
   */
  static getSlideInStyles(anim: Animated.Value, fromRight: boolean = true) {
    return {
      opacity: anim.interpolate({
        inputRange: fromRight ? [50, 0] : [-50, 0],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
      transform: [
        {
          translateX: anim,
        },
      ],
    };
  }
}
