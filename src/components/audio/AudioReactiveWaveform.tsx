import React, { useEffect, useRef, useState, useCallback, ReactElement, useMemo } from 'react';
import './AudioReactiveWaveform.css';

// ULTRA REACTIVE CONSTANTS
const JS_ATTACK_SMOOTHING = 0.6;  // Very fast attack
const JS_DECAY_SMOOTHING = 0.4;   // Fast decay
const PEAK_ATTACK = 0.9;          // Almost instant peaks

interface AudioReactiveWaveformProps {
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
  fftSize = 2048,
  smoothingTimeConstant = 0.1,  // Minimal smoothing for max reactivity
  minDecibels = -80,  // Less range for more sensitivity
  maxDecibels = -5,   // Higher max for better peak capture
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

  // AGGRESSIVE frequency mapping
  const frequencyMapping = useMemo(() => {
    const patternLength = initialBarAmplitudes.length;
    if (patternLength === 0) return [];
    
    const patternFrequencyRanges = [
      { start: 0.0, end: 0.15, boost: 2.5, name: "sub-bass" },
      { start: 0.1, end: 0.3, boost: 2.8, name: "bass" },
      { start: 0.25, end: 0.45, boost: 3.0, name: "low-mids" },
      { start: 0.4, end: 0.6, boost: 2.8, name: "mids" },
      { start: 0.55, end: 0.75, boost: 2.5, name: "upper-mids" },
      { start: 0.7, end: 0.9, boost: 2.2, name: "treble" },
    ];
    
    const mapping = [];
    const maxInitial = Math.max(...fullInitialAmplitudes);
    
    for (let i = 0; i < actualNumBarsToDisplay; i++) {
      const patternRepetition = Math.floor(i / patternLength);
      const barIndexInPattern = i % patternLength;
      const rangeIndex = Math.min(patternRepetition, patternFrequencyRanges.length - 1);
      const patternRange = patternFrequencyRanges[rangeIndex];
      
      const rangeSize = patternRange.end - patternRange.start;
      const subRangeSize = rangeSize / patternLength;
      const barStart = patternRange.start + (barIndexInPattern * subRangeSize);
      const barEnd = barStart + subRangeSize;
      
      const proportionalBase = fullInitialAmplitudes[i] / maxInitial;
      
      mapping.push({
        start: barStart,
        end: barEnd,
        boost: patternRange.boost,
        proportionalBase: Math.pow(proportionalBase, 0.7), // Make proportions more dramatic
        name: `${patternRange.name}-bar${barIndexInPattern + 1}`
      });
    }
    return mapping;
  }, [fullInitialAmplitudes, actualNumBarsToDisplay]);

  useEffect(() => {
    setBarAmplitudes(fullInitialAmplitudes);
  }, [fullInitialAmplitudes]);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (audioContext && sourceNode && audioContext.state !== 'closed' && actualNumBarsToDisplay > 0) {
      const newAnalyser = audioContext.createAnalyser();
      newAnalyser.fftSize = fftSize;
      newAnalyser.smoothingTimeConstant = smoothingTimeConstant;
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
    }
  }, [audioContext, sourceNode, fftSize, smoothingTimeConstant, minDecibels, maxDecibels, actualNumBarsToDisplay]);

  const animationLoop = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current || !audioContext || 
        audioContext.state === 'closed' || actualNumBarsToDisplay === 0) {
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
      return;
    }

    analyserRef.current.getByteFrequencyData(dataArrayRef.current);
    const targetAmplitudes = new Array<number>(actualNumBarsToDisplay);
    const frequencyBinCount = analyserRef.current.frequencyBinCount;
    
    for (let i = 0; i < actualNumBarsToDisplay; i++) {
      const freqRange = frequencyMapping[i];
      if (!freqRange) continue;
      
      const startBin = Math.floor(frequencyBinCount * freqRange.start);
      const endBin = Math.floor(frequencyBinCount * freqRange.end);
      
      let max = 0;
      let sum = 0;
      let count = 0;
      
      // Find the loudest frequency in this range
      for (let j = startBin; j < endBin && j < dataArrayRef.current.length; j++) {
        const value = dataArrayRef.current[j];
        sum += value;
        max = Math.max(max, value);
        count++;
      }
      
      // Heavy emphasis on peaks for more reactive feel
      const avg = count > 0 ? sum / count : 0;
      const blended = (max * 0.8 + avg * 0.2) / 255;  // 80% peak, 20% average
      
      // Aggressive response curve
      const powered = Math.pow(blended, 0.5);  // Square root for expansion
      const boosted = powered * freqRange.boost;
      
      // Apply to amplitude
      const baseAmplitude = fullInitialAmplitudes[i] || 0;
      const reactiveComponent = boosted * audioResponsiveAmplitude;
      const proportionalReactive = reactiveComponent * freqRange.proportionalBase;
      
      targetAmplitudes[i] = baseAmplitude + proportionalReactive;
    }
    
    setBarAmplitudes(prevAmplitudes => {
      const currentAmplitudes = prevAmplitudes.length === actualNumBarsToDisplay ? 
        prevAmplitudes : fullInitialAmplitudes;
      
      return currentAmplitudes.map((currentAmp, index) => {
        const target = targetAmplitudes[index];
        const diff = target - currentAmp;
        
        // Ultra fast smoothing
        let smoothing;
        if (Math.abs(diff) > currentAmp * 0.3) {
          // Big change = instant response
          smoothing = PEAK_ATTACK;
        } else if (diff > 0) {
          smoothing = JS_ATTACK_SMOOTHING;
        } else {
          smoothing = JS_DECAY_SMOOTHING;
        }
        
        return currentAmp + (diff * smoothing);
      });
    });

    animationFrameIdRef.current = requestAnimationFrame(animationLoop);
  }, [audioContext, audioResponsiveAmplitude, actualNumBarsToDisplay, fullInitialAmplitudes, frequencyMapping]);

  useEffect(() => {
    if (isPlaying && audioContext && audioContext.state !== 'closed' && sourceNode && 
        analyserRef.current && actualNumBarsToDisplay > 0) {
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(err => console.warn("[Waveform] Resume context error", err));
      }
      if (!animationFrameIdRef.current) {
        animationFrameIdRef.current = requestAnimationFrame(animationLoop);
      }
    } else {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      if (!isPlaying && actualNumBarsToDisplay > 0) {
        setBarAmplitudes(fullInitialAmplitudes);
      }
    }
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [isPlaying, audioContext, sourceNode, animationLoop, actualNumBarsToDisplay, fullInitialAmplitudes]);

  const maxPossibleOverallAmplitude = useMemo(() => {
    const maxInitial = fullInitialAmplitudes.length > 0 ? Math.max(...fullInitialAmplitudes) : 0.5;
    return (maxInitial + audioResponsiveAmplitude) * 1.3;
  }, [fullInitialAmplitudes, audioResponsiveAmplitude]);

  const elements: ReactElement[] = [];
  const canRender = actualNumBarsToDisplay > 0 &&
                    barPixelWidths.length === actualNumBarsToDisplay &&
                    (actualNumBarsToDisplay === 1 || spaceBetweenBarsPixelWidths.length === actualNumBarsToDisplay - 1);

  if (canRender) {
    for (let i = 0; i < actualNumBarsToDisplay; i++) {
      const amplitude = barAmplitudes[i] || fullInitialAmplitudes[i] || 0;
      
      elements.push(
        <div
          key={`bar-slot-${i}`}
          className="waveform-bar-slot"
          style={{ width: `${barPixelWidths[i]}px` }}
        >
          <div 
            className="waveform-reactive-bar" 
            style={{ 
              height: `${amplitude}px`, 
              backgroundColor: barColor
            }} 
          />
          <div 
            className="waveform-reactive-bar" 
            style={{ 
              height: `${amplitude}px`, 
              backgroundColor: barColor
            }} 
          />
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
  }

  return (
    <div
      className="waveform-logo-container"
      style={{
        height: `${maxPossibleOverallAmplitude * 2}px`,
        width: waveformTotalWidth > 0 ? `${waveformTotalWidth}px` : 'auto',
      }}
    >
      {elements.length > 0 ? elements : (
        actualNumBarsToDisplay > 0 ? 
        <div style={{fontSize: '10px', color: '#777', width: '100%', textAlign: 'center', 
                    lineHeight: `${maxPossibleOverallAmplitude * 2}px`}}>Loading...</div> : 
        null
      )}
    </div>
  );
};

export default React.memo(AudioReactiveWaveform);