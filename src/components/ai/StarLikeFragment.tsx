// src/components/ai/StarLikeFragment3D.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { MathUtils } from 'three';
import useTypewriter from './hooks/useTypewriter';

interface StarLikeFragment3DProps {
  fragment: string;
  isLightTheme: boolean;
  customInitialDelay: number;
  textColorLight?: string;
  textColorDark?: string;
  fontSize?: number;
  maxWidth?: number;
  lineHeight?: number;
  volumeCenter?: THREE.Vector3; // Center of the spherical volume
  volumeRadius?: number;      // Radius of the spherical volume
}

enum AnimationState {
  Delayed,
  FadingIn,
  Typing,
  Holding,
  FadingOut,
  Paused,
}

const StarLikeFragment3D: React.FC<StarLikeFragment3DProps> = ({
  fragment,
  isLightTheme,
  customInitialDelay,
  textColorLight = '#0a0a0a',
  textColorDark = '#f0f0f0',
  fontSize = 0.1,
  maxWidth = 2.5,
  lineHeight = 1.4,
  volumeCenter = new THREE.Vector3(0, 0, -2), // Default slightly in front of camera
  volumeRadius = 1.5,
}) => {
  const textRef = useRef<any>(null!); // THREE.Mesh for Text from drei
  const [currentText, setCurrentText] = useState('');
  const [opacity, setOpacity] = useState(0);
  const [currentPosition, setCurrentPosition] = useState<THREE.Vector3>(new THREE.Vector3());
  
  const animationStateRef = useRef<AnimationState>(AnimationState.Delayed);
  const timerRef = useRef<number>(0);

  const baseVisibleDuration = useMemo(() => Math.random() * 1.5 + 2.0, []); // 2.0s - 3.5s
  const baseRepeatDelay = useMemo(() => Math.random() * 2.0 + 3.0, []);   // 3.0s - 5.0s
  const fadeInSpeed = 2.0; // Opacity units per second
  const fadeOutSpeed = 1.5; // Opacity units per second

  const typewriterSpeed = 20; // Characters per second

  const {
    displayedText,
    startTyping: startTypewriter,
    pauseTyping: pauseTypewriter,
    resetTypewriter,
    isFinished: typewriterFinished,
  } = useTypewriter(fragment, typewriterSpeed, true); // Start paused

  const generateNewPosition = useCallback(() => {
    // Random point in a sphere
    const phi = Math.random() * Math.PI * 2;
    const costheta = Math.random() * 2 - 1;
    const u = Math.random();

    const theta = Math.acos(costheta);
    const r = volumeRadius * Math.cbrt(u);

    const x = r * Math.sin(theta) * Math.cos(phi);
    const y = r * Math.sin(theta) * Math.sin(phi);
    const z = r * Math.cos(theta);

    return new THREE.Vector3(x,y,z).add(volumeCenter);
  }, [volumeRadius, volumeCenter]);

  const setupNextCycle = useCallback(() => {
    const textToDisplayThisCycle = fragment; // Can add logic for partial fragments if needed
    resetTypewriter(textToDisplayThisCycle);
    setCurrentPosition(generateNewPosition());
    animationStateRef.current = AnimationState.FadingIn;
    timerRef.current = 0;
  }, [fragment, resetTypewriter, generateNewPosition]);


  useEffect(() => {
    timerRef.current = customInitialDelay; // Initial delay before first appearance
    animationStateRef.current = AnimationState.Delayed;
    setCurrentPosition(generateNewPosition()); // Initial position
  }, [customInitialDelay, generateNewPosition]);


  useFrame((state, delta) => {
    if (!textRef.current) return;

    timerRef.current -= delta;

    switch (animationStateRef.current) {
      case AnimationState.Delayed:
        if (timerRef.current <= 0) {
          setupNextCycle();
        }
        break;

      case AnimationState.FadingIn:
        setOpacity((o) => Math.min(1, o + fadeInSpeed * delta));
        if (opacity >= 0.99) {
          setOpacity(1);
          animationStateRef.current = AnimationState.Typing;
          startTypewriter();
          timerRef.current = baseVisibleDuration; // Total time for typing & holding
        }
        break;

      case AnimationState.Typing:
        setCurrentText(displayedText);
        if (typewriterFinished || timerRef.current <= 0) {
          animationStateRef.current = AnimationState.Holding;
          // If timer ran out before typing finished, ensure text is fully displayed (or paused)
          if(!typewriterFinished) pauseTypewriter();
          setCurrentText(typewriterFinished ? displayedText : fragment.substring(0, displayedText.length) + "..."); // Show full or partial
        }
        break;

      case AnimationState.Holding:
        if (timerRef.current <= 0) {
          animationStateRef.current = AnimationState.FadingOut;
        }
        break;

      case AnimationState.FadingOut:
        setOpacity((o) => Math.max(0, o - fadeOutSpeed * delta));
        if (opacity <= 0.01) {
          setOpacity(0);
          animationStateRef.current = AnimationState.Paused;
          timerRef.current = baseRepeatDelay;
        }
        break;

      case AnimationState.Paused:
        if (timerRef.current <= 0) {
           // Restart the cycle
          setupNextCycle();
        }
        break;
    }
    // Apply opacity (Text material needs to be transparent)
    if (textRef.current.material) {
        textRef.current.material.opacity = MathUtils.damp(textRef.current.material.opacity, opacity, fadeInSpeed, delta);
    }
  });

  const textColor = isLightTheme ? textColorLight : textColorDark;

  if (opacity < 0.01 && animationStateRef.current !== AnimationState.FadingIn) return null; // Don't render if fully transparent and not about to fade in

  return (
    <group position={currentPosition}>
        <Text
            ref={textRef}
            fontSize={fontSize}
            color={textColor}
            maxWidth={maxWidth}
            lineHeight={lineHeight}
            anchorX="center"
            anchorY="middle"
            textAlign="center"
            material-transparent={true} // Crucial for opacity changes
            material-depthWrite={false} // Helps with transparency rendering order
        >
            {currentText}
        </Text>
    </group>
  );
};

export default React.memo(StarLikeFragment3D); // Memoize as props might not change frequently per instance