// src/App.test.tsx

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Canvas, RootState } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import ControlPanel from './components/ui/ControlPanel';
import MediaScene, { CAMERA_PRESETS, getCameraPresetPosition, MediaSceneProps } from './components/gallery/MediaScene';
import { fetchAllMedia, fetchCategories, MediaItem, isAudioItem, areTitlesSimilar } from './services/mediaService';
import AudioPlayerOverlay from './components/audio/AudioPlayerOverlay';
import { LAYOUT_TYPES } from './constants/layoutTypes';
import { VIEW_MODES } from './constants/viewSettings';
import './styles/App.css';

interface PlaylistOrigin {
    musician: string | null | undefined;
    title: string | null | undefined;
}

const APP_LOG_PREFIX = '[App.tsx]';
const LOGO_UNIVERSAL_WHITE = '/assets/logo-white.svg';

const App: React.FC = () => {
    // Stati esistenti
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
    const [cameraFocusPoint, setCameraFocusPoint] = useState<THREE.Vector3>(() => getCameraPresetPosition(CAMERA_PRESETS.DEFAULT).target.clone());
    const [sceneBackgroundColor, setSceneBackgroundColor] = useState<THREE.ColorRepresentation>('#000000');
    const [focusedItemId, _setFocusedItemId] = useState<string | null>(null);
    const [previousCameraPreset, setPreviousCameraPreset] = useState<CAMERA_PRESETS>(CAMERA_PRESETS.DEFAULT);
    const [audioPlaylist, setAudioPlaylist] = useState<MediaItem[]>([]);
    const [isAudioPlayerVisible, setIsAudioPlayerVisible] = useState<boolean>(false);
    const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);
    const [currentPlaylistOrigin, setCurrentPlaylistOrigin] = useState<PlaylistOrigin | null>(null);
    const [focusedItemDetailsForPlayer, setFocusedItemDetailsForPlayer] = useState<{ musician?: string | null, title?: string | null }>({});
    const [playBorderHighlightAnimation, setPlayBorderHighlightAnimation] = useState<boolean>(false);
    const [settledOnFocusedItem, setSettledOnFocusedItem] = useState<string | null>(null);
    const focusedItemIdRef = useRef<string | null>(focusedItemId);
    const isMountedApp = useRef(true);
    const [hasUserInteracted, setHasUserInteracted] = useState(false);
    const cursorRef = useRef<HTMLDivElement>(null);

    // ** INIZIO CORREZIONE: Aggiunta stato mancante **
    const [playingTrackTitles, setPlayingTrackTitles] = useState<string[]>([]);
    // ** FINE CORREZIONE **

    useEffect(() => { isMountedApp.current = true; return () => { isMountedApp.current = false; }; }, []);
    useEffect(() => { focusedItemIdRef.current = focusedItemId; }, [focusedItemId]);
    useEffect(() => { const cursor = cursorRef.current; if (!cursor) return; const handleMouseMove = (event: MouseEvent) => { cursor.style.left = `${event.clientX}px`; cursor.style.top = `${event.clientY}px`; }; const handleMouseDown = () => { cursor.classList.add('clicked'); }; const handleMouseUp = () => { cursor.classList.remove('clicked'); }; window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mousedown', handleMouseDown); window.addEventListener('mouseup', handleMouseUp); return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mousedown', handleMouseDown); window.removeEventListener('mouseup', handleMouseUp); }; }, []);
    useEffect(() => { document.body.style.cursor = 'none'; });
    const setFocusedItemId = useCallback((itemId: string | null) => { _setFocusedItemId(itemId); }, []);
    useEffect(() => { const fetchData = async () => { setIsLoading(true); try { const media = await fetchAllMedia(); if (isMountedApp.current) setMediaItems(media || []); const cats = await fetchCategories(); if (isMountedApp.current) setCategories(cats || []); } catch (error) { console.error(`${APP_LOG_PREFIX} fetchData - Error:`, error); } finally { if (isMountedApp.current) setIsLoading(false); } }; fetchData(); }, []);
    useEffect(() => { if (!focusedItemId) { if (isMountedApp.current) { if (isAudioPlayerVisible) setIsAudioPlayerVisible(false); if (currentPlaylistOrigin !== null) setCurrentPlaylistOrigin(null); if (audioPlaylist.length > 0) setAudioPlaylist([]); setFocusedItemDetailsForPlayer({}); if (playBorderHighlightAnimation) setPlayBorderHighlightAnimation(false); } return; } const focusedItem = mediaItems.find(item => item.id === focusedItemId); if (!focusedItem) { if (isMountedApp.current) { if (isAudioPlayerVisible) setIsAudioPlayerVisible(false); if (currentPlaylistOrigin !== null) setCurrentPlaylistOrigin(null); if (audioPlaylist.length > 0) setAudioPlaylist([]); setFocusedItemDetailsForPlayer({}); if (playBorderHighlightAnimation) setPlayBorderHighlightAnimation(false); } return; } if (isMountedApp.current) { setFocusedItemDetailsForPlayer({ musician: focusedItem.musician, title: focusedItem.title });} if (currentPlaylistOrigin && currentPlaylistOrigin.musician && focusedItem.musician === currentPlaylistOrigin.musician && areTitlesSimilar(focusedItem.title, currentPlaylistOrigin.title ?? undefined)) { if (!isAudioPlayerVisible && audioPlaylist.length > 0 && isMountedApp.current) { setIsAudioPlayerVisible(true); } if (isAudioPlayerVisible && !playBorderHighlightAnimation && isMountedApp.current) { setPlayBorderHighlightAnimation(true); setTimeout(() => { if (isMountedApp.current) setPlayBorderHighlightAnimation(false); }, 700); } return; } const newPlaylistOriginMusician = focusedItem.musician; const newPlaylistOriginTitle = focusedItem.title; let newPlaylistLocal: MediaItem[] = []; if (newPlaylistOriginMusician) { newPlaylistLocal = mediaItems.filter(candidateAudioItem => { if (!isAudioItem(candidateAudioItem)) return false; const musicianMatch = candidateAudioItem.musician === newPlaylistOriginMusician; if (!musicianMatch) return false; return musicianMatch && areTitlesSimilar(candidateAudioItem.title ?? undefined, newPlaylistOriginTitle ?? undefined); }).sort((a, b) => (a.title || "").localeCompare(b.title || "")); } const shouldPlayerBeVisible = newPlaylistLocal.length > 0; if (isMountedApp.current) { if (shouldPlayerBeVisible && !isAudioPlayerVisible) { setPlayBorderHighlightAnimation(true); setTimeout(() => { if (isMountedApp.current) setPlayBorderHighlightAnimation(false); }, 700); } else if (!shouldPlayerBeVisible && isAudioPlayerVisible) { if (playBorderHighlightAnimation) setPlayBorderHighlightAnimation(false); } let playlistsAreDifferent = audioPlaylist.length !== newPlaylistLocal.length; if (!playlistsAreDifferent && audioPlaylist.length > 0) { for (let i = 0; i < audioPlaylist.length; i++) { if (audioPlaylist[i].id !== newPlaylistLocal[i].id) { playlistsAreDifferent = true; break;}}} if (playlistsAreDifferent) { setAudioPlaylist(newPlaylistLocal); } if (isAudioPlayerVisible !== shouldPlayerBeVisible) { setIsAudioPlayerVisible(shouldPlayerBeVisible); } if (shouldPlayerBeVisible) { if (!currentPlaylistOrigin || currentPlaylistOrigin.musician !== newPlaylistOriginMusician || !areTitlesSimilar(currentPlaylistOrigin.title ?? undefined, newPlaylistOriginTitle ?? undefined)) { setCurrentPlaylistOrigin({ musician: newPlaylistOriginMusician, title: newPlaylistOriginTitle }); }} else { if (currentPlaylistOrigin !== null) { setCurrentPlaylistOrigin(null); }} } }, [focusedItemId, mediaItems, currentPlaylistOrigin, audioPlaylist, isAudioPlayerVisible, playBorderHighlightAnimation, isAudioPlaying]);
    const handleUserInteraction = useCallback(() => { if (!hasUserInteracted) { const context = THREE.AudioContext.getContext(); if (context.state === 'suspended') { context.resume().then(() => { console.log(`${APP_LOG_PREFIX} AudioContext resumed successfully on user interaction.`); }).catch(e => console.error(`${APP_LOG_PREFIX} Error resuming AudioContext:`, e)); } setHasUserInteracted(true); } }, [hasUserInteracted]);
    const handlePositionalAudioStateChange = useCallback((itemId: string, isPlaying: boolean) => {}, []);
    const handleFocusPointShouldChange = useCallback((newFocusPoint: THREE.Vector3) => { setCameraFocusPoint(currentFocus => { if (currentFocus.distanceToSquared(newFocusPoint) > 0.0001) return newFocusPoint.clone(); return currentFocus; }); }, []);
    const handleSetFocusedItem = useCallback((itemId: string | null) => { setSettledOnFocusedItem(null); const previouslyFocusedItem = focusedItemIdRef.current; _setFocusedItemId(currentStoredFocusedId => { const newId = (currentStoredFocusedId === itemId && itemId !== null) ? null : itemId; if (newId) { const appWasAlreadyInAFocusPreset = cameraPreset === CAMERA_PRESETS.ITEM_FOCUSED || cameraPreset === CAMERA_PRESETS.CLOSE_UP; const shouldPreserveManualCamera = appWasAlreadyInAFocusPreset && newId !== previouslyFocusedItem && manualControlActive; if (shouldPreserveManualCamera) { if (cameraPreset !== CAMERA_PRESETS.ITEM_FOCUSED) setCameraPreset(CAMERA_PRESETS.ITEM_FOCUSED); } else { setManualControlActive(false); if (!appWasAlreadyInAFocusPreset) setPreviousCameraPreset(cameraPreset); setCameraPreset(CAMERA_PRESETS.ITEM_FOCUSED); } } else { setManualControlActive(false); setCameraPreset(previousCameraPreset || CAMERA_PRESETS.DEFAULT); } return newId; }); }, [cameraPreset, previousCameraPreset, manualControlActive]);
    const handleCameraPresetChange = (newPresetValue: CAMERA_PRESETS) => { setManualControlActive(false); setFocusedItemId(null); setCameraPreset(newPresetValue); setPreviousCameraPreset(newPresetValue);};
    const handlePresetAnimationComplete = useCallback(() => { const controls = orbitControlsRef.current; if (controls && controls.object && controls.target) { const newTarget = controls.target.clone(); setCameraFocusPoint(prevFocus => { if (prevFocus.distanceToSquared(newTarget) > 0.0001) return newTarget; return prevFocus; });} if ((cameraPreset === CAMERA_PRESETS.ITEM_FOCUSED || cameraPreset === CAMERA_PRESETS.CLOSE_UP) && focusedItemIdRef.current) { setManualControlActive(true); setSettledOnFocusedItem(focusedItemIdRef.current); }}, [cameraPreset]);
    const handleCanvasCreated = useCallback((state: RootState) => { if(state.gl) state.gl.outputColorSpace = THREE.SRGBColorSpace; }, []);
    const handlePlaybackStatusChange = useCallback((isPlayingNow: boolean) => { setIsAudioPlaying(isPlayingNow); }, []);
    const handleZoomLevelChange = (newZoom: number) => setZoomLevel(newZoom);
    const handleToggleBackground = () => setSceneBackgroundColor(prev => (prev === '#000000' ? '#FFFFFF' : '#000000'));
    const handleCategoryToggle = (category: string) => { setManualControlActive(false); _setFocusedItemId(null); setCameraPreset(CAMERA_PRESETS.DEFAULT); if (category === '') { setActiveCategories([]); } else { setActiveCategories(prev => (prev.length === 1 && prev[0] === category) ? [] : [category]); }};
    const handleRandomize = () => { setManualControlActive(false); _setFocusedItemId(null); setCameraPreset(CAMERA_PRESETS.DEFAULT); setSeed(Math.floor(Math.random() * 100000) + 1); };
    const handleSeedChange = (newSeed: number) => { setManualControlActive(false); _setFocusedItemId(null); setCameraPreset(CAMERA_PRESETS.DEFAULT); setSeed(newSeed); };
    const handleNoiseChange = (newAmount: number) => { setManualControlActive(false); _setFocusedItemId(null); setCameraPreset(CAMERA_PRESETS.DEFAULT); setNoiseAmount(newAmount); };
    const handleOpacityChange = (newAmount: number) => setOpacity(newAmount);
    const handleBlendModeChange = (newMode: string) => setBlendMode(newMode);
    const handleMediaSizeChange = (newSize: number) => setMediaSize(newSize);
    const handleImageSizeChange = (newSize: number) => setImageSize(newSize);
    const toggleControls = () => setShowControls(prev => !prev);
    const handleLayoutChange = (newLayout: LAYOUT_TYPES) => { setManualControlActive(false); _setFocusedItemId(null); setCameraPreset(CAMERA_PRESETS.DEFAULT); setLayoutType(newLayout); };
    const handleViewModeChange = (newMode: VIEW_MODES) => { setManualControlActive(false); _setFocusedItemId(null); setViewMode(newMode); };
    const toggleDisplayItemMetadata = () => setDisplayItemMetadata(prev => !prev);
    const handlePosAudioHighPassChange = (newFreq: number) => setPosAudioHighPass(newFreq);
    const handlePosAudioLowPassChange = (newFreq: number) => setPosAudioLowPass(newFreq);
    const handlePosAudioQChange = (newQ: number) => setPosAudioQ(newQ);
    // ** INIZIO CORREZIONE: Definizione handler mancante **
    const handlePlayingTracksChange = useCallback((titles: string[]) => { setPlayingTrackTitles(titles); }, []);
    // ** FINE CORREZIONE **

    const canvasCameraProps = useMemo(() => ({ position: getCameraPresetPosition(CAMERA_PRESETS.DEFAULT).position.toArray() as [number,number,number], fov: 50, near: 0.1, far: 1000 }), []);
    const canvasGlProps = useMemo(() => ({ antialias: true, alpha: true, preserveDrawingBuffer: true }), []);
    const isLightTheme = useMemo<boolean>(() => { try { const color = new THREE.Color(sceneBackgroundColor); return (color.r + color.g + color.b) > 1.5; } catch { return sceneBackgroundColor === '#FFFFFF' || sceneBackgroundColor === '#ffffff'; }}, [sceneBackgroundColor]);
    const appClasses = useMemo(() => `app ${isAudioPlaying && isAudioPlayerVisible ? 'audio-active' : ''} ${isLightTheme ? 'light-theme-active' : ''} ${playBorderHighlightAnimation ? 'border-highlight-active' : ''}`, [isAudioPlaying, isAudioPlayerVisible, isLightTheme, playBorderHighlightAnimation]);

    return (
        <div className={appClasses} style={{ backgroundColor: isLightTheme ? '#FFFFFF' : '#1e1e1e' }} onClick={handleUserInteraction} onPointerDown={handleUserInteraction}>
            <div ref={cursorRef} className="custom-cursor"></div>
            <div className="app-logo-container"><img src={LOGO_UNIVERSAL_WHITE} alt="App Logo" className="app-logo" /></div>
            {isLoading ? ( <div className="loading-overlay"> <div className="loading-spinner"></div> <div className="loading-text">Loading Visual Experience...</div> </div> ) : (
                <>
                    <div className="canvas-container">
                        <Canvas camera={canvasCameraProps} gl={canvasGlProps} dpr={Math.min(window.devicePixelRatio, 2)} frameloop="always" onCreated={handleCanvasCreated} onPointerMissed={(event: any) => { if (event.button === 0 && focusedItemId) { handleSetFocusedItem(null); }}}>
                            <color attach="background" args={[sceneBackgroundColor]} />
                            <ambientLight intensity={isLightTheme ? 1.0 : 0.7} />
                            <pointLight position={[15, 20, 15]} intensity={isLightTheme ? 0.7 : 1.0} decay={2} distance={100}/>
                            <pointLight position={[-15, -10, -15]} intensity={isLightTheme ? 0.3 : 0.6} color="#66ccff" decay={2} distance={100} />
                            <OrbitControls ref={orbitControlsRef} enableZoom={true} enablePan={true} enableRotate={true} enableDamping={true} dampingFactor={0.1}/>
                            {sceneBackgroundColor === '#000000' && <Stars radius={150} depth={60} count={100} factor={5} saturation={0} fade speed={0.5} />}
                            <MediaScene
                                mediaItems={mediaItems} activeCategories={activeCategories} layoutType={layoutType}
                                zoomLevel={zoomLevel} viewMode={viewMode} displayItemMetadata={displayItemMetadata}
                                seed={seed} noiseAmount={noiseAmount} opacity={opacity} blendMode={blendMode}
                                cameraPreset={cameraPreset} mediaSize={mediaSize} imageSize={imageSize}
                                manualControl={manualControlActive} onFocusPointShouldChange={handleFocusPointShouldChange}
                                onPresetAnimationComplete={handlePresetAnimationComplete} sceneBackgroundColor={sceneBackgroundColor}
                                orbitControlsRef={orbitControlsRef} focusedItemId={focusedItemId} onItemFocus={handleSetFocusedItem}
                                settledOnNewFocusTarget={settledOnFocusedItem}
                                onPositionalAudioStateChange={handlePositionalAudioStateChange}
                                currentPlaylistOrigin={currentPlaylistOrigin}
                                isAudioPlayerActuallyPlaying={isAudioPlaying}
                                positionalAudioHighPass={posAudioHighPass}
                                positionalAudioLowPass={posAudioLowPass}
                                positionalAudioQ={posAudioQ}
                                onPlayingTracksChange={handlePlayingTracksChange}
                                remotePointerNormalized={null}
                                onRemoteItemHover={() => {}}
                                remoteHoveredItemId={null}
                                remoteClickSignal={0}
                                remoteCursorVisible={false}
                            />
                        </Canvas>
                    </div>
                    <div className="gallery-controls">
                        <button className="gallery-control-btn" onClick={handleToggleBackground} aria-label="Toggle Background Color" title={`Switch to ${sceneBackgroundColor === '#000000' ? 'White' : 'Black'} Background`} > {sceneBackgroundColor === '#000000' ? '☀️' : '🌙'} </button>
                        <button className="gallery-control-btn" onClick={toggleControls} aria-label={showControls ? "Hide controls" : "Show controls"} title={showControls ? "Hide controls" : "Show controls"}>{showControls ? "🔽" : "🔼"}</button>
                        <button className="gallery-control-btn" onClick={handleRandomize} aria-label="Randomize positions" title="Randomize positions">🔄</button>
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
                            posAudioHighPass={posAudioHighPass}
                            onPosAudioHighPassChange={handlePosAudioHighPassChange}
                            posAudioLowPass={posAudioLowPass}
                            onPosAudioLowPassChange={handlePosAudioLowPassChange}
                            posAudioQ={posAudioQ}
                            onPosAudioQChange={handlePosAudioQChange}
                        />
                    )}
                    <AudioPlayerOverlay
                        playlist={audioPlaylist} isVisible={isAudioPlayerVisible} onPlaybackStatusChange={handlePlaybackStatusChange}
                        focusedItemMusician={focusedItemDetailsForPlayer.musician} focusedItemTitle={focusedItemDetailsForPlayer.title}
                        sceneBackgroundColor={sceneBackgroundColor}
                    />
                    <div className="playing-tracks-overlay">
                        <p>Fonti Audio Ambientali Attive:</p>
                        {/* ** INIZIO CORREZIONE: Aggiunta tipi espliciti ** */}
                        {playingTrackTitles.length > 0 ? (
                            <ul>
                                {playingTrackTitles.map((title: string, index: number) => ( <li key={index}>{title}</li> ))}
                            </ul>
                        ) : ( <span>Nessuna</span> )}
                        {/* ** FINE CORREZIONE ** */}
                    </div>
                </>
            )}
        </div>
    );
};
export default App;