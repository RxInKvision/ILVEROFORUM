// src/components/gallery/MediaItems.tsx

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useFrame, RootState } from '@react-three/fiber';
import { Text, useTexture } from '@react-three/drei';
import { MediaItem as BaseMediaItemFromService } from '../../services/mediaService';
import { VIEW_MODES } from '../../constants/viewSettings';
import { Text as TroikaTextClass } from 'troika-three-text';

const TRANSPARENT_FALLBACK_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const GENERIC_VIDEO_PLACEHOLDER_IMG_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAAAAACPAi4CAAABGklEQVRIib3VMWoDQRAF4M9gBEEQCxsLDULgp2BjI5hImCBY2NhYiMVSCxEsbESwEBHNBCFBiCAkGit82JELCLGE7S7M7Mx+Z/ZY9lj0zL7M7IdhRxb2MLjBwbAFsJMBvA0Ycy2A9wYAwNlAmEE0pQFYIkG0SwM0SDFosQNIQoAw6/AwxK+z4Kx7N68kKP0XwI2C6DAcIL0F5gNaLHzItCvR0D6P+tGC3kP8r3DxL4A2BSQYcNr29u3b9/8DiOtxhgwLKCnlQDmHjgH+X8Z2Q50QhAIEtcQwXgAFLz5QtkA+yvVFV0fHjP4XkIZY9WjB5n3u4xJgP/XnGwAL/p4q8Z7Q2y8A0KBGAxpQe9u7d+8DIABQCAIQCLgIG0B0AJz2AFAT4AKJ/gHkY73ae7TpVgAAAABJRU5kJggg==';
const NoOpRaycast = () => null;

const BREATHING_SCALE_AMPLITUDE_MEDIAOBJECT = 0.0;
const BREATHING_SCALE_FREQUENCY_MEDIAOBJECT = 0.0;

const AMBIENT_AUDIO_VOLUME = 0.4;
const AMBIENT_AUDIO_REF_DISTANCE = 3;
const AMBIENT_AUDIO_ROLLOFF_FACTOR = 1.2;
const AMBIENT_FADE_SPEED = 0.75;

export interface VisualEffects {
  opacity: number;
  blendMode: string;
  mediaSize?: number;
  imageSize?: number;
}

export interface ExtendedMediaItem extends BaseMediaItemFromService {
  thumbnailUrl?: string;
}

export type VideoQuality = 'full' | 'reduced';

export interface PositionalAudioFilterConfig {
  highPassFreq?: number;
  lowPassFreq?: number;
  q?: number;
}

export interface MediaObjectProps {
  item: ExtendedMediaItem;
  position: THREE.Vector3;
  displayItemMetadata: boolean;
  viewMode: VIEW_MODES;
  effects: VisualEffects;
  sceneBackgroundColor: THREE.ColorRepresentation;
  isVideo?: boolean;
  isVisuallyActive: boolean;
  focusedItemId?: string | null;
  onItemClick: (itemId: string | null) => void;
  shouldPlayVideo?: boolean;
  videoQuality?: VideoQuality;
  primaryRelatedVisualItemIds?: Set<string>;
  audioListener?: THREE.AudioListener;
  playAmbientPositionalAudio?: boolean;
  ambientAudioUrl?: string;
  positionalAudioFilterSettings?: PositionalAudioFilterConfig;
  // --- NEW Prop for remote hover ---
  isRemoteHovered?: boolean;
}

const simpleVertexShaderCode = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const fragmentShaderCode = `uniform sampler2D tDiffuse; uniform float opacity; uniform float uTextureZoomFactor; varying vec2 vUv; vec2 scaleUV(vec2 uv, float z) { float c = 0.5; return ((uv - c) / z) + c; } void main() { vec4 tc = texture2D(tDiffuse, scaleUV(vUv, uTextureZoomFactor)); if (tc.a < 0.01) discard; gl_FragColor = vec4(tc.rgb, tc.a * opacity); }`;

type VideoPlayerState = 'idle' | 'loading' | 'ready_paused' | 'playing' | 'paused_by_user' | 'error';

const getVideoUrl = (baseUrl: string, quality: VideoQuality) => {
  if (!baseUrl) return '';
  if (baseUrl.includes('cloudinary.com')) {
    if (quality === 'reduced') {
      return baseUrl.replace('/upload/', '/upload/w_640,q_auto,f_auto/');
    }
    return baseUrl.replace('/upload/', '/upload/w_1280,q_auto,f_auto/');
  }
  return baseUrl;
};

const MediaObject: React.FC<MediaObjectProps> = ({
  item,
  position,
  displayItemMetadata,
  effects,
  sceneBackgroundColor,
  isVideo = false,
  isVisuallyActive,
  focusedItemId,
  onItemClick,
  shouldPlayVideo = false,
  videoQuality = 'reduced',
  audioListener,
  playAmbientPositionalAudio = false,
  ambientAudioUrl,
  positionalAudioFilterSettings,
  // --- NEW prop destructured ---
  isRemoteHovered = false,
}) => {
  const componentId = useMemo(() => `MediaObject-${item.id.substring(0,5)}-${item.title?.substring(0,10) || 'untitled'}-${isVideo ? 'vid' : 'img'}`, [item.id, item.title, isVideo]);

  const groupRef = useRef<THREE.Group>(null);
  const mainMeshRef = useRef<THREE.Mesh>(null);

  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const videoTextureRef = useRef<THREE.VideoTexture | null>(null);
  const isMountedRef = useRef(false);
  const activeVideoListenersCleanup = useRef<(() => void) | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);

  const [hovered, setHovered] = useState(false);
  const [staticTexture, setStaticTexture] = useState<THREE.Texture | null>(null);
  const [isStaticTexturePrimed, setIsStaticTexturePrimed] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<number>(item.aspect_ratio || (isVideo ? 16/9 : 1));
  const [videoState, setVideoState] = useState<VideoPlayerState>('idle');
  const [currentVideoQuality, setCurrentVideoQuality] = useState<VideoQuality>(videoQuality);

  const positionalAudioRef = useRef<THREE.PositionalAudio | null>(null);
  const audioLoaderRef = useRef<THREE.AudioLoader | null>(null);
  const isPlayingAmbientRef = useRef<boolean>(false);
  const ambientFadeStateRef = useRef<'idle' | 'fading_in' | 'playing' | 'fading_out'>('idle');
  const ambientCurrentVolumeRef = useRef<number>(0);
  const ambientTargetVolumeRef = useRef<number>(0);
  const loadedAmbientUrlRef = useRef<string | null>(null);
  const shouldPlayAmbientRef = useRef<boolean>(false);


  const loadingPlaceholderMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(sceneBackgroundColor).getStyle() === '#000000' ? '#383838' : '#dddddd',
      transparent: true, opacity: 0.25, depthWrite: false, wireframe: true,
    });
  }, [sceneBackgroundColor]);

  // All useEffects from the new version are preserved, only hoverScale logic is updated.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (activeVideoListenersCleanup.current) activeVideoListenersCleanup.current();
      activeVideoListenersCleanup.current = null;
      if (videoElementRef.current) {
        videoElementRef.current.pause();
        videoElementRef.current.src = '';
        videoElementRef.current.removeAttribute('src');
      }
      if (videoTextureRef.current) {
        videoTextureRef.current.dispose();
        videoTextureRef.current = null;
      }
      playPromiseRef.current = null;
      const paNode = positionalAudioRef.current;
      if (paNode) {
        if (paNode.isPlaying) paNode.stop();
        if (paNode.parent) paNode.parent.remove(paNode);
        try { if (paNode.getFilters().length > 0) paNode.setFilters([]); } catch (e) { console.warn(`[${componentId}] Error clearing filters on unmount:`, e); }
        if (typeof paNode.disconnect === 'function' && paNode.source) {
          try { paNode.disconnect(); } catch(e) { console.warn(`[${componentId}] Error disconnecting PA on unmount:`, e); }
        }
      }
      positionalAudioRef.current = null;
      audioLoaderRef.current = null;
      loadedAmbientUrlRef.current = null;
      shouldPlayAmbientRef.current = false;
    };
  }, [componentId]);

  useEffect(() => {
    if (!isMountedRef.current) return;
    setVideoState('idle');
    setIsStaticTexturePrimed(false);
    setStaticTexture(null);
    setAspectRatio(item.aspect_ratio || (isVideo ? 16/9 : 1));

    if (activeVideoListenersCleanup.current) {
      activeVideoListenersCleanup.current();
      activeVideoListenersCleanup.current = null;
    }
    if (videoElementRef.current) {
      const vid = videoElementRef.current;
      vid.pause();
      vid.src = '';
      vid.removeAttribute('src');
    }
    if (videoTextureRef.current) {
      videoTextureRef.current.dispose();
      videoTextureRef.current = null;
    }
    playPromiseRef.current = null;
  }, [item.id, isVideo, item.aspect_ratio, componentId]);

  const attemptPlayVideo = useCallback(async () => {
    const videoEl = videoElementRef.current;
    if (!isMountedRef.current || !videoEl || !videoEl.paused) {
      return;
    }
    if (videoEl.readyState < HTMLMediaElement.HAVE_METADATA) {
        if(videoState !== 'loading') setVideoState('loading');
        return;
    }
    playPromiseRef.current = videoEl.play();
    try {
      await playPromiseRef.current;
      if (isMountedRef.current && videoElementRef.current === videoEl) {
        setVideoState('playing');
      }
    } catch (error: any) {
      playPromiseRef.current = null;
      if (isMountedRef.current && videoElementRef.current === videoEl) {
        if (error.name === 'AbortError') {
          if (videoEl.paused && videoState !== 'loading' && videoState !== 'error') {
             setVideoState(shouldPlayVideo && isVisuallyActive ? 'ready_paused' : 'paused_by_user');
          }
        } else {
          console.error(`[${componentId}] attemptPlayVideo: Video play error:`, error);
          setVideoState('error');
        }
      }
    }
  }, [componentId, videoState, shouldPlayVideo, isVisuallyActive]);

  useEffect(() => {
    if (videoQuality !== currentVideoQuality) {
      setCurrentVideoQuality(videoQuality);
      if (videoElementRef.current && shouldPlayVideo && isVideo && item.url) {
        setVideoState('loading');
      }
    }
  }, [videoQuality, currentVideoQuality, shouldPlayVideo, isVideo, item.url, componentId]);

  useEffect(() => {
    if (!isMountedRef.current || !isVideo || !item.url ) {
      if (videoElementRef.current) {
        if(activeVideoListenersCleanup.current) activeVideoListenersCleanup.current();
        activeVideoListenersCleanup.current = null;
        videoElementRef.current.pause();
        videoElementRef.current.src='';
        videoElementRef.current.removeAttribute('src');
        videoElementRef.current = null;
        if(videoTextureRef.current) videoTextureRef.current.dispose();
        videoTextureRef.current = null;
      }
      if (videoState !== 'idle') setVideoState('idle');
      return;
    }

    if (!shouldPlayVideo) {
      if (videoElementRef.current) {
        if (activeVideoListenersCleanup.current) activeVideoListenersCleanup.current();
        activeVideoListenersCleanup.current = null;
        videoElementRef.current.pause();
        videoElementRef.current.src = '';
        videoElementRef.current.removeAttribute('src');
        videoElementRef.current = null;
      }
      if (videoTextureRef.current) {
        videoTextureRef.current.dispose();
        videoTextureRef.current = null;
      }
      if (videoState !== 'idle' && videoState !== 'paused_by_user') {
          setVideoState('idle');
      }
      return; 
    }
    
    const targetSrc = getVideoUrl(item.url, currentVideoQuality);
    let videoEl = videoElementRef.current;

    const needsToCreateOrUpdateElement = 
        videoState === 'loading' || 
        !videoEl ||                 
        (videoEl && videoEl.src !== targetSrc);

    if (needsToCreateOrUpdateElement) {
      if (!videoEl) {
        videoEl = document.createElement('video');
        videoEl.crossOrigin = 'anonymous';
        videoEl.loop = true;
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.preload = 'metadata'; 
        videoElementRef.current = videoEl;
      }

      if (videoEl.src !== targetSrc || !activeVideoListenersCleanup.current || videoState === 'loading') {
        if (activeVideoListenersCleanup.current) activeVideoListenersCleanup.current();

        const setupListeners = (element: HTMLVideoElement): (() => void) => {
          let localMounted = true;
          const onLoadedMeta = () => {
            if (!localMounted || !isMountedRef.current || videoElementRef.current !== element) return;
            setAspectRatio(item.aspect_ratio || (element.videoWidth / element.videoHeight) || 16/9);
          };
          const onCanPlay = () => {
            if (!localMounted || !isMountedRef.current || videoElementRef.current !== element) return;
            if(videoTextureRef.current?.image !== element) {
                if(videoTextureRef.current) videoTextureRef.current.dispose();
                const newTex = new THREE.VideoTexture(element);
                newTex.minFilter = THREE.LinearFilter; newTex.magFilter = THREE.LinearFilter;
                videoTextureRef.current = newTex;
             }
            if (isMountedRef.current && (videoState === 'loading' || videoState === 'idle')) {
                setVideoState('ready_paused');
            }
          };
          const onVidError = (e: Event | string) => {
            if (!localMounted || !isMountedRef.current) return;
            console.error(`[${componentId}] VideoElementSetup: Video error for ${element.src}:`, e);
            if (isMountedRef.current) setVideoState('error');
          };
          element.addEventListener('loadedmetadata', onLoadedMeta);
          element.addEventListener('canplay', onCanPlay);
          element.addEventListener('error', onVidError);
          return () => {
            localMounted = false;
            if (element) {
              element.removeEventListener('loadedmetadata', onLoadedMeta);
              element.removeEventListener('canplay', onCanPlay);
              element.removeEventListener('error', onVidError);
            }
          };
        };
        activeVideoListenersCleanup.current = setupListeners(videoEl);
        
        if (videoEl.src !== targetSrc) {
            videoEl.src = targetSrc;
            videoEl.load(); 
        } else if (videoState === 'loading') {
            videoEl.load();
        }
      }
    }
  }, [
    isVideo, item.url, currentVideoQuality, videoState, shouldPlayVideo,
    componentId, item.aspect_ratio
  ]);

  useEffect(() => {
    if (!isMountedRef.current || !isVideo || !videoElementRef.current) {
        return;
    }
    const videoEl = videoElementRef.current;
    const shouldBePlayingCurrently = shouldPlayVideo && isVisuallyActive;

    if (shouldBePlayingCurrently) {
      if ((videoState === 'ready_paused' || videoState === 'paused_by_user') && videoEl.paused) {
        attemptPlayVideo();
      } else if (videoState === 'playing' && videoEl.paused) {
        attemptPlayVideo();
      }
    } else { 
      if ((videoState === 'playing' || videoState === 'ready_paused') && !videoEl.paused) { 
        videoEl.pause();
        playPromiseRef.current = null; 
        setVideoState('paused_by_user');
      } else if (videoState === 'ready_paused' && !shouldPlayVideo && videoEl.paused){ 
        setVideoState('paused_by_user');
      }
    }
  }, [
    shouldPlayVideo, isVisuallyActive, videoState, 
    isVideo, componentId, attemptPlayVideo
  ]);

  const staticTexturePath = useMemo(() => {
    if (!isVideo) {
      return (item.url && typeof item.url === 'string') ? item.url : TRANSPARENT_FALLBACK_IMG;
    } else {
      return item.thumbnailUrl || GENERIC_VIDEO_PLACEHOLDER_IMG_URL;
    }
  }, [isVideo, item.url, item.thumbnailUrl]);

  const loadedStaticTextureFromHook = useTexture(staticTexturePath);

  useEffect(() => {
    if (!isMountedRef.current) return;
    const tex = Array.isArray(loadedStaticTextureFromHook) ? loadedStaticTextureFromHook[0] : loadedStaticTextureFromHook;

    if (tex instanceof THREE.Texture) {
        setStaticTexture(tex);
        const primed = !!(tex && tex.image && typeof tex.image.width === 'number' && tex.image.width > 0 && typeof tex.image.height === 'number' && tex.image.height > 0);
        setIsStaticTexturePrimed(primed);

        if (tex.image && typeof tex.image.width === 'number' && tex.image.width > 0 && typeof tex.image.height === 'number' && tex.image.height > 0) {
            setAspectRatio(item.aspect_ratio || (tex.image.width / tex.image.height));
        } else if (tex.image && typeof tex.image.naturalWidth === 'number' && tex.image.naturalWidth > 0 && typeof tex.image.naturalHeight === 'number' && tex.image.naturalHeight > 0) {
            setAspectRatio(item.aspect_ratio || (tex.image.naturalWidth / tex.image.naturalHeight));
        } else if (isVideo) {
            setAspectRatio(item.aspect_ratio || 16/9);
        } else {
            setAspectRatio(item.aspect_ratio || 1);
        }
    } else {
        setStaticTexture(null);
        setIsStaticTexturePrimed(false);
        setAspectRatio(item.aspect_ratio || (isVideo ? 16/9 : 1));
    }
  }, [loadedStaticTextureFromHook, staticTexturePath, item.aspect_ratio, isVideo, componentId]);

  useEffect(() => {
    const textureToClean = staticTexture;
    return () => { if (textureToClean && textureToClean !== videoTextureRef.current) textureToClean.dispose(); };
  }, [staticTexture]);

  useEffect(() => {
    const hasFocus = focusedItemId !== null;
    const shouldStopAmbient = hasFocus || !playAmbientPositionalAudio;
    
    if (shouldStopAmbient) {
      shouldPlayAmbientRef.current = false;
      const paNode = positionalAudioRef.current;
      if (paNode && (paNode.isPlaying || ambientFadeStateRef.current !== 'idle')) {
        if (paNode.isPlaying) paNode.stop();
        paNode.setVolume(0);
        ambientCurrentVolumeRef.current = 0;
        ambientFadeStateRef.current = 'idle';
        isPlayingAmbientRef.current = false;
        try {
          if (paNode.getFilters().length > 0) paNode.setFilters([]);
        } catch (e) {
          console.warn(`[${componentId}] Error clearing filters on immediate ambient stop:`, e);
        }
      }
    } else {
      shouldPlayAmbientRef.current = playAmbientPositionalAudio;
    }
  }, [focusedItemId, playAmbientPositionalAudio, componentId]);

  useEffect(() => {
    if (!isMountedRef.current) return;
    const shouldSetupAmbientAudio = shouldPlayAmbientRef.current && ambientAudioUrl && audioListener && mainMeshRef.current;

    if (!shouldSetupAmbientAudio) {
      const paNode = positionalAudioRef.current;
      if (paNode) {
        if (paNode.isPlaying || ambientFadeStateRef.current !== 'idle') { 
            if (paNode.isPlaying) paNode.stop();
            paNode.setVolume(0);
            ambientCurrentVolumeRef.current = 0;
            ambientFadeStateRef.current = 'idle';
            isPlayingAmbientRef.current = false;
             try { if (paNode.getFilters().length > 0) paNode.setFilters([]); } catch (e) {console.warn(`[${componentId}] Error clearing filters on ambient stop (no setup):`, e); }
        }
      }
      return;
    }

    let paNode = positionalAudioRef.current;
    if (!paNode && mainMeshRef.current) {
      paNode = new THREE.PositionalAudio(audioListener as THREE.AudioListener);
      positionalAudioRef.current = paNode;
      mainMeshRef.current.add(paNode);
    }
    
    if (!paNode) return; 

    const currentPaNodeInstance = paNode;

    const filtersArray: BiquadFilterNode[] = [];
    if (currentPaNodeInstance.context && currentPaNodeInstance.context.state !== 'closed' && positionalAudioFilterSettings) {
        const { highPassFreq, lowPassFreq, q } = positionalAudioFilterSettings;
        if (typeof highPassFreq === 'number') { 
            const highPass = currentPaNodeInstance.context.createBiquadFilter();
            highPass.type = 'highpass';
            highPass.frequency.setValueAtTime(highPassFreq, currentPaNodeInstance.context.currentTime);
            highPass.Q.setValueAtTime(q ?? 1, currentPaNodeInstance.context.currentTime);
            filtersArray.push(highPass); 
        }
        if (typeof lowPassFreq === 'number') { 
            const lowPass = currentPaNodeInstance.context.createBiquadFilter();
            lowPass.type = 'lowpass';
            lowPass.frequency.setValueAtTime(lowPassFreq, currentPaNodeInstance.context.currentTime);
            lowPass.Q.setValueAtTime(q ?? 1, currentPaNodeInstance.context.currentTime);
            filtersArray.push(lowPass); 
        }
    }
    try { currentPaNodeInstance.setFilters(filtersArray); } catch (e) { console.warn(`[${componentId}] Error setting ambient filters:`, e); }

    const shouldStartNewAmbientSound =
      loadedAmbientUrlRef.current !== ambientAudioUrl ||
      (ambientFadeStateRef.current === 'idle' && !currentPaNodeInstance.isPlaying && !currentPaNodeInstance.buffer);

    if (shouldStartNewAmbientSound) {
      if (currentPaNodeInstance.isPlaying) currentPaNodeInstance.stop();
      currentPaNodeInstance.setRefDistance(AMBIENT_AUDIO_REF_DISTANCE);
      currentPaNodeInstance.setRolloffFactor(AMBIENT_AUDIO_ROLLOFF_FACTOR);
      currentPaNodeInstance.setDistanceModel('inverse');
      currentPaNodeInstance.setLoop(true);

      if (!audioLoaderRef.current) audioLoaderRef.current = new THREE.AudioLoader();
      
      ambientCurrentVolumeRef.current = 0;
      currentPaNodeInstance.setVolume(0);
      ambientFadeStateRef.current = 'fading_in';
      ambientTargetVolumeRef.current = AMBIENT_AUDIO_VOLUME;
      loadedAmbientUrlRef.current = ambientAudioUrl;

      audioLoaderRef.current.load( ambientAudioUrl, (buffer) => {
          const paNodeAtLoadTime = positionalAudioRef.current;
          if (!isMountedRef.current || paNodeAtLoadTime !== currentPaNodeInstance || loadedAmbientUrlRef.current !== ambientAudioUrl || !shouldPlayAmbientRef.current ) return;
          if (!paNodeAtLoadTime) return;
          if (paNodeAtLoadTime.context.state === 'closed') { 
            console.warn(`[${componentId}] Ambient audio context closed for ${ambientAudioUrl}`);
            ambientFadeStateRef.current = 'idle';
            isPlayingAmbientRef.current = false;
            loadedAmbientUrlRef.current = null;
            return; 
          }
          
          paNodeAtLoadTime.setBuffer(buffer);
          if (!paNodeAtLoadTime.isPlaying && shouldPlayAmbientRef.current) { 
            try { paNodeAtLoadTime.play(); } catch (e) { 
                console.error(`[${componentId}] Error playing ambient sound ${ambientAudioUrl}:`, e);
                ambientFadeStateRef.current = 'idle';
                isPlayingAmbientRef.current = false;
                loadedAmbientUrlRef.current = null;
            }
          }
        },
        undefined, (error) => { 
            console.error(`[${componentId}] Error loading ambient sound ${ambientAudioUrl}:`, error);
            if (loadedAmbientUrlRef.current === ambientAudioUrl) {
                ambientFadeStateRef.current = 'idle';
                isPlayingAmbientRef.current = false;
                loadedAmbientUrlRef.current = null;
            }
        }
      );
    } else if (loadedAmbientUrlRef.current === ambientAudioUrl && ambientFadeStateRef.current === 'idle' && currentPaNodeInstance.buffer && !currentPaNodeInstance.isPlaying && shouldPlayAmbientRef.current) {
        ambientCurrentVolumeRef.current = 0;
        currentPaNodeInstance.setVolume(0);
        try { currentPaNodeInstance.play(); ambientFadeStateRef.current = 'fading_in'; ambientTargetVolumeRef.current = AMBIENT_AUDIO_VOLUME;}
        catch(e) { 
            console.error(`[${componentId}] Error re-playing ambient sound ${ambientAudioUrl}:`, e);
            loadedAmbientUrlRef.current = null;
        }
    }
  }, [playAmbientPositionalAudio, ambientAudioUrl, audioListener, positionalAudioFilterSettings, componentId, item.id]);

  useFrame((state: RootState, delta) => {
    const paNode = positionalAudioRef.current;
    if (isMountedRef.current && paNode && shouldPlayAmbientRef.current) {
      if (ambientFadeStateRef.current === 'fading_in' || ambientFadeStateRef.current === 'fading_out') {
        const diff = ambientTargetVolumeRef.current - ambientCurrentVolumeRef.current;
        if (Math.abs(diff) > 0.005) {
          const direction = Math.sign(diff);
          ambientCurrentVolumeRef.current += direction * AMBIENT_FADE_SPEED * delta;
          ambientCurrentVolumeRef.current = THREE.MathUtils.clamp(ambientCurrentVolumeRef.current, 0, AMBIENT_AUDIO_VOLUME);
          paNode.setVolume(ambientCurrentVolumeRef.current);
        } else {
          ambientCurrentVolumeRef.current = ambientTargetVolumeRef.current;
          paNode.setVolume(ambientCurrentVolumeRef.current);
          if (ambientFadeStateRef.current === 'fading_in') {
            ambientFadeStateRef.current = 'playing';
            isPlayingAmbientRef.current = true;
          } else if (ambientFadeStateRef.current === 'fading_out') {
            if (paNode.isPlaying) paNode.stop();
            try { if (paNode.getFilters().length > 0) paNode.setFilters([]);} catch(e) {console.warn(`[${componentId}] Error clearing filters on fade out stop:`, e);}
            ambientFadeStateRef.current = 'idle';
            isPlayingAmbientRef.current = false;
            if (!playAmbientPositionalAudio) loadedAmbientUrlRef.current = null;
          }
        }
      } else if (ambientFadeStateRef.current === 'playing') {
        if (paNode.getVolume() !== ambientCurrentVolumeRef.current) paNode.setVolume(ambientCurrentVolumeRef.current);
        if (!paNode.isPlaying && paNode.buffer && shouldPlayAmbientRef.current) { 
            console.warn(`[${componentId}] Ambient sound was in 'playing' state but not actually playing. Attempting to resume.`);
            try { paNode.play(); } catch (e) { console.error(`[${componentId}] Error resuming ambient sound:`, e); }
        }
      }
    } else if (paNode && !shouldPlayAmbientRef.current && (paNode.isPlaying || ambientFadeStateRef.current !== 'idle')) {
        if (paNode.isPlaying) paNode.stop();
        paNode.setVolume(0);
        ambientCurrentVolumeRef.current = 0;
        ambientFadeStateRef.current = 'idle';
        isPlayingAmbientRef.current = false;
        try { if (paNode.getFilters().length > 0) paNode.setFilters([]);} catch(e) {console.warn(`[${componentId}] Error clearing filters in useFrame due to shouldPlayAmbientRef false:`, e);}
    }

    const mesh = mainMeshRef.current;
    if (mesh) {
      const time = state.clock.getElapsedTime();
      const basePulse = 1.0 + Math.sin(time * BREATHING_SCALE_FREQUENCY_MEDIAOBJECT + scalePhaseOffset) * BREATHING_SCALE_AMPLITUDE_MEDIAOBJECT;
      
      // --- MODIFICA: Interpolazione fluida dello zoom in hover ---
      const targetHoverScale = hoverScale;
      const finalScaleVal = basePulse * targetHoverScale;
      
      // Usiamo damp per l'interpolazione, il "8" è la velocità (più basso = più lento)
      mesh.scale.x = THREE.MathUtils.damp(mesh.scale.x, finalScaleVal, 8, delta);
      mesh.scale.y = THREE.MathUtils.damp(mesh.scale.y, finalScaleVal, 8, delta);
    }

    const now = performance.now();
    if (isVideo && videoState === 'playing' &&
        videoTextureRef.current && videoElementRef.current &&
        videoElementRef.current.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA &&
        (now - lastVideoUpdateTime.current) > VIDEO_UPDATE_INTERVAL) {
      if (videoTextureRef.current.image !== videoElementRef.current) {
        videoTextureRef.current.image = videoElementRef.current;
      }
      videoTextureRef.current.needsUpdate = true;
      lastVideoUpdateTime.current = now;
    }
  });

  const textureToDisplayInShader = useMemo(() => {
    const videoTextureActual = videoTextureRef.current;
    if (isVideo && shouldPlayVideo && isVisuallyActive &&
        (videoState === 'playing' || videoState === 'ready_paused' || videoState === 'paused_by_user') &&
        videoTextureActual) {
        return videoTextureActual;
    }
    return staticTexture;
  }, [isVideo, shouldPlayVideo, isVisuallyActive, videoState, staticTexture, videoTextureRef]);

  const showContentTexture = useMemo<boolean>(() => {
    if (!isVideo) return isStaticTexturePrimed && !!staticTexture;

    const videoTextureReadyAndActive = shouldPlayVideo && isVisuallyActive &&
        (videoState === 'playing' || videoState === 'ready_paused' || videoState === 'paused_by_user') &&
        !!videoTextureRef.current;

    if (videoTextureReadyAndActive) return true;

    return isStaticTexturePrimed && !!staticTexture;
  }, [isVideo, staticTexture, isStaticTexturePrimed, shouldPlayVideo, isVisuallyActive, videoState, videoTextureRef]);


  const shaderMaterial = useMemo(() => {
    if (!textureToDisplayInShader) return null;
    return new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: textureToDisplayInShader },
        opacity: { value: effects.opacity / 100 },
        uTextureZoomFactor: { value: 1.0 },
      },
      vertexShader: simpleVertexShaderCode, fragmentShader: fragmentShaderCode,
      side: THREE.DoubleSide, transparent: true, depthTest: true, depthWrite: true,
      toneMapped: !(textureToDisplayInShader instanceof THREE.VideoTexture),
    });
  }, [textureToDisplayInShader, effects.opacity]);

  useEffect(() => {
    if (mainMeshRef.current) {
      if (shaderMaterial && showContentTexture) {
        mainMeshRef.current.material = shaderMaterial;
      } else if (loadingPlaceholderMaterial) {
        mainMeshRef.current.material = loadingPlaceholderMaterial;
      }
    }
  }, [shaderMaterial, showContentTexture, loadingPlaceholderMaterial]);

  useEffect(() => {
    if (shaderMaterial?.uniforms.opacity) {
      shaderMaterial.uniforms.opacity.value = (effects.opacity || 100) / 100;
    }
  }, [effects.opacity, shaderMaterial]);

  const handleItemInteraction = useCallback((e?: React.MouseEvent<THREE.Mesh | HTMLDivElement>) => {
    if (e) e.stopPropagation();
    if (item.id === focusedItemId) onItemClick(null);
    else onItemClick(item.id);
  }, [item.id, focusedItemId, onItemClick]);

  const idHashForScale = useMemo(() => { return item.id.split('').reduce((acc, char, idx) => acc + char.charCodeAt(0) * (idx + 1), 0); }, [item.id]);
  const scalePhaseOffset = useMemo(() => (idHashForScale % 1000 / 1000.0) * Math.PI * 2, [idHashForScale]);
  
  // hoverScale ora determina il *target* dello scale, l'animazione avviene in useFrame
  const hoverScale = useMemo(() => 
    (hovered || isRemoteHovered) && (item.id !== focusedItemId) ? 1.15 : 1.0, 
    [hovered, isRemoteHovered, item.id, focusedItemId]
  );
  
  const lastVideoUpdateTime = useRef(0);
  const VIDEO_UPDATE_INTERVAL = 1000 / 30;

  const itemScaleFactor = isVideo ? (effects.mediaSize || 1.0) : (effects.imageSize || 1.0);
  const LINE_HEIGHT_MULTIPLIER = 1.25;
  const titleFontSize = Math.max(0.07, 0.08 * itemScaleFactor);
  const regularFontSize = Math.max(0.06, 0.07 * itemScaleFactor);
  const FONT_BOLD = '/fonts/SourceCodePro-ExtraBold.ttf';
  const FONT_REGULAR = '/fonts/SourceCodePro-Regular.ttf';
  const [titleActualHeight, setTitleActualHeight] = useState(0);
  const [categoryActualHeight, setCategoryActualHeight] = useState(0);
  const baseScale = 1.8;
  const currentItemWidth = baseScale * itemScaleFactor;
  const currentItemHeight = (baseScale / aspectRatio) * itemScaleFactor;
  const TEXT_PADDING_BELOW_IMAGE = 0.08 * itemScaleFactor;
  const titleText = item.title || '';
  const categoryText = item.category ? `decade: ${item.category}` : '';
  const yearText = item.year ? `(${item.year})` : '';
  const textBaseX = -currentItemWidth / 2;
  const initialTextY = (-currentItemHeight / 2) - TEXT_PADDING_BELOW_IMAGE;

  const textColor = useMemo<string>(() => {
    try {
      const bgColor = new THREE.Color(sceneBackgroundColor instanceof THREE.Color ? sceneBackgroundColor.getHex() : sceneBackgroundColor);
      const luminance = (0.299 * bgColor.r + 0.587 * bgColor.g + 0.114 * bgColor.b);
      return luminance < 0.5 ? '#ffffff' : '#000000';
    } catch (e) { return '#FFFFFF'; }
  }, [sceneBackgroundColor]);

  const handleTextSync = useCallback((mesh: TroikaTextClass, setTextHeight: (h: number) => void, textContent: string, defaultH: number) => {
    if (mesh && mesh.textRenderInfo && textContent) {
      const height = Math.abs(mesh.textRenderInfo.blockBounds[3] - mesh.textRenderInfo.blockBounds[1]);
      setTextHeight(height > 0 ? height : defaultH);
    } else { setTextHeight(textContent ? defaultH : 0); }
  }, []);

  useEffect(() => {
    if (!displayItemMetadata) {
      setTitleActualHeight(0); setCategoryActualHeight(0);
    } else {
      setTitleActualHeight(titleText ? titleFontSize * LINE_HEIGHT_MULTIPLIER : 0);
      setCategoryActualHeight(categoryText ? regularFontSize * LINE_HEIGHT_MULTIPLIER : 0);
    }
  }, [displayItemMetadata, item.id, titleText, categoryText, titleFontSize, regularFontSize, LINE_HEIGHT_MULTIPLIER]);

  const titleEffectiveHeight = titleText && displayItemMetadata ? titleActualHeight : 0;
  const categoryEffectiveHeight = categoryText && displayItemMetadata ? categoryActualHeight : 0;
  const categoryYPos = initialTextY - titleEffectiveHeight;
  const yearYPos = categoryYPos - categoryEffectiveHeight;

  return (
    <group ref={groupRef} position={position} userData={{ itemId: item.id, componentId }}>
      <mesh
        ref={mainMeshRef}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
        onClick={(e) => handleItemInteraction(e as any)}
      >
        <planeGeometry args={[currentItemWidth, currentItemHeight, 1, 1]} />
      </mesh>
      {displayItemMetadata && showContentTexture && titleText && (
        <Text
          position={[textBaseX, initialTextY, 0.01]} fontSize={titleFontSize} color={textColor} font={FONT_BOLD}
          anchorX="left" anchorY="top" lineHeight={LINE_HEIGHT_MULTIPLIER} maxWidth={currentItemWidth} textAlign="left"
          onSync={ (mesh) => handleTextSync(mesh as TroikaTextClass, setTitleActualHeight, titleText, titleFontSize * LINE_HEIGHT_MULTIPLIER) }
          raycast={NoOpRaycast}
        >
          {titleText}
        </Text>
      )}
      {displayItemMetadata && showContentTexture && categoryText && (
        <Text
          position={[textBaseX, categoryYPos, 0.01]} fontSize={regularFontSize} color={textColor} font={FONT_REGULAR}
          anchorX="left" anchorY="top" lineHeight={LINE_HEIGHT_MULTIPLIER} maxWidth={currentItemWidth} textAlign="left"
          onSync={ (mesh) => handleTextSync(mesh as TroikaTextClass, setCategoryActualHeight, categoryText, regularFontSize * LINE_HEIGHT_MULTIPLIER) }
          raycast={NoOpRaycast}
        >
          {categoryText}
        </Text>
      )}
      {displayItemMetadata && showContentTexture && yearText && (
        <Text
          position={[textBaseX, yearYPos, 0.01]} fontSize={regularFontSize} color={textColor} font={FONT_REGULAR}
          anchorX="left" anchorY="top" lineHeight={LINE_HEIGHT_MULTIPLIER} maxWidth={currentItemWidth} textAlign="left"
          raycast={NoOpRaycast}
        >
          {yearText}
        </Text>
      )}
    </group>
  );
};

export const MediaMesh: React.FC<Omit<MediaObjectProps, 'isVideo' | 'videoQuality' | 'primaryRelatedVisualItemIds' >> = React.memo((props) => {
  return <MediaObject {...props} isVideo={false} />;
});

export const VideoMesh: React.FC<Omit<MediaObjectProps, 'isVideo'>> = React.memo((props) => {
  return <MediaObject {...props} isVideo={true} />;
});