// src/components/ai/AiContextualElements.tsx
import React from 'react';
import * as THREE from 'three';
import StarLikeFragment3D from './StarLikeFragment';

interface AiContextualElementsProps {
  descriptions: string[];
  isLightTheme: boolean;
  focusPointPosition?: THREE.Vector3; // Optional: center point for the fragments
  visible?: boolean; // To control overall visibility
}

const STAGGER_PER_FRAGMENT_S = 0.25; // Stagger for 3D elements can be a bit longer

const AiContextualElements: React.FC<AiContextualElementsProps> = ({
  descriptions,
  isLightTheme,
  focusPointPosition = new THREE.Vector3(0, 0.5, -2), // Default if no focus point
  visible = true,
}) => {
  if (!visible || !descriptions || descriptions.length === 0) {
    return null;
  }

  // You could also add a group here to position all fragments collectively
  // relative to the focusPointPosition or another scene element.
  // For instance, <group position={focusPointPosition}> ... </group>
  // Then StarLikeFragment3D's volumeCenter would be relative to this group (e.g. [0,0,0])

  return (
    <group position={focusPointPosition}>
      {descriptions.map((fragmentText, index) => (
        <StarLikeFragment3D
          key={`star3d-${index}-${fragmentText.substring(0, 10)}`}
          fragment={fragmentText}
          isLightTheme={isLightTheme}
          customInitialDelay={index * STAGGER_PER_FRAGMENT_S}
          // volumeCenter can be kept at default (0,0,0) if the parent group is positioned
          volumeCenter={new THREE.Vector3(0,0,0)} 
          volumeRadius={1.8} // Adjust radius as needed
          fontSize={0.08}
          maxWidth={2}
        />
      ))}
    </group>
  );
};

export default AiContextualElements;