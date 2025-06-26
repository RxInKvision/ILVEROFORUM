// src/App.tsx

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Canvas, RootState } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import Ably from 'ably';

import ControlPanel from './components/ui/ControlPanel';
// Rimuoviamo l'import di CameraInertia
import MediaScene, { CAMERA_PRESETS, getCameraPresetPosition, MediaSceneProps } from './components/gallery/MediaScene';
import { fetchAllMedia, fetchCategories, MediaItem, isAudioItem, areTitlesSimilar } from './services/mediaService';
import AudioPlayerOverlay from './components/audio/AudioPlayerOverlay';
import { LAYOUT_TYPES } from './constants/layoutTypes';
import { VIEW_MODES } from './constants/viewSettings';
import './styles/App.css';

// Tipi e Interfacce
interface ServerToPhoneFeedback { type: 'hoverFeedback'; itemId?: string | null; itemName?: string | null; }

interface PlaylistOrigin {
    musician: string | null | undefined;
    title: string | null | undefined;
}

const APP_LOG_PREFIX = '[App.tsx]';
const LOGO_UNIVERSAL_WHITE = '/assets/logo-white.svg';

const App: React.FC = () => {
    // Stati e Ref (rimangono invariati)
    const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [activeCategories, setActiveCategories] = useState<string[]>([]);
    const [layoutType, setLayoutType] = useState<LAYOUT_TYPES>(LAYOUT_TYPES.RANDOM_3D);
    const [zoomLevel, setZoomLevel] = useState<number>(0.5);
    const [viewMode, setViewMode] = useState<VIEW_MODES>(VIEW_MODES.NORMAL);
    const [seed, setSeed] = useState<number>(42);
    const [noiseAmount, setNoiseAmount] = useState<number>(0.5);
    const [opacity, setOpacity] = useState<number>(87);
    const [blendMode, setBlendMode] = useState<string>('normal');
    const [cameraPreset, setCameraPreset] = useState<CAMERA_PRESETS>(CAMERA_PRESETS.DEFAULT);
    const [mediaSize, setMediaSize] = useState<number>(1.0);
    const [imageSize, setImageSize] = useState<number>(1.0);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [showControls, setShowControls] = useState<boolean>(true);
    const [displayItemMetadata, setDisplayItemMetadata] = useState<boolean>(false);
    const [posAudioHighPass, setPosAudioHighPass] = useState<number>(50);
    const [posAudioLowPass, setPosAudioLowPass] = useState<number>(150);
    const [posAudioQ, setPosAudioQ] = useState<number>(1);
    const orbitControlsRef = useRef<any>(null);
    const [manualControlActive, setManualControlActive] = useState(false);
    const [sceneBackgroundColor, setSceneBackgroundColor] = useState<THREE.ColorRepresentation>('#000000');
    const [focusedItemId, _setFocusedItemId] = useState<string | null>(null);
    const [previousCameraPreset, setPreviousCameraPreset] = useState<CAMERA_PRESETS>(CAMERA_PRESETS.DEFAULT);
    const [audioPlaylist, setAudioPlaylist] = useState<MediaItem[]>([]);
    const [isAudioPlayerVisible, setIsAudioPlayerVisible] = useState<boolean>(false);
    const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);
    const [currentPlaylistOrigin, setCurrentPlaylistOrigin] = useState<PlaylistOrigin | null>(null);
    const [focusedItemDetailsForPlayer, setFocusedItemDetailsForPlayer] = useState<{ musician?: string | null, title?: string | null }>({});
    const [settledOnFocusedItem, setSettledOnFocusedItem] = useState<string | null>(null);
    const [playingTrackTitles, setPlayingTrackTitles] = useState<string[]>([]);
    const isMountedApp = useRef(true);
    const [hasUserInteracted, setHasUserInteracted] = useState(false);
    const cursorRef = useRef<HTMLDivElement>(null);
    const focusedItemIdRef = useRef<string | null>(focusedItemId);
    const ablyChannelRef = useRef<Ably.RealtimeChannel | null>(null);

    // --- Stati e Ref per controllo remoto ---
    const [remotePointerNormalized, setRemotePointerNormalized] = useState<THREE.Vector2 | null>(null);
    const [remoteClickSignal, setRemoteClickSignal] = useState<number>(0);
    const [remoteCursorActive, setRemoteCursorActive] = useState(false);
    const lastProcessedClickSignalRef = useRef(0);
    const [hoveredItemIdByRemote, setHoveredItemIdByRemote] = useState<string | null>(null);
    const [lastValidHoveredItemIdByRemote, setLastValidHoveredItemIdByRemote] = useState<string | null>(null);

    // --- Hook di base e caricamento dati ---
    useEffect(() => { isMountedApp.current = true; return () => { isMountedApp.current = false; }; }, []);
    useEffect(() => { focusedItemIdRef.current = focusedItemId; }, [focusedItemId]);
    useEffect(() => { const cursor = cursorRef.current; if (!cursor) return; const handleMouseMove = (e: MouseEvent) => { cursor.style.left = `${e.clientX}px`; cursor.style.top = `${e.clientY}px`; }; const handleMouseDown = () => { cursor.classList.add('clicked'); }; const handleMouseUp = () => { cursor.classList.remove('clicked'); }; window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mousedown', handleMouseDown); window.addEventListener('mouseup', handleMouseUp); return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mousedown', handleMouseDown); window.removeEventListener('mouseup', handleMouseUp); }; }, []);
    useEffect(() => { document.body.style.cursor = 'none'; });
    useEffect(() => { const fetchData = async () => { setIsLoading(true); try { const media = await fetchAllMedia(); if (isMountedApp.current) setMediaItems(media || []); const cats = await fetchCategories(); if (isMountedApp.current) setCategories(cats || []); } catch (error) { console.error(`${APP_LOG_PREFIX} fetchData - Error:`, error); } finally { if (isMountedApp.current) setIsLoading(false); } }; fetchData(); }, []);
    useEffect(() => { if (!focusedItemId) { if (isMountedApp.current) { if (isAudioPlayerVisible) setIsAudioPlayerVisible(false); if (currentPlaylistOrigin !== null) setCurrentPlaylistOrigin(null); if (audioPlaylist.length > 0) setAudioPlaylist([]); setFocusedItemDetailsForPlayer({}); } return; } const focusedItem = mediaItems.find(item => item.id === focusedItemId); if (!focusedItem) { if (isMountedApp.current) { if (isAudioPlayerVisible) setIsAudioPlayerVisible(false); if (currentPlaylistOrigin !== null) setCurrentPlaylistOrigin(null); if (audioPlaylist.length > 0) setAudioPlaylist([]); setFocusedItemDetailsForPlayer({});} return; } if (isMountedApp.current) { setFocusedItemDetailsForPlayer({ musician: focusedItem.musician, title: focusedItem.title });} if (currentPlaylistOrigin && currentPlaylistOrigin.musician && focusedItem.musician === currentPlaylistOrigin.musician && areTitlesSimilar(focusedItem.title, currentPlaylistOrigin.title ?? undefined)) { if (!isAudioPlayerVisible && audioPlaylist.length > 0 && isMountedApp.current) { setIsAudioPlayerVisible(true); } return; } const newPlaylistOriginMusician = focusedItem.musician; const newPlaylistOriginTitle = focusedItem.title; let newPlaylistLocal: MediaItem[] = []; if (newPlaylistOriginMusician) { newPlaylistLocal = mediaItems.filter(candidateAudioItem => { if (!isAudioItem(candidateAudioItem)) return false; const musicianMatch = candidateAudioItem.musician === newPlaylistOriginMusician; if (!musicianMatch) return false; return musicianMatch && areTitlesSimilar(candidateAudioItem.title ?? undefined, newPlaylistOriginTitle ?? undefined); }).sort((a, b) => (a.title || "").localeCompare(b.title || "")); } const shouldPlayerBeVisible = newPlaylistLocal.length > 0; if (isMountedApp.current) { let playlistsAreDifferent = audioPlaylist.length !== newPlaylistLocal.length; if (!playlistsAreDifferent && audioPlaylist.length > 0) { for (let i = 0; i < audioPlaylist.length; i++) { if (audioPlaylist[i].id !== newPlaylistLocal[i].id) { playlistsAreDifferent = true; break;}}} if (playlistsAreDifferent) { setAudioPlaylist(newPlaylistLocal); } if (isAudioPlayerVisible !== shouldPlayerBeVisible) { setIsAudioPlayerVisible(shouldPlayerBeVisible); } if (shouldPlayerBeVisible) { if (!currentPlaylistOrigin || currentPlaylistOrigin.musician !== newPlaylistOriginMusician || !areTitlesSimilar(currentPlaylistOrigin.title ?? undefined, newPlaylistOriginTitle ?? undefined)) { setCurrentPlaylistOrigin({ musician: newPlaylistOriginMusician, title: newPlaylistOriginTitle }); }} else { if (currentPlaylistOrigin !== null) { setCurrentPlaylistOrigin(null); }} } }, [focusedItemId, mediaItems, currentPlaylistOrigin, audioPlaylist, isAudioPlayerVisible]);

    // --- Handlers per le interazioni ---
    const handleUserInteraction = useCallback(() => { if (!hasUserInteracted) { const context = THREE.AudioContext.getContext(); if (context.state === 'suspended') { context.resume(); } setHasUserInteracted(true); } }, [hasUserInteracted]);
    const setFocusedItemId = useCallback((itemId: string | null) => { _setFocusedItemId(itemId); }, []);
    const handleSetFocusedItem = useCallback((itemId: string | null) => { setSettledOnFocusedItem(null); const previouslyFocusedItem = focusedItemIdRef.current; _setFocusedItemId(currentStoredFocusedId => { const newId = (currentStoredFocusedId === itemId && itemId !== null) ? null : itemId; if (newId) { const appWasAlreadyInAFocusPreset = cameraPreset === CAMERA_PRESETS.ITEM_FOCUSED || cameraPreset === CAMERA_PRESETS.CLOSE_UP; const shouldPreserveManualCamera = appWasAlreadyInAFocusPreset && newId !== previouslyFocusedItem && manualControlActive; if (shouldPreserveManualCamera) { if (cameraPreset !== CAMERA_PRESETS.ITEM_FOCUSED) setCameraPreset(CAMERA_PRESETS.ITEM_FOCUSED); } else { setManualControlActive(false); if (!appWasAlreadyInAFocusPreset) setPreviousCameraPreset(cameraPreset); setCameraPreset(CAMERA_PRESETS.ITEM_FOCUSED); } } else { setManualControlActive(false); setCameraPreset(previousCameraPreset || CAMERA_PRESETS.DEFAULT); } return newId; }); }, [cameraPreset, previousCameraPreset, manualControlActive]);
    
    const handleRemoteItemHover = useCallback((hoveredItemData: MediaItem | null) => {
        const newHoveredId = hoveredItemData?.id || null;
        if (hoveredItemIdByRemote !== newHoveredId) {
            setHoveredItemIdByRemote(newHoveredId);
            if (newHoveredId) setLastValidHoveredItemIdByRemote(newHoveredId);
            if(ablyChannelRef.current) {
                const feedback: ServerToPhoneFeedback = { type: 'hoverFeedback', itemId: newHoveredId, itemName: hoveredItemData?.title || 'Nessun Oggetto' };
                ablyChannelRef.current.publish('feedback-message', feedback);
            }
        }
    }, [hoveredItemIdByRemote]);

    useEffect(() => {
        if (remoteClickSignal > lastProcessedClickSignalRef.current) {
            if (lastValidHoveredItemIdByRemote) { handleSetFocusedItem(lastValidHoveredItemIdByRemote); }
            else if (focusedItemId) { handleSetFocusedItem(null); }
            lastProcessedClickSignalRef.current = remoteClickSignal;
        }
    }, [remoteClickSignal, lastValidHoveredItemIdByRemote, focusedItemId, handleSetFocusedItem]);

    // RIPRISTINATO handleCameraCommand alla versione ORIGINALE, senza inerzia
    const handleCameraCommand = useCallback((command: string, dx?: number, dy?: number, value?: number) => {
        const controls = orbitControlsRef.current; if (!controls || !controls.object) return;
        setManualControlActive(true);
        const camera = controls.object as THREE.PerspectiveCamera; const target = controls.target as THREE.Vector3;
        switch (command) {
            case 'pan': if (dx !== undefined && dy !== undefined) controls.pan(-dx * 0.7, dy * 0.7); break;
            case 'dolly': if (typeof value === 'number' && value !== 0) { if (value > 0) controls.dollyIn(1 + Math.abs(value)); else controls.dollyOut(1 + Math.abs(value)); } break;
            case 'orbit':
                if (dx !== undefined && dy !== undefined) {
                    const orbitFactor = 0.002; const thetaDelta = -dx * orbitFactor; const phiDelta = -dy * orbitFactor;
                    const offset = camera.position.clone().sub(target); let currentRadius = offset.length(); if (currentRadius === 0) return;
                    let currentPhi = Math.acos(THREE.MathUtils.clamp(offset.y / currentRadius, -1, 1)); let currentTheta = Math.atan2(offset.x, offset.z);
                    currentTheta += thetaDelta; currentPhi += phiDelta;
                    currentPhi = Math.max(controls.minPolarAngle, Math.min(controls.maxPolarAngle, currentPhi));
                    offset.x = currentRadius * Math.sin(currentPhi) * Math.sin(currentTheta);
                    offset.y = currentRadius * Math.cos(currentPhi);
                    offset.z = currentRadius * Math.sin(currentPhi) * Math.cos(currentTheta);
                    camera.position.copy(target).add(offset);
                } break;
        }
        if (controls.update) controls.update();
    }, []);

    const handleLayoutChange = useCallback((newLayout: LAYOUT_TYPES) => { setManualControlActive(false); _setFocusedItemId(null); setCameraPreset(CAMERA_PRESETS.DEFAULT); setLayoutType(newLayout); }, []);
    
    // --- CONNESSIONE ABLY ---
    useEffect(() => {
        const ablyApiKey = process.env.REACT_APP_ABLY_API_KEY;
        if (!ablyApiKey) { console.error("REACT_APP_ABLY_API_KEY non definita!"); return; }

        // Correzione: L'opzione `recover` non è necessaria e causava l'errore
        const ably = new Ably.Realtime(ablyApiKey);
        ablyChannelRef.current = ably.channels.get('remote-control-channel');

        // Correzione: Usiamo il tipo `Ably.Message` direttamente
        const onAblyMessage = (message: Ably.Message) => {
            const data = message.data;
            if (!data || !data.type) return;

            switch (data.type) {
                case 'pointerdown': setRemoteCursorActive(true); setRemotePointerNormalized(new THREE.Vector2(data.x * 2 - 1, -(data.y * 2 - 1))); break;
                case 'pointermove': setRemotePointerNormalized(new THREE.Vector2(data.x * 2 - 1, -(data.y * 2 - 1))); break;
                case 'pointerup': setRemoteCursorActive(false); setRemotePointerNormalized(null); break;
                case 'click': setRemoteClickSignal(prev => prev + 1); break;
                case 'cameraCommand': handleCameraCommand(data.command, data.dx, data.dy, data.value); break;
                case 'appCommand': if (data.command === 'setLayout' && data.value) { handleLayoutChange(data.value as LAYOUT_TYPES); } break;
            }
        };

        ablyChannelRef.current.subscribe('control-message', onAblyMessage);
        console.log("Connesso al canale Ably 'remote-control-channel'");

        return () => {
            console.log("Disconnessione dal canale Ably.");
            ablyChannelRef.current?.unsubscribe();
            ably.close();
            ablyChannelRef.current = null;
        };
    }, [handleCameraCommand, handleLayoutChange]);

    // --- Altri Handlers e Memo ---
    const handleCameraPresetChange = (newPresetValue: CAMERA_PRESETS) => { setManualControlActive(false); setFocusedItemId(null); setCameraPreset(newPresetValue); setPreviousCameraPreset(newPresetValue); };
    const handlePresetAnimationComplete = useCallback(() => { const controls = orbitControlsRef.current; if (controls?.target) { setSettledOnFocusedItem(focusedItemIdRef.current); } if ((cameraPreset === CAMERA_PRESETS.ITEM_FOCUSED || cameraPreset === CAMERA_PRESETS.CLOSE_UP)) { setManualControlActive(true); } }, [cameraPreset]);
    const handleCanvasCreated = useCallback((state: RootState) => { if (state.gl) state.gl.outputColorSpace = THREE.SRGBColorSpace; }, []);
    const handlePlaybackStatusChange = useCallback((isPlayingNow: boolean) => { setIsAudioPlaying(isPlayingNow); }, []);
    const handlePlayingTracksChange = useCallback((titles: string[]) => { setPlayingTrackTitles(titles); }, []);
    const handleRandomize = useCallback(() => { setManualControlActive(false); _setFocusedItemId(null); setCameraPreset(CAMERA_PRESETS.DEFAULT); setSeed(Math.floor(Math.random() * 100000) + 1); }, []);
    const handleZoomLevelChange = (newZoom: number) => setZoomLevel(newZoom);
    const handleToggleBackground = () => setSceneBackgroundColor(prev => (prev === '#000000' ? '#FFFFFF' : '#000000'));
    const handleCategoryToggle = (category: string) => { setManualControlActive(false); _setFocusedItemId(null); setCameraPreset(CAMERA_PRESETS.DEFAULT); if (category === '') { setActiveCategories([]); } else { setActiveCategories(prev => (prev.length === 1 && prev[0] === category) ? [] : [category]); } };
    const handleSeedChange = (newSeed: number) => { setManualControlActive(false); _setFocusedItemId(null); setCameraPreset(CAMERA_PRESETS.DEFAULT); setSeed(newSeed); };
    const handleNoiseChange = (newAmount: number) => { setManualControlActive(false); _setFocusedItemId(null); setCameraPreset(CAMERA_PRESETS.DEFAULT); setNoiseAmount(newAmount); };
    const handleOpacityChange = (newAmount: number) => setOpacity(newAmount);
    const handleBlendModeChange = (newMode: string) => setBlendMode(newMode);
    const handleMediaSizeChange = (newSize: number) => setMediaSize(newSize);
    const handleImageSizeChange = (newSize: number) => setImageSize(newSize);
    const toggleControls = () => setShowControls(prev => !prev);
    const handleViewModeChange = (newMode: VIEW_MODES) => { setManualControlActive(false); _setFocusedItemId(null); setViewMode(newMode); };
    const toggleDisplayItemMetadata = () => setDisplayItemMetadata(prev => !prev);
    const handlePosAudioHighPassChange = (newFreq: number) => setPosAudioHighPass(newFreq);
    const handlePosAudioLowPassChange = (newFreq: number) => setPosAudioLowPass(newFreq);
    const handlePosAudioQChange = (newQ: number) => setPosAudioQ(newQ);

    const isLightTheme = useMemo<boolean>(() => { try { const color = new THREE.Color(sceneBackgroundColor); return (color.r + color.g + color.b) > 1.5; } catch { return String(sceneBackgroundColor).toUpperCase() === '#FFFFFF'; }}, [sceneBackgroundColor]);
    const appClasses = useMemo(() => `app ${isLightTheme ? 'light-theme-active' : ''}`, [isLightTheme]);
    const canvasCameraProps = useMemo(() => ({ position: getCameraPresetPosition(CAMERA_PRESETS.DEFAULT).position.toArray() as [number, number, number], fov: 50, near: 0.1, far: 1000 }), []);

    const mediaSceneProps: MediaSceneProps = useMemo(() => ({
        mediaItems, activeCategories, layoutType, zoomLevel, viewMode, seed, displayItemMetadata,
        noiseAmount, opacity, blendMode, cameraPreset, mediaSize, imageSize, manualControl: manualControlActive,
        sceneBackgroundColor, orbitControlsRef, focusedItemId,
        onItemFocus: handleSetFocusedItem,
        onPresetAnimationComplete: handlePresetAnimationComplete,
        onPlayingTracksChange: handlePlayingTracksChange,
        currentPlaylistOrigin, isAudioPlayerActuallyPlaying: isAudioPlaying,
        positionalAudioHighPass: posAudioHighPass,
        positionalAudioLowPass: posAudioLowPass,
        positionalAudioQ: posAudioQ,
        remotePointerNormalized, onRemoteItemHover: handleRemoteItemHover, 
        remoteHoveredItemId: hoveredItemIdByRemote, // Correzione dell'errore
        remoteClickSignal, remoteCursorVisible: remoteCursorActive,
    }), [
        mediaItems, activeCategories, layoutType, zoomLevel, viewMode, seed, displayItemMetadata, noiseAmount, opacity,
        blendMode, cameraPreset, mediaSize, imageSize, manualControlActive, sceneBackgroundColor, focusedItemId,
        handleSetFocusedItem, handlePresetAnimationComplete, handlePlayingTracksChange, currentPlaylistOrigin, isAudioPlaying,
        posAudioHighPass, posAudioLowPass, posAudioQ, remotePointerNormalized, handleRemoteItemHover,
        hoveredItemIdByRemote, // Correzione dell'errore
        remoteClickSignal, remoteCursorActive
    ]);

    return (
        <div className={appClasses} onClick={handleUserInteraction} onPointerDown={handleUserInteraction}>
            <div ref={cursorRef} className="custom-cursor"></div>
            <div className="app-logo-container"><img src={LOGO_UNIVERSAL_WHITE} alt="App Logo" className="app-logo" /></div>
            {isLoading ? (<div className="loading-overlay"><div className="loading-spinner"></div><div className="loading-text">Loading Visual Experience...</div></div>) : (
                <>
                    <div className="canvas-container">
                        <Canvas camera={canvasCameraProps} gl={{ antialias: true, alpha: true }} dpr={Math.min(window.devicePixelRatio, 2)} frameloop="always" onCreated={handleCanvasCreated} onPointerMissed={(e) => { if (e.button === 0 && focusedItemId) handleSetFocusedItem(null); }}>
                            <color attach="background" args={[sceneBackgroundColor]} />
                            <ambientLight intensity={isLightTheme ? 1.0 : 0.7} />
                            <pointLight position={[15, 20, 15]} intensity={isLightTheme ? 0.7 : 1.0} decay={2} distance={100} />
                            <pointLight position={[-15, -10, -15]} intensity={isLightTheme ? 0.3 : 0.6} color="#66ccff" decay={2} distance={100} />
                            <OrbitControls ref={orbitControlsRef} enableZoom={true} enablePan={true} enableRotate={true} enableDamping={false} />
                            {sceneBackgroundColor === '#000000' && <Stars radius={150} depth={60} count={100} factor={5} saturation={0} fade speed={0.5} />}
                            <MediaScene {...mediaSceneProps} />
                        </Canvas>
                    </div>
                    <div className="gallery-controls">
                        <button className="gallery-control-btn" onClick={handleToggleBackground} title={`Switch to ${sceneBackgroundColor === '#000000' ? 'Light' : 'Dark'} Theme`} > {sceneBackgroundColor === '#000000' ? '☀️' : '🌙'} </button>
                        <button className="gallery-control-btn" onClick={toggleControls} title={showControls ? "Hide Controls" : "Show Controls"}>{showControls ? "🔽" : "🔼"}</button>
                        <button className="gallery-control-btn" onClick={handleRandomize} title="Randomize Positions">🔄</button>
                        <button className="gallery-control-btn" onClick={toggleDisplayItemMetadata} title="Toggle Metadata">ℹ️</button>
                    </div>
                    <div className="app-info">Forum Echoes • {mediaItems.length} items • {categories.length} categories</div>
                    {showControls && (
                        <ControlPanel
                            categories={categories} activeCategories={activeCategories} onCategoryToggle={handleCategoryToggle}
                            layoutType={layoutType} onLayoutChange={handleLayoutChange} zoomLevel={zoomLevel} onZoomChange={handleZoomLevelChange}
                            displayItemMetadata={displayItemMetadata} onToggleDisplayItemMetadata={toggleDisplayItemMetadata}
                            viewMode={viewMode} onViewModeChange={handleViewModeChange} onRandomize={handleRandomize}
                            seed={seed} onSeedChange={handleSeedChange} noiseAmount={noiseAmount} onNoiseChange={handleNoiseChange}
                            opacity={opacity} onOpacityChange={handleOpacityChange} blendMode={blendMode} onBlendModeChange={handleBlendModeChange}
                            cameraPreset={cameraPreset} onCameraPresetChange={handleCameraPresetChange}
                            mediaSize={mediaSize} onMediaSizeChange={handleMediaSizeChange} imageSize={imageSize} onImageSizeChange={handleImageSizeChange}
                            posAudioHighPass={posAudioHighPass} onPosAudioHighPassChange={handlePosAudioHighPassChange}
                            posAudioLowPass={posAudioLowPass} onPosAudioLowPassChange={handlePosAudioLowPassChange}
                            posAudioQ={posAudioQ} onPosAudioQChange={handlePosAudioQChange}
                        />
                    )}
                    <AudioPlayerOverlay
                        playlist={audioPlaylist} isVisible={isAudioPlayerVisible} onPlaybackStatusChange={handlePlaybackStatusChange}
                        focusedItemMusician={focusedItemDetailsForPlayer.musician} focusedItemTitle={focusedItemDetailsForPlayer.title}
                        sceneBackgroundColor={sceneBackgroundColor}
                    />
                    <div className="playing-tracks-overlay">
                        <p>Fonti Audio Ambientali Attive:</p>
                        {playingTrackTitles.length > 0 ? (
                            <ul>{playingTrackTitles.map((title, index) => ( <li key={index}>{title}</li> ))}</ul>
                        ) : ( <span>Nessuna</span> )}
                    </div>
                </>
            )}
        </div>
    );
};

export default App;