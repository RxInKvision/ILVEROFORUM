// src/components/ai/AiDescriptionOverlay.tsx
import React from 'react';
import StarLikeFragment from './StarLikeFragment';
import './AiDescriptionOverlay.css';

interface AiDescriptionOverlayProps {
  descriptions: string[];
  error: string | null;
  isLightTheme: boolean;
}

const STAGGER_PER_FRAGMENT_S = 0.1; 

const AiDescriptionOverlay: React.FC<AiDescriptionOverlayProps> = ({
  descriptions,
  error,
  isLightTheme,
}) => {
  return (
    <div className="ai-description-overlay">
      {/* Render descriptions if available and no critical error preventing display */}
      {descriptions && descriptions.length > 0 && descriptions.map((fragmentText, index) => (
        <StarLikeFragment
          key={`star-${index}-${fragmentText.substring(0,10)}`}
          fragment={fragmentText}
          isLightTheme={isLightTheme}
          customInitialDelay={index * STAGGER_PER_FRAGMENT_S}
        />
      ))}

      {/* Display a specific error message if `error` prop is set AND no descriptions are suitable to show */}
      {/* This typically means a higher-level error occurred, or the service returned only error messages */}
      {error && (!descriptions || descriptions.length === 0 || descriptions.every(d => d.toLowerCase().includes("errore"))) && (
        <div
          style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            color: isLightTheme ? '#800000' : '#ffdddd', // Dark red for light, light red for dark
            fontSize: '0.9rem', padding: '10px 15px',
            backgroundColor: isLightTheme ? 'rgba(255, 200, 200, 0.7)' : 'rgba(50, 0, 0, 0.7)',
            borderRadius: '6px', 
            pointerEvents: 'auto', // Allow interaction if error message needs to be copied etc.
            textAlign: 'center',
            maxWidth: '300px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          }}
        >
          {/* Display the specific error message from App.tsx */}
          <strong>AI Insights Error:</strong><br /> 
          {error}
          {(!descriptions || descriptions.length === 0) && <><br/>No further details available.</>}
        </div>
      )}
    </div>
  );
};

export default AiDescriptionOverlay;