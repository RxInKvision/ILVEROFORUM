// src/components/audio/AudioReactiveWaveform.tsx
import React, { useEffect, useRef, useState, useCallback, ReactElement, useMemo } from 'react';
import './AudioReactiveWaveform.css';

// NEW: Define a smoothing factor for JavaScript-based animation
// Adjust this value: smaller (e.g., 0.1) = smoother/slower, larger (e.g., 0.3) = faster/sharper
const JS_SMOOTHING_FACTOR = 0.6; // You can tune this

interface AudioReactiveWaveformProps {
  // ... (props remain the same)
  audioContext: AudioContext | null;
  sourceNode: AudioNode | null;
  isPlaying: boolean;
  barPixelWidths: number[];
  spaceBetweenBarsPixelWidths: number[];
  waveformTotalWidth: number;
  fftSize?: number;
  smoothingTimeConstant?: number;
  minDecibels?: number;
  maxDecibels?: number;
  barColor?: string;
  initialBarAmplitudes: number[];
  audioResponsiveAmplitude: number;
  repetitions: number;
}

const AudioReactiveWaveform: React.FC<AudioReactiveWaveformProps> = ({
  audioContext,
  sourceNode,
  isPlaying,
  barPixelWidths,
  spaceBetweenBarsPixelWidths,
  waveformTotalWidth,
  fftSize = 1024,
  smoothingTimeConstant = 0.8, // This still applies to raw analyser data
  minDecibels = -80,
  maxDecibels = -15,
  barColor = '#FFFFFF',
  initialBarAmplitudes,
  audioResponsiveAmplitude,
  repetitions,
}) => {
  const actualNumBarsToDisplay = barPixelWidths.length;

  const fullInitialAmplitudes = useMemo(() => {
    const fullArray: number[] = [];
    if (initialBarAmplitudes && initialBarAmplitudes.length > 0 && repetitions > 0) {
      for (let i = 0; i < repetitions; i++) {
        fullArray.push(...initialBarAmplitudes);
      }
    }
    return fullArray.slice(0, actualNumBarsToDisplay);
  }, [initialBarAmplitudes, repetitions, actualNumBarsToDisplay]);

  const [barAmplitudes, setBarAmplitudes] = useState<number[]>(fullInitialAmplitudes);

  useEffect(() => {
    if (fullInitialAmplitudes.length === actualNumBarsToDisplay) {
      setBarAmplitudes(fullInitialAmplitudes);
    } else if (actualNumBarsToDisplay > 0) {
      const tempFullAmplitudes: number[] = [];
      if (initialBarAmplitudes && initialBarAmplitudes.length > 0 && repetitions > 0) {
        for (let i = 0; i < repetitions; i++) {
          tempFullAmplitudes.push(...initialBarAmplitudes);
        }
      }
      setBarAmplitudes(tempFullAmplitudes.slice(0, actualNumBarsToDisplay));
    } else {
      setBarAmplitudes([]);
    }
  }, [fullInitialAmplitudes, actualNumBarsToDisplay, initialBarAmplitudes, repetitions]);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  useEffect(() => {
    // ... (analyser setup remains the same)
    if (audioContext && sourceNode && audioContext.state !== 'closed' && actualNumBarsToDisplay > 0) {
      const newAnalyser = audioContext.createAnalyser();
      newAnalyser.fftSize = fftSize;
      newAnalyser.smoothingTimeConstant = smoothingTimeConstant; // Analyser's own smoothing
      newAnalyser.minDecibels = minDecibels;
      newAnalyser.maxDecibels = maxDecibels;
      const currentSourceNode = sourceNode;
      try {
        if(analyserRef.current && analyserRef.current !== newAnalyser && sourceNode.context.state !== 'closed') {
            try { currentSourceNode.disconnect(analyserRef.current); } catch(e) { /* ignore */ }
        }
        currentSourceNode.connect(newAnalyser);
        analyserRef.current = newAnalyser;
        dataArrayRef.current = new Uint8Array(newAnalyser.frequencyBinCount);
      } catch (error) {
        console.error('[Waveform] Error connecting sourceNode to analyser:', error);
        analyserRef.current = null; dataArrayRef.current = null;
      }
      return () => {
        if (currentSourceNode && currentSourceNode.context.state !== 'closed' && newAnalyser.context.state !== 'closed') {
          try { currentSourceNode.disconnect(newAnalyser); } catch (e) { /* ignore */ }
        }
        if (analyserRef.current === newAnalyser) analyserRef.current = null;
      };
    } else {
      if (analyserRef.current && sourceNode && sourceNode.context.state !== 'closed') {
        try { sourceNode.disconnect(analyserRef.current); } catch(e) { /*ignore*/ }
      }
      analyserRef.current = null; dataArrayRef.current = null;
      if (actualNumBarsToDisplay === 0 && barAmplitudes.length !== 0) {
         setBarAmplitudes([]);
      }
    }
  }, [audioContext, sourceNode, fftSize, smoothingTimeConstant, minDecibels, maxDecibels, actualNumBarsToDisplay, barAmplitudes.length]);


  const animationLoop = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current || !audioContext || audioContext.state === 'closed' || actualNumBarsToDisplay === 0 || fullInitialAmplitudes.length !== actualNumBarsToDisplay) {
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
      return;
    }

    analyserRef.current.getByteFrequencyData(dataArrayRef.current);
    const targetAmplitudes = new Array<number>(actualNumBarsToDisplay);
    const frequencyBinCount = analyserRef.current.frequencyBinCount;
    const spectrumPercentageToUse = 0.60;
    const relevantMaxBin = Math.floor(frequencyBinCount * spectrumPercentageToUse);
    const sliceWidth = Math.max(1, relevantMaxBin > 0 ? relevantMaxBin / actualNumBarsToDisplay : 1);

    for (let i = 0; i < actualNumBarsToDisplay; i++) {
      let sum = 0;
      const startBin = Math.floor(i * sliceWidth);
      const endBin = Math.min(Math.floor((i + 1) * sliceWidth), relevantMaxBin);
      let countInSlice = 0;
      if (startBin < endBin && dataArrayRef.current && startBin < dataArrayRef.current.length) {
        for (let j = startBin; j < endBin; j++) {
          if (j < dataArrayRef.current.length) { sum += dataArrayRef.current[j]; countInSlice++; }
        }
      }
      const average = countInSlice > 0 ? sum / countInSlice : 0;
      const exponent = 0.35;
      const normalizedAverage = Math.pow(average / 255, exponent) * 255;
      const audioReactivePart = (normalizedAverage / 255) * audioResponsiveAmplitude;

      targetAmplitudes[i] = (fullInitialAmplitudes[i] || 0) + audioReactivePart;
      targetAmplitudes[i] = Math.max(fullInitialAmplitudes[i] || 0.5, targetAmplitudes[i]);
    }

    setBarAmplitudes(prevAmplitudes => {
      // Ensure current visual amplitudes are correctly sourced, especially if prevAmplitudes is not yet populated
      const currentVisualAmplitudes = (prevAmplitudes && prevAmplitudes.length === actualNumBarsToDisplay)
          ? prevAmplitudes
          : fullInitialAmplitudes; // Fallback to fullInitialAmplitudes

      // If lengths still don't match (e.g. fullInitialAmplitudes not ready), directly set target (less smooth for a frame)
      if (currentVisualAmplitudes.length !== actualNumBarsToDisplay) {
            if (targetAmplitudes.length === actualNumBarsToDisplay) return targetAmplitudes;
            return currentVisualAmplitudes; // Or some other safe fallback
      }

      const smoothedAmplitudes = currentVisualAmplitudes.map((currentAmp, index) => {
        const targetAmp = targetAmplitudes[index];
        // Interpolate: current height moves JS_SMOOTHING_FACTOR of the way towards target height each frame
        return currentAmp + (targetAmp - currentAmp) * JS_SMOOTHING_FACTOR;
      });
      return smoothedAmplitudes;
    });

    animationFrameIdRef.current = requestAnimationFrame(animationLoop);
  }, [audioContext, audioResponsiveAmplitude, actualNumBarsToDisplay, fullInitialAmplitudes]); // JS_SMOOTHING_FACTOR is a const, so not needed in deps

  useEffect(() => {
    if (isPlaying && audioContext && audioContext.state !== 'closed' && sourceNode && analyserRef.current && actualNumBarsToDisplay > 0) {
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(err => console.warn("[Waveform] Resume context error", err));
      }
      if (!animationFrameIdRef.current) {
        // Ensure barAmplitudes are reset to resting if they were not already, before starting animation.
        // This helps if audio was paused and amplitudes were high.
        let allAtRest = true;
        if (barAmplitudes.length === fullInitialAmplitudes.length) {
            for(let i=0; i < barAmplitudes.length; i++) {
                if (Math.abs(barAmplitudes[i] - fullInitialAmplitudes[i]) > 0.1) { // Check if close enough
                    allAtRest = false;
                    break;
                }
            }
        } else {
            allAtRest = false;
        }
        if(!allAtRest && barAmplitudes.length === actualNumBarsToDisplay) { // If not at rest and lengths match for smoothing
             // Let the smoothing take care of it instead of direct set,
             // or do one direct set to ensure it starts from rest if that's desired.
             // For now, we let the smoothing loop handle the transition from wherever it was.
        }

        animationFrameIdRef.current = requestAnimationFrame(animationLoop);
      }
    } else {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      // When not playing, gradually return to initial amplitudes IF JS smoothing is active
      // For now, this effect will directly set to fullInitialAmplitudes if not already there.
      // To make it smooth back to idle, this part would need its own RAF loop or integrate into the main one.
      if (actualNumBarsToDisplay > 0 &&
          (barAmplitudes.length !== fullInitialAmplitudes.length ||
           !barAmplitudes.every((val, index) => Math.abs(val - fullInitialAmplitudes[index]) < 0.1 ))) { // Check if already at initial
        setBarAmplitudes(fullInitialAmplitudes); // Direct reset for now when not playing
      } else if (actualNumBarsToDisplay === 0 && barAmplitudes.length !== 0) {
        setBarAmplitudes([]);
      }
    }
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [isPlaying, audioContext, sourceNode, animationLoop, actualNumBarsToDisplay, barAmplitudes, fullInitialAmplitudes]);

  const maxPossibleOverallAmplitude = useMemo(() => {
    // ... (remains the same)
    if (fullInitialAmplitudes.length === 0 || initialBarAmplitudes.length === 0) {
        return audioResponsiveAmplitude > 0 ? audioResponsiveAmplitude : 0.5;
    }
    const maxInitial = fullInitialAmplitudes.length > 0 ? Math.max(0.5, ...fullInitialAmplitudes) : 0.5;
    return maxInitial + audioResponsiveAmplitude;
  }, [fullInitialAmplitudes, audioResponsiveAmplitude, initialBarAmplitudes]);


  const elements: ReactElement[] = [];
  const canRender = actualNumBarsToDisplay > 0 &&
                    barPixelWidths.length === actualNumBarsToDisplay &&
                    (actualNumBarsToDisplay === 1 || spaceBetweenBarsPixelWidths.length === actualNumBarsToDisplay - 1);

  if (canRender) {
    // ... (rendering logic remains the same)
    for (let i = 0; i < actualNumBarsToDisplay; i++) {
      const initialAmpForBar = fullInitialAmplitudes[i] !== undefined ? fullInitialAmplitudes[i] : 0.5;
      const currentBarTotalAmplitude = barAmplitudes[i] !== undefined ? barAmplitudes[i] : initialAmpForBar;
      elements.push(
        <div
          key={`bar-slot-${i}`}
          className="waveform-bar-slot"
          style={{ width: `${barPixelWidths[i]}px` }}
        >
          <div className="waveform-reactive-bar" style={{ height: `${currentBarTotalAmplitude}px`, backgroundColor: barColor }} />
          <div className="waveform-reactive-bar" style={{ height: `${currentBarTotalAmplitude}px`, backgroundColor: barColor }} />
        </div>
      );
      if (i < actualNumBarsToDisplay - 1 && i < spaceBetweenBarsPixelWidths.length) {
        elements.push(
          <div
            key={`spacer-${i}`}
            className="waveform-spacer"
            style={{ width: `${spaceBetweenBarsPixelWidths[i]}px` }}
          />
        );
      }
    }
  } else if (actualNumBarsToDisplay > 0) {
    console.warn('[Waveform] Prop length mismatch for rendering pixel widths.', {numBars: actualNumBarsToDisplay, barPxWL: barPixelWidths.length, spacePxWL: spaceBetweenBarsPixelWidths.length });
  }

  return (
    <div
      className="waveform-logo-container"
      style={{
        height: `${maxPossibleOverallAmplitude * 2}px`,
        width: waveformTotalWidth > 0 ? `${waveformTotalWidth}px` : 'auto',
      }}
    >
      {elements.length > 0 ? elements : ( actualNumBarsToDisplay > 0 ? <div style={{fontSize: '10px', color: '#777', width: '100%', textAlign: 'center', lineHeight: `${maxPossibleOverallAmplitude * 2}px`}}>Loading...</div>  : null )}
    </div>
  );
};
export default React.memo(AudioReactiveWaveform);