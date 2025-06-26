// src/components/audio/AudioPlayerOverlay.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MediaItem } from '../../services/mediaService';
import * as THREE from 'three';
import './AudioPlayerOverlay.css';
import AudioReactiveWaveform from './AudioReactiveWaveform';

// --- Icon components (ensure these are defined) ---
const PlayIcon = () => ( <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em"><path d="M8 5v14l11-7L8 5z" /></svg> );
const PauseIcon = () => ( <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg> );
const NextIcon = () => ( <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg> );
const PrevIcon = () => ( <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6l-8.5 6z"/></svg> );
// --- End Icon components ---

interface AudioPlayerOverlayProps {
  playlist: MediaItem[];
  isVisible: boolean;
  onPlaybackStatusChange?: (isPlaying: boolean) => void;
  focusedItemMusician?: string | null;
  focusedItemTitle?: string | null;
  sceneBackgroundColor: THREE.ColorRepresentation;
}

const AudioPlayerOverlay: React.FC<AudioPlayerOverlayProps> = ({
  playlist,
  isVisible,
  onPlaybackStatusChange,
  focusedItemMusician,
  focusedItemTitle,
  sceneBackgroundColor,
}) => {
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  const FADE_DURATION = 0.6;
  const MAX_GAIN = 1.0;

  const WAVEFORM_OVERALL_SCALE = 2.5;
  const repetitions = 5; 

  const NORMALIZING_WIDTH_BASE_FACTOR = 0.1;
  const BAR_THICKNESS_MULTIPLIER = 0.5;
  const SPACE_WIDTH_MULTIPLIER = 0.5;
  const INTER_MOTIF_SPACE_RATIO = 30.0;

  const baseRestingHeightValues = useMemo(() =>
    [1.4/4, 2.5/4, 4/4, 2/4, 4/4, 2.5/4, 1.4/4].map(h => Math.max(0.5, h * WAVEFORM_OVERALL_SCALE))
  , [WAVEFORM_OVERALL_SCALE]);

  const audioDrivenAmplitude = useMemo(() =>
    8 * WAVEFORM_OVERALL_SCALE
  , [WAVEFORM_OVERALL_SCALE]);

  const isLightMode = useMemo(() => {
    try { const color = new THREE.Color(sceneBackgroundColor); return (color.r + color.g + color.b) > 1.8; }
    catch { return String(sceneBackgroundColor).toUpperCase() === '#FFFFFF'; }
  }, [sceneBackgroundColor]);

  // ... (setupWebAudio, fade, and other useEffect hooks remain unchanged from your provided code)
  const setupWebAudio = useCallback(() => {
    if (!audioRef.current) { return false; }
    let audioCtx = audioContextRef.current;
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
    }
    if (audioCtx.state === 'suspended') { audioCtx.resume().catch(console.warn); }
    if (!sourceNodeRef.current || sourceNodeRef.current.mediaElement !== audioRef.current) {
      if (sourceNodeRef.current) { try { sourceNodeRef.current.disconnect(); } catch (e) { /* ignore */ } }
      try { sourceNodeRef.current = audioCtx.createMediaElementSource(audioRef.current); }
      catch (e) { console.error("AudioPlayerOverlay: Error creating MediaElementSourceNode:", e); sourceNodeRef.current = null; return false; }
    }
    if (!gainNodeRef.current || gainNodeRef.current.context.state === 'closed' || gainNodeRef.current.context !== audioCtx) {
      if (gainNodeRef.current) { try { gainNodeRef.current.disconnect(); } catch(e) { /* ignore */ } }
      gainNodeRef.current = audioCtx.createGain();
      gainNodeRef.current.gain.setValueAtTime(audioRef.current.paused ? 0 : MAX_GAIN, audioCtx.currentTime);
    }
    try {
      if (sourceNodeRef.current && gainNodeRef.current && audioCtx.destination) {
        try { sourceNodeRef.current.disconnect(); } catch(e) { /* ignore */ }
        try { gainNodeRef.current.disconnect(); } catch(e) { /* ignore */ }
        sourceNodeRef.current.connect(gainNodeRef.current);
        gainNodeRef.current.connect(audioCtx.destination);
      }
    } catch (e) { console.error("AudioPlayerOverlay: Error connecting playback audio nodes:", e); return false; }
    return true;
  }, [MAX_GAIN]);

  const fade = useCallback((direction: 'in' | 'out', callback?: () => void) => {
    if (!gainNodeRef.current || !audioContextRef.current || audioContextRef.current.state === 'closed') { callback?.(); return; }
    const audioCtx = audioContextRef.current; const gain = gainNodeRef.current.gain; const targetVolume = direction === 'in' ? MAX_GAIN : 0;
    const currentGain = gain.value;
    gain.cancelScheduledValues(audioCtx.currentTime);
    gain.setValueAtTime(currentGain, audioCtx.currentTime);
    gain.linearRampToValueAtTime(targetVolume, audioCtx.currentTime + FADE_DURATION);
    setTimeout(() => { callback?.(); }, FADE_DURATION * 1000 + 50);
  }, [MAX_GAIN, FADE_DURATION]);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(); audioRef.current.crossOrigin = "anonymous"; audioRef.current.preload = "auto";
    }
    if (isVisible && playlist.length > 0 && audioRef.current) {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed' || !sourceNodeRef.current || !gainNodeRef.current) {
        setupWebAudio();
      }
    }
  }, [isVisible, playlist, setupWebAudio]);

  useEffect(() => {
    const audioEl = audioRef.current; if (!audioEl) return;
    const handlePlay = () => {
        if (audioContextRef.current?.state === 'suspended') { audioContextRef.current.resume().catch(console.warn); }
        setIsPlaying(true); if (onPlaybackStatusChange) onPlaybackStatusChange(true); fade('in');
    };
    const handlePause = () => { setIsPlaying(false); if (onPlaybackStatusChange) onPlaybackStatusChange(false); };
    const handleEnded = () => {
        if (currentTrackIndex < playlist.length - 1) { setCurrentTrackIndex(p => p + 1); }
        else { setIsPlaying(false); if (onPlaybackStatusChange) onPlaybackStatusChange(false); }
    };
    const handleError = (e: Event) => { console.error("Audio Element Error:", (e.target as HTMLAudioElement)?.error); setIsPlaying(false); if (onPlaybackStatusChange) onPlaybackStatusChange(false); };
    audioEl.addEventListener('play', handlePlay); audioEl.addEventListener('pause', handlePause);
    audioEl.addEventListener('ended', handleEnded); audioEl.addEventListener('error', handleError);
    return () => {
        audioEl.removeEventListener('play', handlePlay); audioEl.removeEventListener('pause', handlePause);
        audioEl.removeEventListener('ended', handleEnded); audioEl.removeEventListener('error', handleError);
    };
  }, [currentTrackIndex, playlist.length, onPlaybackStatusChange, fade]);

  useEffect(() => {
    const audioEl = audioRef.current; if (!audioEl) return;
    if (!isVisible || playlist.length === 0) { if (!audioEl.paused) fade('out', () => audioEl.pause()); return; }
    if (currentTrackIndex >= playlist.length || currentTrackIndex < 0) {
      if (playlist.length > 0) setCurrentTrackIndex(0); else if (!audioEl.paused) fade('out', () => audioEl.pause()); return;
    }
    const track = playlist[currentTrackIndex]; const trackUrl = track?.url;
    if (trackUrl) {
      const needsWebAudioSetup = !audioContextRef.current || audioContextRef.current.state === 'closed' ||
                                 !sourceNodeRef.current || sourceNodeRef.current.mediaElement !== audioEl || !gainNodeRef.current;
      if (needsWebAudioSetup) setupWebAudio();
      let newSourceLoaded = false;
      if (audioEl.src !== trackUrl) { audioEl.src = trackUrl; audioEl.load(); newSourceLoaded = true; }
      if ((isPlaying || newSourceLoaded) && audioEl.paused) {
        if (audioContextRef.current?.state === 'suspended') {
          audioContextRef.current.resume().then(() => {
            audioEl.play().catch(e => console.error(`Error auto-playing track "${track?.title}":`, e));
          }).catch(console.warn);
        } else {
          audioEl.play().catch(e => console.error(`Error auto-playing track "${track?.title}":`, e));
        }
      }
    } else if (!audioEl.paused) { fade('out', () => audioEl.pause()); }
  }, [isVisible, playlist, currentTrackIndex, setupWebAudio, fade, isPlaying]);

  const handlePlayPause = useCallback(() => {
    if (!audioRef.current || !playlist[currentTrackIndex]?.url) return;
    const needsWebAudioSetup = !audioContextRef.current || audioContextRef.current.state === 'closed' ||
                               !sourceNodeRef.current || !gainNodeRef.current;
    if (needsWebAudioSetup) { if (!setupWebAudio()) { return; } }
    if (audioContextRef.current?.state === 'suspended') { audioContextRef.current.resume().catch(console.error); }
    const audioEl = audioRef.current;
    if (!audioEl.paused) {
      fade('out', () => audioEl.pause());
    } else {
      audioEl.play().catch(e => console.error("Error playing on toggle:", e));
    }
  }, [playlist, currentTrackIndex, setupWebAudio, fade]);

  const handleNextTrack = useCallback(() => {
    if (playlist.length === 0) return;
    fade('out', () => { setCurrentTrackIndex(prev => (prev + 1) % playlist.length); });
  }, [playlist.length, fade]);

  const handlePrevTrack = useCallback(() => {
    if (playlist.length === 0) return;
    fade('out', () => { setCurrentTrackIndex(prev => (prev - 1 + playlist.length) % playlist.length); });
  }, [playlist.length, fade]);


  const currentTrack = playlist[currentTrackIndex];

  const { pixelBarWidths, pixelSpaceWidths, totalCalculatedWidth } = useMemo(() => {
    // ... (waveform calculation logic remains the same)
    const baseBarMotifUnscaled = [4.8, 8.77, 13.22, 13, 13.22, 8.77, 4.8]; 
    const baseMotifInternalSpacesUnscaled = [30.94, 26.8, 27.4, 27.4, 26.8, 30.94];
    const scaledBaseUnit = WAVEFORM_OVERALL_SCALE * NORMALIZING_WIDTH_BASE_FACTOR;
    const minPixelDimension = Math.max(0.3, 0.5 * WAVEFORM_OVERALL_SCALE);
    const motifBarPixelWidths = baseBarMotifUnscaled.map(w => Math.max(minPixelDimension, w * scaledBaseUnit * BAR_THICKNESS_MULTIPLIER));
    const motifInternalSpacePixelWidths = baseMotifInternalSpacesUnscaled.map(s => Math.max(minPixelDimension, s * scaledBaseUnit * SPACE_WIDTH_MULTIPLIER));
    const interMotifSpacePixelWidth = Math.max(minPixelDimension, INTER_MOTIF_SPACE_RATIO * scaledBaseUnit * SPACE_WIDTH_MULTIPLIER);
    const finalBarsArray: number[] = []; const finalSpacesArray: number[] = [];
    if (repetitions > 0 && motifBarPixelWidths.length > 0) {
        for (let i = 0; i < repetitions; i++) {
            finalBarsArray.push(...motifBarPixelWidths);
            if (i < repetitions - 1) { 
                finalSpacesArray.push(...motifInternalSpacePixelWidths); 
                finalSpacesArray.push(interMotifSpacePixelWidth);      
            } else { 
                finalSpacesArray.push(...motifInternalSpacePixelWidths); 
            }
        }
    }
    let calculatedWidth = 0;
    finalBarsArray.forEach(w => calculatedWidth += w);
    finalSpacesArray.forEach(s => calculatedWidth += s);
    return { pixelBarWidths: finalBarsArray, pixelSpaceWidths: finalSpacesArray, totalCalculatedWidth: calculatedWidth };
  }, [repetitions, WAVEFORM_OVERALL_SCALE, NORMALIZING_WIDTH_BASE_FACTOR, BAR_THICKNESS_MULTIPLIER, SPACE_WIDTH_MULTIPLIER, INTER_MOTIF_SPACE_RATIO]);

  const waveformFFTSize = 1024;
  const waveformSmoothingTimeConstant = 0.4;
  const waveformMinDecibels = -85;
  const waveformMaxDecibels = -15;
  const waveformBarColor = '#FFFFFF'; // This is the default white for the bars

  const showWaveform = !!(audioContextRef.current?.state === 'running' && gainNodeRef.current && currentTrack?.url);

  if (!isVisible || !playlist || playlist.length === 0) return null;

  return (
    <div className={`audio-player-overlay ${isVisible ? 'visible' : ''}`}>
      {/* The .light-mode class is now primarily for structural/shadow differences if any, not foreground colors for blending */}
      <div className={`player-content-wrapper ${isLightMode ? 'light-mode' : ''}`}>
        <div className="track-info">
          <p className="title" title={currentTrack?.title || 'Unknown Title'}>{currentTrack?.title || 'Unknown Title'}</p>
          <p className="musician" title={currentTrack?.musician || focusedItemMusician || 'Unknown Musician'}>{currentTrack?.musician || focusedItemMusician || 'Unknown Musician'}</p>
          {playlist.length > 1 && (<p className="playlist-count">Track {currentTrackIndex + 1} of {playlist.length}</p>)}
        </div>

        {isVisible && showWaveform && audioContextRef.current && gainNodeRef.current && (
             <div className="waveform-container">
                <AudioReactiveWaveform
                    audioContext={audioContextRef.current}
                    sourceNode={gainNodeRef.current}
                    isPlaying={isPlaying}
                    barPixelWidths={pixelBarWidths}
                    spaceBetweenBarsPixelWidths={pixelSpaceWidths}
                    waveformTotalWidth={totalCalculatedWidth}
                    initialBarAmplitudes={baseRestingHeightValues}
                    audioResponsiveAmplitude={audioDrivenAmplitude}
                    repetitions={repetitions}
                    // << CHANGED: Always pass the white bar color >>
                    barColor={waveformBarColor} 
                    fftSize={waveformFFTSize}
                    smoothingTimeConstant={waveformSmoothingTimeConstant}
                    minDecibels={waveformMinDecibels}
                    maxDecibels={waveformMaxDecibels}
                />
            </div>
        )}

        <div className="controls">
          <button onClick={handlePrevTrack} disabled={playlist.length <= 0} title="Previous Track"><PrevIcon /></button>
          <button onClick={handlePlayPause} title={isPlaying ? 'Pause' : 'Play'} disabled={!currentTrack?.url}>{isPlaying ? <PauseIcon /> : <PlayIcon />}</button>
          <button onClick={handleNextTrack} disabled={playlist.length <= 0} title="Next Track"><NextIcon /></button>
        </div>
      </div>
    </div>
  );
};
export default React.memo(AudioPlayerOverlay);