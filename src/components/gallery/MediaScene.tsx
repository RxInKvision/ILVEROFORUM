// src/components/gallery/MediaScene.tsx

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, RootState } from '@react-three/fiber';
import { MediaItem as MediaItemFromService, isAudioItem, areTitlesSimilar } from '../../services/mediaService';
import { LAYOUT_TYPES } from '../../constants/layoutTypes';
import { VIEW_MODES } from '../../constants/viewSettings';
import { VisualEffects, MediaMesh, VideoMesh, ExtendedMediaItem, VideoQuality, PositionalAudioFilterConfig, MediaObjectProps } from './MediaItems';
import { ConnectionLines } from './ConnectionLines';

export enum CAMERA_PRESETS {
    DEFAULT = 'default',
    TOP_DOWN = 'top-down',
    SIDE_VIEW = 'side-view',
    DIAGONAL = 'diagonal',
    CLOSE_UP = 'close-up',
    EXTREME_ANGLE = 'extreme-angle',
    ITEM_FOCUSED = 'item-focused'
}

interface PlaylistOrigin {
    musician: string | null | undefined;
    title: string | null | undefined;
}

const Z_FOREGROUND_FOCUS = 9;
const FOCUSED_ITEM_SCALE_MULTIPLIER = 2.3;
const Z_PRIMARY_RELATED_LAYER_FOCUS = 7;
const PRIMARY_RELATED_LAYER_MIN_RADIUS = 2;
const PRIMARY_RELATED_LAYER_MAX_RADIUS = 4.5;
const PRIMARY_RELATED_LAYER_Y_OFFSET = 0.0;
const PRIMARY_RELATED_LAYER_Y_SPREAD_FACTOR = 1;
const PRIMARY_RELATED_LAYER_Z_JITTER = 0.6;
const PRIMARY_RELATED_ITEM_SCALE_MULTIPLIER = 0.92;
const PRIMARY_VISUAL_ANGULAR_JITTER_FACTOR = 0.4;
const Z_SECONDARY_RELATED_LAYER_FOCUS = -3.5;
const SECONDARY_RELATED_LAYER_MIN_RADIUS = 7.0;
const SECONDARY_RELATED_LAYER_MAX_RADIUS = 14.0;
const SECONDARY_RELATED_LAYER_Y_OFFSET = 0.0;
const SECONDARY_RELATED_LAYER_Y_SPREAD_FACTOR = 1.0;
const SECONDary_RELATED_LAYER_Z_JITTER = 8.5;
const SECONDARY_RELATED_ITEM_SCALE_MULTIPLIER = 0.70;
const SECONDARY_VISUAL_ANGULAR_JITTER_FACTOR = 3.25;
const Z_BACKGROUND_FOCUS_FAR = -55;
const FAR_BACKGROUND_MIN_RADIUS_X = 70;
const FAR_BACKGROUND_MAX_RADIUS_X = 95;
const FAR_BACKGROUND_MIN_RADIUS_Y = 25;
const FAR_BACKGROUND_MAX_RADIUS_Y = 55;
const FAR_BACKGROUND_SCATTER_DEPTH_Z = 35;
const FAR_BACKGROUND_OPACITY = 60;
const DEFAULT_HIDDEN_POSITION = new THREE.Vector3(0, 0, -10000);
export const MIN_CAMERA_FOV = 20;
export const MAX_CAMERA_FOV = 80;
const BASE_LERP_FACTOR = 0.1;
const VISIBILITY_DISTANCE_THRESHOLD_SQUARED = 90 * 90;
const VISIBILITY_CHECK_INTERVAL = 250;
const FOCUSED_VIEW_CAMERA_POSITION_X: number = 0;
const FOCUSED_VIEW_CAMERA_POSITION_Y: number = -1;
const FOCUSED_VIEW_CAMERA_POSITION_Z_OFFSET: number = 11;
const FOCUSED_VIEW_TARGET_X_OFFSET: number = 0;
const FOCUSED_VIEW_TARGET_Y_OFFSET: number = -0.5;
const BREATHING_POSITION_AMPLITUDE_X = 0.15;
const BREATHING_POSITION_AMPLITUDE_Y = 0.03;
const BREATHING_POSITION_AMPLITUDE_Z = 0.25;
const BREATHING_POSITION_FREQUENCY = 0.1;
const AMBIENT_AUDIO_CANDIDATE_COUNT = 4;
const AMBIENT_AUDIO_CHECK_INTERVAL = 750;

export const getCameraPresetPosition = (preset: CAMERA_PRESETS): { position: THREE.Vector3, target: THREE.Vector3 } => {
    const focusedItemBaseX = 0;
    const focusedItemBaseY = 0;
    const focusedItemBaseZ = Z_FOREGROUND_FOCUS;
    switch(preset) {
        case CAMERA_PRESETS.TOP_DOWN: return { position: new THREE.Vector3(0, 30, 0.1), target: new THREE.Vector3(0, 0, 0) };
        case CAMERA_PRESETS.SIDE_VIEW: return { position: new THREE.Vector3(30, 0, 0), target: new THREE.Vector3(0, 0, 0) };
        case CAMERA_PRESETS.DIAGONAL: return { position: new THREE.Vector3(20, 20, 20), target: new THREE.Vector3(0, 0, 0) };
        case CAMERA_PRESETS.CLOSE_UP: return { position: new THREE.Vector3(focusedItemBaseX + FOCUSED_VIEW_CAMERA_POSITION_X, focusedItemBaseY + FOCUSED_VIEW_CAMERA_POSITION_Y, focusedItemBaseZ + FOCUSED_VIEW_CAMERA_POSITION_Z_OFFSET), target: new THREE.Vector3(focusedItemBaseX + FOCUSED_VIEW_TARGET_X_OFFSET, focusedItemBaseY + FOCUSED_VIEW_TARGET_Y_OFFSET, focusedItemBaseZ) };
        case CAMERA_PRESETS.ITEM_FOCUSED: return { position: new THREE.Vector3(focusedItemBaseX + FOCUSED_VIEW_CAMERA_POSITION_X, focusedItemBaseY + FOCUSED_VIEW_CAMERA_POSITION_Y, focusedItemBaseZ + FOCUSED_VIEW_CAMERA_POSITION_Z_OFFSET), target: new THREE.Vector3(focusedItemBaseX + FOCUSED_VIEW_TARGET_X_OFFSET, focusedItemBaseY + FOCUSED_VIEW_TARGET_Y_OFFSET, focusedItemBaseZ) };
        case CAMERA_PRESETS.EXTREME_ANGLE: return { position: new THREE.Vector3(5, -15, 10), target: new THREE.Vector3(0, 5, 0) };
        default: return { position: new THREE.Vector3(0, 0, 22), target: new THREE.Vector3(0, 0, 0) };
    }
};

interface MediaItemWithThumbnail extends MediaItemFromService {
    thumbnail_url?: string;
}

export interface MediaSceneProps {
    mediaItems: MediaItemWithThumbnail[];
    activeCategories: string[];
    layoutType: LAYOUT_TYPES;
    zoomLevel: number;
    viewMode: VIEW_MODES;
    seed: number;
    displayItemMetadata: boolean;
    noiseAmount?: number;
    opacity?: number;
    blendMode?: string;
    cameraPreset?: CAMERA_PRESETS;
    mediaSize?: number;
    imageSize?: number;
    manualControl?: boolean;
    onFocusPointShouldChange?: (newFocusPoint: THREE.Vector3) => void;
    onPresetAnimationComplete?: () => void;
    sceneBackgroundColor: THREE.ColorRepresentation;
    orbitControlsRef?: React.RefObject<any>;
    connectionLineThreshold?: number;
    connectionLineMaxConnectionsPerItem?: number;
    focusedItemId: string | null;
    onItemFocus: (itemId: string | null) => void;
    settledOnNewFocusTarget?: string | null;
    onPositionalAudioStateChange?: (itemId: string, isPlaying: boolean) => void;
    currentPlaylistOrigin?: PlaylistOrigin | null;
    isAudioPlayerActuallyPlaying?: boolean;
    positionalAudioHighPass?: number;
    positionalAudioLowPass?: number;
    positionalAudioQ?: number;
    onPlayingTracksChange?: (titles: string[]) => void;
    remotePointerNormalized: THREE.Vector2 | null;
    onRemoteItemHover: (item: MediaItemFromService | null) => void;
    remoteHoveredItemId: string | null;
    remoteClickSignal: number;
    remoteCursorVisible: boolean;
}

const AnimatedRingCursor: React.FC<{
    cursorRef: React.RefObject<THREE.Group | null>;
    isHovering: boolean;
    visible: boolean;
}> = ({ cursorRef, isHovering, visible }) => {
    const ringMaterialRef = useRef<THREE.MeshPhysicalMaterial>(null!);
    const fillMaterialRef = useRef<THREE.MeshBasicMaterial>(null!);
    const fillMeshRef = useRef<THREE.Mesh>(null!);
    const outerRingRef = useRef<THREE.Mesh>(null!);

    useEffect(() => { 
        if (cursorRef.current) cursorRef.current.visible = visible; 
    }, [visible, cursorRef]);

    useFrame((state, delta) => {
        if (!cursorRef.current || !cursorRef.current.visible) {
            if (fillMeshRef.current) fillMeshRef.current.visible = false;
            return;
        }
        
        const time = state.clock.getElapsedTime();
        const lerpFactor = delta * 12;
        
        if (outerRingRef.current) {
            outerRingRef.current.rotation.z += delta * 0.3;
        }
        
        if (ringMaterialRef.current) {
            const pulse = 0.9 + Math.sin(time * 2) * 0.1;
            ringMaterialRef.current.opacity = pulse;
        }
        
        if (fillMaterialRef.current && fillMeshRef.current) {
            const targetScale = isHovering ? 1 : 0;
            const newScale = THREE.MathUtils.lerp(fillMeshRef.current.scale.x, targetScale, lerpFactor);
            fillMeshRef.current.scale.setScalar(newScale);
            fillMaterialRef.current.opacity = newScale * 0.4;
            fillMeshRef.current.visible = newScale > 0.01;
        }
    });
    
    const ringRadius = 0.13;
    const tubeRadius = 0.009;
    
    return (
        <group ref={cursorRef} visible={false} renderOrder={1000}>
            <mesh ref={outerRingRef} name="CursorRingOuter">
                <torusGeometry args={[ringRadius, tubeRadius, 8, 32]} />
                <meshPhysicalMaterial 
                    ref={ringMaterialRef} 
                    color="#ffffff" 
                    emissive="#ffffff"
                    emissiveIntensity={0.3}
                    transmission={0.1}
                    roughness={0} 
                    metalness={0.8}
                    transparent={true} 
                    opacity={0.8}
                    depthTest={false} 
                    toneMapped={false} 
                />
            </mesh>
            <mesh ref={fillMeshRef} name="CursorRingFill" scale={0}>
                <circleGeometry args={[ringRadius - tubeRadius * 0.5, 32]} />
                <meshBasicMaterial 
                    ref={fillMaterialRef} 
                    color="#ffffff" 
                    transparent={true} 
                    opacity={0} 
                    depthTest={false} 
                    toneMapped={false} 
                    side={THREE.DoubleSide} 
                />
            </mesh>
            <mesh name="CursorGlow">
                <circleGeometry args={[ringRadius * 2, 32]} />
                <meshBasicMaterial 
                    color="#ffffff" 
                    transparent={true} 
                    opacity={0.1} 
                    depthTest={false} 
                    toneMapped={false}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>
        </group>
    );
};


const MediaScene: React.FC<MediaSceneProps> = ({
    mediaItems: allMediaItemsFromProps,
    activeCategories, layoutType, zoomLevel, viewMode, seed,
    displayItemMetadata,
    noiseAmount = 0.5,
    opacity = 100,
    blendMode = 'normal',
    cameraPreset = CAMERA_PRESETS.DEFAULT,
    mediaSize = 1.0,
    imageSize = 1.0,
    manualControl = false,
    onFocusPointShouldChange,
    onPresetAnimationComplete,
    sceneBackgroundColor,
    orbitControlsRef,
    connectionLineThreshold,
    connectionLineMaxConnectionsPerItem,
    focusedItemId,
    onItemFocus,
    currentPlaylistOrigin,
    isAudioPlayerActuallyPlaying,
    positionalAudioHighPass = 50,
    positionalAudioLowPass = 150,
    positionalAudioQ = 1,
    onPlayingTracksChange,
    remotePointerNormalized,
    onRemoteItemHover,
    remoteHoveredItemId,
    remoteClickSignal,
    remoteCursorVisible,
}) => {
    const { scene: r3fScene, camera } = useThree();
    const [calculatedTargetPositions, setCalculatedTargetPositions] = useState<Map<string, THREE.Vector3>>(new Map());
    const [animatedRenderPositions, setAnimatedRenderPositions] = useState<Map<string, THREE.Vector3>>(new Map());
    const [visualItemsToRender, setVisualItemsToRender] = useState<MediaItemWithThumbnail[]>([]);
    const [visuallyActiveItemIds, setVisuallyActiveItemIds] = useState<Set<string>>(new Set());
    const visibilityCheckTimerRef = useRef<NodeJS.Timeout | null>(null);
    const latestVisualPositionsRef = useRef<Map<string, THREE.Vector3>>(new Map(animatedRenderPositions));
    const [shouldRenderLinesActual, setShouldRenderLinesActual] = useState(false);
    const currentCameraFov = useRef((camera as THREE.PerspectiveCamera).fov);
    const frustumRef = useRef(new THREE.Frustum());
    const projScreenMatrixRef = useRef(new THREE.Matrix4());
    const isMountedRef = useRef(false);
    const audioListenerRef = useRef<THREE.AudioListener | null>(null);
    const [ambientAudioItemIds, setAmbientAudioItemIds] = useState<Set<string>>(new Set());
    const [ambientAudioSourceUrls, setAmbientAudioSourceUrls] = useState<Map<string, string | null>>(new Map());
    const lastAmbientAudioCheckTimeRef = useRef<number>(0);
    const [positionalAudioFilters, setPositionalAudioFilters] = useState<PositionalAudioFilterConfig>({ highPassFreq: positionalAudioHighPass, lowPassFreq: positionalAudioLowPass, q: positionalAudioQ });
    const getRandomStableRef = useRef<() => number>((() => { let s = seed; s = Math.sin(s) * 10000; return () => { s = Math.sin(s) * 10000; return s - Math.floor(s); }; })());
    const prevFocusedMusicianRef = useRef<string | null | undefined>(null);
    const stableFarBackgroundTargetPositionsRef = useRef<Map<string, THREE.Vector3>>(new Map());
    const prevFocusedItemIdRef = useRef<string | null>(null);
    const prevPrimaryClusterIdsRef = useRef<Set<string>>(new Set());
    const prevCalculatedTargetPositionsRef = useRef<Map<string, THREE.Vector3>>(new Map());

    // Ref per il controllo remoto
    const remoteRaycasterRef = useRef(new THREE.Raycaster());
    const remoteCursorGroupRef = useRef<THREE.Group>(null);
    const interactionPlaneRef = useRef<THREE.Mesh>(null);

    useEffect(() => { setPositionalAudioFilters({ highPassFreq: positionalAudioHighPass, lowPassFreq: positionalAudioLowPass, q: positionalAudioQ }); }, [positionalAudioHighPass, positionalAudioLowPass, positionalAudioQ]);
    useEffect(() => { let currentTitles: string[] = []; if (ambientAudioItemIds.size > 0) { const playingItems = allMediaItemsFromProps.filter(item => ambientAudioItemIds.has(item.id)); currentTitles = playingItems.map(item => item.title || 'Traccia senza titolo'); } if (onPlayingTracksChange) { onPlayingTracksChange(currentTitles); } }, [ambientAudioItemIds, allMediaItemsFromProps, onPlayingTracksChange]);
    useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; }; }, []);
    useEffect(() => { if (camera && !audioListenerRef.current) { audioListenerRef.current = new THREE.AudioListener(); camera.add(audioListenerRef.current); } return () => { if (audioListenerRef.current && camera && camera.children.includes(audioListenerRef.current)) { camera.remove(audioListenerRef.current); audioListenerRef.current = null; } }; }, [camera]);
    useEffect(() => { const shouldDisableAmbient = focusedItemId !== null || isAudioPlayerActuallyPlaying === true; if (shouldDisableAmbient) { if (isMountedRef.current) { setAmbientAudioItemIds(new Set()); setAmbientAudioSourceUrls(new Map()); } lastAmbientAudioCheckTimeRef.current = 0; } }, [focusedItemId, isAudioPlayerActuallyPlaying]);
    useEffect(() => { getRandomStableRef.current = (() => { let s = seed * 12345 + (visualItemsToRender?.length || 0); s = Math.sin(s) * 10000; return () => { s = Math.sin(s) * 10000; return s - Math.floor(s); }; })(); }, [seed, visualItemsToRender]);
    
    useEffect(() => { 
        const allVisualItems = allMediaItemsFromProps.filter(item => !isAudioItem(item)); 
        const activeVisualItems = activeCategories.length === 0 ? allVisualItems : allVisualItems.filter(item => activeCategories.includes(item.category)); 
        if (isMountedRef.current) { setVisualItemsToRender(currentList => { if (currentList.length === activeVisualItems.length && currentList.every((item, i) => item.id === activeVisualItems[i].id)) { return currentList; } return activeVisualItems; }); } 
        if (isMountedRef.current) {
            setAnimatedRenderPositions(prevPositions => { 
                const nextPositions = new Map<string, THREE.Vector3>(); 
                const currentRenderableVisualIds = new Set(activeVisualItems.map(item => item.id)); 
                let changed = false; 
                prevPositions.forEach((pos, id) => { if (currentRenderableVisualIds.has(id)) { nextPositions.set(id, pos); } else { changed = true; } }); 
                if (activeVisualItems.some(item => !prevPositions.has(item.id))) { changed = true; } 
                if (!changed && prevPositions.size === nextPositions.size) return prevPositions; 
                return nextPositions; 
            }); 
        }
    }, [allMediaItemsFromProps, activeCategories]);

    const effectsGlobal = useMemo<VisualEffects>(() => ({ opacity, blendMode, mediaSize, imageSize }), [opacity, blendMode, mediaSize, imageSize]);
    const focusedVisualItemObject = useMemo(() => visualItemsToRender.find(item => item.id === focusedItemId) || null, [focusedItemId, visualItemsToRender]);
    const primaryRelatedVisualItemIds = useMemo(() => { if (!focusedVisualItemObject?.musician || !focusedVisualItemObject.title) return new Set<string>(); const ids = new Set<string>(); visualItemsToRender.forEach(item => { if (item.id !== focusedVisualItemObject.id && item.musician === focusedVisualItemObject.musician && areTitlesSimilar(item.title, focusedVisualItemObject.title ?? undefined)) { ids.add(item.id); } }); return ids; }, [focusedVisualItemObject, visualItemsToRender]);
    const secondaryRelatedVisualItemIds = useMemo(() => { if (!focusedVisualItemObject?.musician || !focusedVisualItemObject.title) return new Set<string>(); const ids = new Set<string>(); visualItemsToRender.forEach(item => { if (item.id !== focusedVisualItemObject.id && item.musician === focusedVisualItemObject.musician && !primaryRelatedVisualItemIds.has(item.id) && !areTitlesSimilar(item.title, focusedVisualItemObject.title ?? undefined)) { ids.add(item.id); } }); return ids; }, [focusedVisualItemObject, visualItemsToRender, primaryRelatedVisualItemIds]);
    const farBackgroundVisualItemIds = useMemo(() => { if (!focusedVisualItemObject) return new Set<string>(); const ids = new Set<string>(); const musicianOfFocused = focusedVisualItemObject.musician; visualItemsToRender.forEach(item => { if (item.id === focusedVisualItemObject.id || primaryRelatedVisualItemIds.has(item.id) || secondaryRelatedVisualItemIds.has(item.id)) return; if (musicianOfFocused && item.musician === musicianOfFocused) return; ids.add(item.id); }); if (!musicianOfFocused || ids.size === 0 && focusedVisualItemObject) { visualItemsToRender.forEach(item => { if (item.id !== focusedVisualItemObject.id && !primaryRelatedVisualItemIds.has(item.id) && !secondaryRelatedVisualItemIds.has(item.id)) { ids.add(item.id); } }); } return ids; }, [focusedVisualItemObject, visualItemsToRender, primaryRelatedVisualItemIds, secondaryRelatedVisualItemIds]);
    useEffect(() => { const newTargetPositionsMap = new Map<string, THREE.Vector3>(); const getRandom = getRandomStableRef.current; const currentFocusedItemIdVal = focusedVisualItemObject?.id || null; const currentFocusedMusician = focusedVisualItemObject?.musician; const previousMusician = prevFocusedMusicianRef.current; const previousFocusedItemIdVal = prevFocusedItemIdRef.current; const previousPrimaryClusterIds = prevPrimaryClusterIdsRef.current; const lastCalculatedTargets = prevCalculatedTargetPositionsRef.current; let freezeSecondaryAndFarBgPositions = false; if (focusedVisualItemObject && previousFocusedItemIdVal && currentFocusedMusician === previousMusician && currentFocusedItemIdVal !== null && previousPrimaryClusterIds.has(currentFocusedItemIdVal)) { freezeSecondaryAndFarBgPositions = true; } const forceRecalculateFarBackground = (focusedVisualItemObject && previousMusician !== currentFocusedMusician) || (focusedVisualItemObject && previousMusician === undefined && currentFocusedItemIdVal !== null); if (focusedVisualItemObject) { newTargetPositionsMap.set(focusedVisualItemObject.id, new THREE.Vector3(0, 0, Z_FOREGROUND_FOCUS)); const localPrimaryVisuals = visualItemsToRender.filter(item => primaryRelatedVisualItemIds.has(item.id)); localPrimaryVisuals.forEach((item, index) => { const angleOffset = localPrimaryVisuals.length > 1 ? (Math.PI * 0.3 / localPrimaryVisuals.length) : 0; const baseAngle = (index / Math.max(1, localPrimaryVisuals.length)) * Math.PI * 2 + angleOffset; const angle = baseAngle + (getRandom() - 0.5) * (PRIMARY_VISUAL_ANGULAR_JITTER_FACTOR / Math.max(1,localPrimaryVisuals.length)); const radius = PRIMARY_RELATED_LAYER_MIN_RADIUS + getRandom() * (PRIMARY_RELATED_LAYER_MAX_RADIUS - PRIMARY_RELATED_LAYER_MIN_RADIUS); const x = radius * Math.cos(angle); const y = radius * Math.sin(angle) * PRIMARY_RELATED_LAYER_Y_SPREAD_FACTOR + PRIMARY_RELATED_LAYER_Y_OFFSET; const z = Z_PRIMARY_RELATED_LAYER_FOCUS + (getRandom() - 0.5) * PRIMARY_RELATED_LAYER_Z_JITTER; newTargetPositionsMap.set(item.id, new THREE.Vector3(x, y, z)); }); const localSecondaryVisuals = visualItemsToRender.filter(item => secondaryRelatedVisualItemIds.has(item.id)); if (freezeSecondaryAndFarBgPositions) { localSecondaryVisuals.forEach(item => { const previousTarget = lastCalculatedTargets.get(item.id); if (previousTarget && secondaryRelatedVisualItemIds.has(item.id)) { newTargetPositionsMap.set(item.id, previousTarget); } else { const index = localSecondaryVisuals.indexOf(item); const angle = (index / Math.max(1, localSecondaryVisuals.length)) * Math.PI * 2 + (getRandom() - 0.5) * SECONDARY_VISUAL_ANGULAR_JITTER_FACTOR; const radius = SECONDARY_RELATED_LAYER_MIN_RADIUS + getRandom() * (SECONDARY_RELATED_LAYER_MAX_RADIUS - SECONDARY_RELATED_LAYER_MIN_RADIUS); newTargetPositionsMap.set(item.id, new THREE.Vector3(radius * Math.cos(angle), radius * Math.sin(angle) * SECONDARY_RELATED_LAYER_Y_SPREAD_FACTOR + SECONDARY_RELATED_LAYER_Y_OFFSET, Z_SECONDARY_RELATED_LAYER_FOCUS + (getRandom() - 0.5) * SECONDary_RELATED_LAYER_Z_JITTER));} }); } else { localSecondaryVisuals.forEach((item, index) => { const angleOffset = localSecondaryVisuals.length > 1 ? (Math.PI * 0.2 / localSecondaryVisuals.length) : 0; const baseAngle = (index / Math.max(1,localSecondaryVisuals.length)) * Math.PI * 2 + angleOffset; const angle = baseAngle + (getRandom() - 0.5) * (SECONDARY_VISUAL_ANGULAR_JITTER_FACTOR / Math.max(1, localSecondaryVisuals.length)); const radius = SECONDARY_RELATED_LAYER_MIN_RADIUS + getRandom() * (SECONDARY_RELATED_LAYER_MAX_RADIUS - SECONDARY_RELATED_LAYER_MIN_RADIUS); const x = radius * Math.cos(angle); const y = radius * Math.sin(angle) * SECONDARY_RELATED_LAYER_Y_SPREAD_FACTOR + SECONDARY_RELATED_LAYER_Y_OFFSET; const zPos = Z_SECONDARY_RELATED_LAYER_FOCUS + (getRandom() - 0.5) * SECONDary_RELATED_LAYER_Z_JITTER; newTargetPositionsMap.set(item.id, new THREE.Vector3(x, y, zPos)); }); } const localFarBackgroundVisuals = visualItemsToRender.filter(item => farBackgroundVisualItemIds.has(item.id)); if (forceRecalculateFarBackground) stableFarBackgroundTargetPositionsRef.current.clear(); localFarBackgroundVisuals.forEach((item) => { let pos = (freezeSecondaryAndFarBgPositions || !forceRecalculateFarBackground) ? stableFarBackgroundTargetPositionsRef.current.get(item.id) : undefined; if (!pos && freezeSecondaryAndFarBgPositions) pos = lastCalculatedTargets.get(item.id); if (!pos || forceRecalculateFarBackground || (!freezeSecondaryAndFarBgPositions && !stableFarBackgroundTargetPositionsRef.current.has(item.id))) { const angle = getRandom() * Math.PI * 2; const radiusFactor = 0.6 + getRandom() * 0.4; const rX = FAR_BACKGROUND_MIN_RADIUS_X + (FAR_BACKGROUND_MAX_RADIUS_X - FAR_BACKGROUND_MIN_RADIUS_X) * radiusFactor; const rY = FAR_BACKGROUND_MIN_RADIUS_Y + (FAR_BACKGROUND_MAX_RADIUS_Y - FAR_BACKGROUND_MIN_RADIUS_Y) * radiusFactor; pos = new THREE.Vector3(rX * Math.cos(angle), rY * Math.sin(angle), Z_BACKGROUND_FOCUS_FAR + (getRandom() - 0.5) * FAR_BACKGROUND_SCATTER_DEPTH_Z); if (!freezeSecondaryAndFarBgPositions || forceRecalculateFarBackground) { stableFarBackgroundTargetPositionsRef.current.set(item.id, pos); } } if(pos) newTargetPositionsMap.set(item.id, pos); }); if (onFocusPointShouldChange) onFocusPointShouldChange(new THREE.Vector3(0, 0, Z_FOREGROUND_FOCUS)); } else { let itemsForDefaultLayout = [...visualItemsToRender]; if (itemsForDefaultLayout.length > 1 && (layoutType === LAYOUT_TYPES.RANDOM_3D || layoutType === LAYOUT_TYPES.SPHERE_SURFACE)) { for (let i = itemsForDefaultLayout.length - 1; i > 0; i--) { const j = Math.floor(getRandom() * (i + 1)); [itemsForDefaultLayout[i], itemsForDefaultLayout[j]] = [itemsForDefaultLayout[j], itemsForDefaultLayout[i]];} } const countDefault = itemsForDefaultLayout.length; let basePositions: { x: number, y: number, z: number }[] = []; const baseRadiusForLayouts = 10; const isNoNoiseCollapseLayout = (layoutType === LAYOUT_TYPES.RANDOM_3D || layoutType === LAYOUT_TYPES.SPHERE_SURFACE) && noiseAmount === 0 && countDefault > 1; const baseRadiusForRandom = isNoNoiseCollapseLayout ? 0 : 35; const random3D_ZDepthEmphasisFactor = 1.5; if (countDefault > 0) { switch (layoutType) { case LAYOUT_TYPES.GRID: const iPR = Math.max(1,Math.ceil(Math.sqrt(countDefault))); const sG = baseRadiusForLayouts * 0.3; const nRG = Math.max(1,Math.ceil(countDefault / iPR)); for (let i=0;i<countDefault;i++){const r=Math.floor(i/iPR);const c=i%iPR;basePositions.push({x:(c-(iPR-1)/2)*sG,y:(r-(nRG-1)/2)*sG*-1,z:0});}break; case LAYOUT_TYPES.COLUMN: const cS = baseRadiusForLayouts*0.25;for(let i=0;i<countDefault;i++){basePositions.push({x:0,y:(i-(countDefault-1)/2)*cS*-1,z:0});}break; case LAYOUT_TYPES.ROW: const rS = baseRadiusForLayouts*0.3;for(let i=0;i<countDefault;i++){basePositions.push({x:(i-(countDefault-1)/2)*rS,y:0,z:0});}break; case LAYOUT_TYPES.SPIRAL: const sTS=baseRadiusForLayouts*0.1;const sAS=0.3+(3/Math.max(1,countDefault*0.1));const zIS=-0.05*(baseRadiusForLayouts/10);for(let i=0;i<countDefault;i++){const a=i*sAS;const rSp=sTS*a*0.5;basePositions.push({x:rSp*Math.cos(a),y:rSp*Math.sin(a),z:i*zIS});}break; case LAYOUT_TYPES.RANDOM_3D: for(let i=0;i<countDefault;i++){if(isNoNoiseCollapseLayout){basePositions.push({x:0,y:0,z:0});continue;}const t_r=getRandom()*Math.PI*2;const p_r=Math.acos(2*getRandom()-1);const r_R=baseRadiusForRandom*noiseAmount*Math.cbrt(getRandom());basePositions.push({x:r_R*Math.sin(p_r)*Math.cos(t_r),y:r_R*Math.sin(p_r)*Math.sin(t_r),z:(r_R*Math.cos(p_r))*random3D_ZDepthEmphasisFactor});}break; case LAYOUT_TYPES.SPHERE_SURFACE: const sS=countDefault>0?countDefault:1;const pGS=Math.PI*(Math.sqrt(5.)-1);for(let i=0;i<sS;i++){if(isNoNoiseCollapseLayout){basePositions.push({x:0,y:0,z:0});continue;}const y_s=1-(i/Math.max(1,sS-1))*2;const radius_s=Math.sqrt(1-y_s*y_s);const theta_s=pGS*i;const x_=Math.cos(theta_s)*radius_s;const z_=Math.sin(theta_s)*radius_s;basePositions.push({x:x_*baseRadiusForRandom*noiseAmount,y:y_s*baseRadiusForRandom*noiseAmount,z:z_*baseRadiusForRandom*noiseAmount});}break; case LAYOUT_TYPES.TUBE: const tR=baseRadiusForLayouts*0.7;const tH=baseRadiusForLayouts*1.5;const iPRT=Math.max(1,Math.floor(countDefault/Math.max(1,Math.round(tH/(baseRadiusForLayouts*0.3))))||8);const nRT=Math.max(1,Math.ceil(countDefault/iPRT));const rHT=nRT>1?tH/Math.max(1,nRT-1):0;for(let i=0;i<countDefault;i++){const cRI=Math.floor(i/iPRT);const iICR=i%iPRT;const iITAR=(cRI===nRT-1&&countDefault%iPRT!==0)?(countDefault%iPRT):iPRT;const a_t=(iICR/Math.max(1,iITAR))*Math.PI*2+(cRI%2)*(Math.PI/Math.max(1,iITAR));basePositions.push({x:tR*Math.cos(a_t),y:(nRT>1)?(cRI*rHT)-tH/2:0,z:tR*Math.sin(a_t)}); }break; default: const iPRDef=Math.max(1,Math.floor(Math.sqrt(countDefault)*1.2));const spDef=baseRadiusForLayouts*0.25;for(let i=0;i<countDefault;i++){basePositions.push({x:(i%iPRDef-(iPRDef-1)/2)*spDef,y:(Math.floor(i/iPRDef)-Math.floor(countDefault/iPRDef)/2)*spDef*-1,z:0});}break; } if(countDefault>0&&basePositions.length===0&&isNoNoiseCollapseLayout)basePositions.push({x:0,y:0,z:0}); while(basePositions.length>0&&basePositions.length<countDefault)basePositions.push({...basePositions[basePositions.length%basePositions.length]}); const jitterMag=noiseAmount*baseRadiusForLayouts*0.05; itemsForDefaultLayout.forEach((item,i)=>{const bp=basePositions[i%basePositions.length]||{x:0,y:0,z:0};const finalPos=new THREE.Vector3(bp.x,bp.y,bp.z);if(noiseAmount>0.001&&layoutType!==LAYOUT_TYPES.RANDOM_3D&&layoutType!==LAYOUT_TYPES.SPHERE_SURFACE)finalPos.add(new THREE.Vector3((getRandom()-0.5)*jitterMag,(getRandom()-0.5)*jitterMag,(getRandom()-0.5)*jitterMag*0.5));newTargetPositionsMap.set(item.id,finalPos);}); } if (onFocusPointShouldChange) { onFocusPointShouldChange(new THREE.Vector3(0,0,0)); } stableFarBackgroundTargetPositionsRef.current.clear(); } if (isMountedRef.current) setCalculatedTargetPositions(newTargetPositionsMap); prevCalculatedTargetPositionsRef.current = new Map(newTargetPositionsMap); if (focusedVisualItemObject) { const currentPrimaryCluster = new Set(primaryRelatedVisualItemIds); if(focusedVisualItemObject.id) currentPrimaryCluster.add(focusedVisualItemObject.id); prevPrimaryClusterIdsRef.current = currentPrimaryCluster; prevFocusedItemIdRef.current = focusedVisualItemObject.id; } else { prevPrimaryClusterIdsRef.current.clear(); prevFocusedItemIdRef.current = null; } prevFocusedMusicianRef.current = currentFocusedMusician; }, [visualItemsToRender, layoutType, seed, noiseAmount, onFocusPointShouldChange, focusedVisualItemObject, primaryRelatedVisualItemIds, secondaryRelatedVisualItemIds, farBackgroundVisualItemIds, effectsGlobal.mediaSize, effectsGlobal.imageSize]);
    useEffect(() => { if(isMountedRef.current) setAnimatedRenderPositions(curr => { const next = new Map(curr); let needsUpd = false; const allIds = new Set(visualItemsToRender.map(it=>it.id)); visualItemsToRender.forEach(it => { if(!next.has(it.id)){needsUpd=true; const tgt = calculatedTargetPositions.get(it.id); next.set(it.id, tgt ? tgt.clone() : DEFAULT_HIDDEN_POSITION.clone());}}); curr.forEach((_,id)=>{if(!allIds.has(id)){next.delete(id); needsUpd=true;}}); if(needsUpd) return next; return curr;});}, [visualItemsToRender, calculatedTargetPositions]);
    useEffect(() => { if((camera as THREE.PerspectiveCamera).isPerspectiveCamera){const tgtFov=MAX_CAMERA_FOV-zoomLevel*(MAX_CAMERA_FOV-MIN_CAMERA_FOV);if(Math.abs((camera as THREE.PerspectiveCamera).fov-tgtFov)>0.01){(camera as THREE.PerspectiveCamera).fov=tgtFov;currentCameraFov.current=(camera as THREE.PerspectiveCamera).fov;(camera as THREE.PerspectiveCamera).updateProjectionMatrix();}}}, [camera, zoomLevel]);
    useEffect(() => { const ctrls=orbitControlsRef?.current;if(manualControl||!(camera as THREE.PerspectiveCamera).isPerspectiveCamera||!ctrls||!ctrls.object||!ctrls.target)return;const animTgtPreset=cameraPreset;const presetCfg=getCameraPresetPosition(animTgtPreset);const tgtPos=presetCfg.position;const lookAtTgt=presetCfg.target;const sTime=Date.now();const dur=1200;const initPos=camera.position.clone();const initLookAt=ctrls.target.clone();const initFov=(camera as THREE.PerspectiveCamera).fov;const tgtFovPreset=MAX_CAMERA_FOV-zoomLevel*(MAX_CAMERA_FOV-MIN_CAMERA_FOV);let animFrameId:number;const anim=()=>{if(!isMountedRef.current){if(animFrameId)cancelAnimationFrame(animFrameId);return;}const currRefCtrls=orbitControlsRef?.current;if(manualControl||cameraPreset!==animTgtPreset||!currRefCtrls||!currRefCtrls.target){if(animFrameId)cancelAnimationFrame(animFrameId);return;}const elapsed=Date.now()-sTime;const prog=Math.min(elapsed/dur,1);const easeProg=0.5*(1-Math.cos(prog*Math.PI));camera.position.lerpVectors(initPos,tgtPos,easeProg);const currInterLookAt=new THREE.Vector3().lerpVectors(initLookAt,lookAtTgt,easeProg);currRefCtrls.target.copy(currInterLookAt);(camera as THREE.PerspectiveCamera).fov=THREE.MathUtils.lerp(initFov,tgtFovPreset,easeProg);currentCameraFov.current=(camera as THREE.PerspectiveCamera).fov;(camera as THREE.PerspectiveCamera).updateProjectionMatrix();if(currRefCtrls.update)currRefCtrls.update();if(prog<1){animFrameId=requestAnimationFrame(anim);}else{camera.position.copy(tgtPos);currRefCtrls.target.copy(lookAtTgt);(camera as THREE.PerspectiveCamera).fov=tgtFovPreset;currentCameraFov.current=(camera as THREE.PerspectiveCamera).fov;(camera as THREE.PerspectiveCamera).updateProjectionMatrix();if(currRefCtrls.update)currRefCtrls.update();if(onPresetAnimationComplete)onPresetAnimationComplete();}};animFrameId=requestAnimationFrame(anim);return()=>{if(animFrameId)cancelAnimationFrame(animFrameId);};}, [camera,cameraPreset,manualControl,zoomLevel,onPresetAnimationComplete,orbitControlsRef,focusedItemId]);
    const updateAmbientAudioCandidates = useCallback(() => { if (!isMountedRef.current || !audioListenerRef.current || !camera || focusedItemId !== null || isAudioPlayerActuallyPlaying === true) { if (isMountedRef.current && (focusedItemId !== null || isAudioPlayerActuallyPlaying === true))if (isMountedRef.current && (ambientAudioItemIds.size > 0 || ambientAudioSourceUrls.size > 0)) { setAmbientAudioItemIds(new Set()); setAmbientAudioSourceUrls(new Map()); } return; } const newIds = new Set<string>(); const newUrls = new Map<string, string | null>(); const camPos = new THREE.Vector3(); camera.getWorldPosition(camPos); const pot = visualItemsToRender.map(it => ({ it, pos: latestVisualPositionsRef.current.get(it.id) })).filter(o => o.pos && o.pos.z > (DEFAULT_HIDDEN_POSITION.z+10)).map(o => ({ it:o.it, dSq:o.pos!.distanceToSquared(camPos)})).sort((a,b)=>a.dSq-b.dSq); let cnt = 0; for(const {it:visIt} of pot) { if(cnt >= AMBIENT_AUDIO_CANDIDATE_COUNT) break; const ascAud = allMediaItemsFromProps.find(audC => isAudioItem(audC) && audC.url && audC.musician && visIt.musician && audC.musician === visIt.musician && areTitlesSimilar(audC.title, visIt.title)); if(ascAud?.url){newIds.add(visIt.id); newUrls.set(visIt.id, ascAud.url); cnt++;}} if(isMountedRef.current){ setAmbientAudioItemIds(cIds => (cIds.size===newIds.size && Array.from(newIds).every(id=>cIds.has(id)))?cIds:newIds); setAmbientAudioSourceUrls(cUrls => (cUrls.size===newUrls.size && Array.from(newUrls).every(([id,url])=> cUrls.get(id)===url))?cUrls:newUrls);} }, [camera, visualItemsToRender, allMediaItemsFromProps, focusedItemId, isAudioPlayerActuallyPlaying]);
    useFrame((state: RootState, delta) => { const cam = state.camera as THREE.PerspectiveCamera; const time = state.clock.getElapsedTime(); if (cam instanceof THREE.PerspectiveCamera && manualControl) { const tgtFov=MAX_CAMERA_FOV-zoomLevel*(MAX_CAMERA_FOV-MIN_CAMERA_FOV); if(Math.abs(currentCameraFov.current-tgtFov)>0.01){currentCameraFov.current=THREE.MathUtils.lerp(currentCameraFov.current,tgtFov,BASE_LERP_FACTOR*0.5); cam.fov=currentCameraFov.current;cam.updateProjectionMatrix();}}
    if (interactionPlaneRef.current && remoteCursorGroupRef.current) {
        const planeNormal = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
        const focusedItemActual = focusedItemId ? latestVisualPositionsRef.current.get(focusedItemId) : null;
        let interactionPlaneDepth = focusedItemActual ? focusedItemActual.z - 0.1 : Math.min(Z_FOREGROUND_FOCUS - 0.5, cam.near + 5);
        interactionPlaneDepth = Math.max(cam.near + 0.1, interactionPlaneDepth);
        const planePosition = cam.position.clone().add(planeNormal.clone().multiplyScalar(interactionPlaneDepth));
        interactionPlaneRef.current.position.copy(planePosition);
        interactionPlaneRef.current.quaternion.copy(cam.quaternion);
        remoteCursorGroupRef.current.quaternion.copy(cam.quaternion);
        if (remotePointerNormalized && remoteCursorVisible) {
            remoteRaycasterRef.current.setFromCamera(remotePointerNormalized, cam);
            const intersectsPlane = remoteRaycasterRef.current.intersectObject(interactionPlaneRef.current);
            if (intersectsPlane.length > 0) {
                remoteCursorGroupRef.current.position.copy(intersectsPlane[0].point);
                const interactableObjects: THREE.Object3D[] = [];
                r3fScene.traverse((object) => {
                    if (object.userData.itemId && object.visible && object.parent?.visible) {
                        interactableObjects.push(object);
                    }
                });
                const intersectsItems = remoteRaycasterRef.current.intersectObjects(interactableObjects, true);
                if (intersectsItems.length > 0) {
                    let hitObject: THREE.Object3D | null = intersectsItems[0].object;
                    let itemIdFound: string | null = null;
                    let depth = 0;
                    while(hitObject && depth < 10) {
                        if (hitObject.userData.itemId) {
                            itemIdFound = hitObject.userData.itemId;
                            break;
                        }
                        hitObject = hitObject.parent;
                        depth++;
                    }
                    onRemoteItemHover(allMediaItemsFromProps.find(itm => itm.id === itemIdFound) || null);
                } else {
                    onRemoteItemHover(null);
                }
            } else {
                onRemoteItemHover(null);
            }
        } else {
            onRemoteItemHover(null);
        }
    }
    const nextAnimPos = new Map<string,THREE.Vector3>(); let hasVisChanges = false; visualItemsToRender.forEach(item => { const currPos = animatedRenderPositions.get(item.id) || latestVisualPositionsRef.current.get(item.id) || DEFAULT_HIDDEN_POSITION.clone(); const tgtPos = calculatedTargetPositions.get(item.id) || DEFAULT_HIDDEN_POSITION.clone(); let lerpFactor=BASE_LERP_FACTOR; if(focusedItemId===item.id)lerpFactor=BASE_LERP_FACTOR*2.0; else if(primaryRelatedVisualItemIds.has(item.id))lerpFactor=BASE_LERP_FACTOR*1.6; else if(secondaryRelatedVisualItemIds.has(item.id))lerpFactor=BASE_LERP_FACTOR*0.9; else if(farBackgroundVisualItemIds.has(item.id))lerpFactor=BASE_LERP_FACTOR*0.4; let posToSet:THREE.Vector3; if(!currPos.equals(tgtPos)){posToSet=currPos.clone().lerp(tgtPos,lerpFactor); const snapSq=tgtPos.z<(DEFAULT_HIDDEN_POSITION.z+2000)?0.01:0.000001; if(posToSet.distanceToSquared(tgtPos)<snapSq)posToSet.copy(tgtPos); hasVisChanges=true;}else{posToSet=currPos.clone();} if(item.id!==focusedItemId&&posToSet.z>(DEFAULT_HIDDEN_POSITION.z+1)){const idHash=item.id.split('').reduce((acc,char,idx)=>acc+char.charCodeAt(0)*(idx+1),0); const phX=(idHash%1000/1000.0)*Math.PI*2; const phY=((idHash+133)%1000/1000.0)*Math.PI*2; const phZ=((idHash+277)%1000/1000.0)*Math.PI*2; posToSet.x+=Math.sin(time*BREATHING_POSITION_FREQUENCY+phX)*BREATHING_POSITION_AMPLITUDE_X; posToSet.y+=Math.sin(time*BREATHING_POSITION_FREQUENCY+phY)*BREATHING_POSITION_AMPLITUDE_Y; posToSet.z+=Math.sin(time*BREATHING_POSITION_FREQUENCY*0.7+phZ)*BREATHING_POSITION_AMPLITUDE_Z; hasVisChanges=true;} nextAnimPos.set(item.id,posToSet);}); if(hasVisChanges || animatedRenderPositions.size !== nextAnimPos.size){ if(isMountedRef.current) setAnimatedRenderPositions(nextAnimPos); latestVisualPositionsRef.current = nextAnimPos; } else { if(latestVisualPositionsRef.current !== animatedRenderPositions) latestVisualPositionsRef.current = animatedRenderPositions; } const now = performance.now(); if (focusedItemId === null && !isAudioPlayerActuallyPlaying && (now - lastAmbientAudioCheckTimeRef.current > AMBIENT_AUDIO_CHECK_INTERVAL)) { lastAmbientAudioCheckTimeRef.current = now; updateAmbientAudioCandidates(); } if (!visibilityCheckTimerRef.current && typeof window !== 'undefined') { const updVis=()=>{if(!cam||!isMountedRef.current)return;projScreenMatrixRef.current.multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse);frustumRef.current.setFromProjectionMatrix(projScreenMatrixRef.current);const newActIds=new Set<string>();const camP=cam.position;visualItemsToRender.forEach(it=>{const itP=latestVisualPositionsRef.current.get(it.id);if(itP&&itP.z>(DEFAULT_HIDDEN_POSITION.z+1)){if(itP.distanceToSquared(camP)<VISIBILITY_DISTANCE_THRESHOLD_SQUARED){if(frustumRef.current.containsPoint(itP))newActIds.add(it.id);}}});if(isMountedRef.current)setVisuallyActiveItemIds(prev=>{if(prev.size===newActIds.size&&Array.from(newActIds).every(id=>prev.has(id)))return prev;return newActIds;});visibilityCheckTimerRef.current=null;}; visibilityCheckTimerRef.current = setTimeout(updVis,VISIBILITY_CHECK_INTERVAL);} });
    useEffect(() => { return () => { if (visibilityCheckTimerRef.current) clearTimeout(visibilityCheckTimerRef.current); }; }, []);
    const connectionLinePoints = useMemo<THREE.Vector3[]>(() => { const currentPositionsMap = latestVisualPositionsRef.current; return visualItemsToRender.map(item => currentPositionsMap.get(item.id) || calculatedTargetPositions.get(item.id) || DEFAULT_HIDDEN_POSITION.clone() ).filter(p => p.z > (DEFAULT_HIDDEN_POSITION.z + 1) && !isNaN(p.x) && !isNaN(p.y) && !isNaN(p.z)); }, [visualItemsToRender, animatedRenderPositions, calculatedTargetPositions]);
    useEffect(() => { const actualPointsToRender = connectionLinePoints.filter(p => p.z > (DEFAULT_HIDDEN_POSITION.z + 1)); const shouldRender = viewMode === VIEW_MODES.CONNECTIONS && actualPointsToRender.length > 1; if (shouldRenderLinesActual !== shouldRender) { if (isMountedRef.current) setShouldRenderLinesActual(shouldRender); } }, [viewMode, connectionLinePoints, shouldRenderLinesActual]);

    return (
        <>
            <mesh ref={interactionPlaneRef} visible={false} name="InteractionPlaneForRemoteCursor">
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial transparent opacity={0.0} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
            <AnimatedRingCursor
                cursorRef={remoteCursorGroupRef}
                isHovering={!!remoteHoveredItemId}
                visible={remoteCursorVisible}
            />
            {visualItemsToRender.map((rawItem: MediaItemWithThumbnail) => {
                const positionToRender = latestVisualPositionsRef.current.get(rawItem.id) || calculatedTargetPositions.get(rawItem.id) || DEFAULT_HIDDEN_POSITION.clone();
                if (positionToRender.z < (DEFAULT_HIDDEN_POSITION.z / 1.1) && !focusedItemId && !primaryRelatedVisualItemIds.has(rawItem.id) && !secondaryRelatedVisualItemIds.has(rawItem.id) && !farBackgroundVisualItemIds.has(rawItem.id)) { return null; }
                const Comp = rawItem.type === 'video' ? VideoMesh : MediaMesh;
                const isGenerallyVisuallyActive = visuallyActiveItemIds.has(rawItem.id);
                const isFocusedItem = rawItem.id === focusedItemId;
                const isInPrimaryCluster = focusedItemId ? primaryRelatedVisualItemIds.has(rawItem.id) : false;
                let currentEffects: VisualEffects = { ...effectsGlobal };
                if (isFocusedItem) { currentEffects = { ...effectsGlobal, mediaSize: (effectsGlobal.mediaSize || 1.0) * FOCUSED_ITEM_SCALE_MULTIPLIER, imageSize: (effectsGlobal.imageSize || 1.0) * FOCUSED_ITEM_SCALE_MULTIPLIER }; } else if (isInPrimaryCluster) { currentEffects = { ...effectsGlobal, mediaSize: (effectsGlobal.mediaSize || 1.0) * PRIMARY_RELATED_ITEM_SCALE_MULTIPLIER, imageSize: (effectsGlobal.imageSize || 1.0) * PRIMARY_RELATED_ITEM_SCALE_MULTIPLIER }; } else if (secondaryRelatedVisualItemIds.has(rawItem.id)) { currentEffects = { ...effectsGlobal, mediaSize: (effectsGlobal.mediaSize || 1.0) * SECONDARY_RELATED_ITEM_SCALE_MULTIPLIER, imageSize: (effectsGlobal.imageSize || 1.0) * SECONDARY_RELATED_ITEM_SCALE_MULTIPLIER, opacity: (effectsGlobal.opacity || 100) * 0.75 }; } else if (farBackgroundVisualItemIds.has(rawItem.id)) { currentEffects = { ...effectsGlobal, opacity: FAR_BACKGROUND_OPACITY }; }
                let currentShouldPlayVideo = false;
                let determinedVideoQuality: VideoQuality = 'reduced';
                let effectiveIsVisuallyActiveForPlayback = isGenerallyVisuallyActive; 
                const isFocusPresetActive = cameraPreset === CAMERA_PRESETS.ITEM_FOCUSED || cameraPreset === CAMERA_PRESETS.CLOSE_UP;
                if (rawItem.type === 'video' && isFocusPresetActive) { if (isFocusedItem) { currentShouldPlayVideo = true; effectiveIsVisuallyActiveForPlayback = true; determinedVideoQuality = 'full'; } else if (isInPrimaryCluster) { if (isAudioPlayerActuallyPlaying && currentPlaylistOrigin?.musician) { const belongsToActiveAudioCluster = rawItem.musician === currentPlaylistOrigin.musician && areTitlesSimilar(rawItem.title, currentPlaylistOrigin.title || undefined); if (belongsToActiveAudioCluster) { currentShouldPlayVideo = true; effectiveIsVisuallyActiveForPlayback = true; determinedVideoQuality = 'reduced'; } } } }
                const itemForMediaObject: ExtendedMediaItem = { ...rawItem, thumbnailUrl: rawItem.thumbnail_url || (rawItem as any).thumbnailUrl };
                const shouldPlayAmbientAudioForItem = !isAudioPlayerActuallyPlaying && focusedItemId === null && ambientAudioItemIds.has(rawItem.id);
                const ambientUrlForThisItem = shouldPlayAmbientAudioForItem ? ambientAudioSourceUrls.get(rawItem.id) : undefined;
                
                const mediaObjectProps: MediaObjectProps = {
                    item: itemForMediaObject,
                    position: positionToRender,
                    displayItemMetadata: displayItemMetadata || isFocusedItem,
                    viewMode: viewMode,
                    effects: currentEffects,
                    sceneBackgroundColor: sceneBackgroundColor,
                    isVisuallyActive: effectiveIsVisuallyActiveForPlayback,
                    focusedItemId: focusedItemId,
                    onItemClick: onItemFocus,
                    shouldPlayVideo: currentShouldPlayVideo,
                    videoQuality: determinedVideoQuality,
                    primaryRelatedVisualItemIds: primaryRelatedVisualItemIds,
                    audioListener: audioListenerRef.current ?? undefined,
                    playAmbientPositionalAudio: shouldPlayAmbientAudioForItem,
                    ambientAudioUrl: ambientUrlForThisItem || undefined,
                    positionalAudioFilterSettings: positionalAudioFilters,
                    isRemoteHovered: rawItem.id === remoteHoveredItemId,
                };

                return (<Comp key={`${rawItem.id}-${rawItem.type}-visual`} {...mediaObjectProps} />);
            })}
            {shouldRenderLinesActual && (<ConnectionLines positions={connectionLinePoints} sceneBackgroundColor={sceneBackgroundColor} threshold={connectionLineThreshold} maxConnectionsPerItem={connectionLineMaxConnectionsPerItem} />)}
        </>
    );
};

export default React.memo(MediaScene);