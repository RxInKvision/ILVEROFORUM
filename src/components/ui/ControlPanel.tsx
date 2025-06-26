// src/components/ui/ControlPanel.tsx

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LAYOUT_TYPES } from '../../constants/layoutTypes';
import { VIEW_MODES } from '../../constants/viewSettings';
import { CAMERA_PRESETS } from '../gallery/MediaScene';
import './controls.css';

const MIN_FOV_DISPLAY = 20;
const MAX_FOV_DISPLAY = 80;

export enum BLEND_MODES {
    NORMAL = 'normal',
    ADDITIVE = 'additive',
    SCREEN = 'screen',
    DIFFERENCE = 'difference',
}

interface ControlPanelProps {
    categories: string[];
    activeCategories: string[];
    onCategoryToggle: (category: string) => void;
    layoutType: LAYOUT_TYPES;
    onLayoutChange: (layout: LAYOUT_TYPES) => void;
    zoomLevel: number;
    onZoomChange: (zoom: number) => void;
    displayItemMetadata: boolean;
    onToggleDisplayItemMetadata: () => void;
    viewMode: VIEW_MODES;
    onViewModeChange: (mode: VIEW_MODES) => void;
    onRandomize: () => void;
    seed: number;
    onSeedChange: (seed: number) => void;
    noiseAmount: number;
    onNoiseChange: (amount: number) => void;
    opacity: number;
    onOpacityChange: (amount: number) => void;
    blendMode: string;
    onBlendModeChange: (mode: string) => void;
    cameraPreset: CAMERA_PRESETS;
    onCameraPresetChange: (preset: CAMERA_PRESETS) => void;
    mediaSize: number;
    onMediaSizeChange: (size: number) => void;
    imageSize: number;
    onImageSizeChange: (size: number) => void;
    posAudioHighPass: number;
    onPosAudioHighPassChange: (value: number) => void;
    posAudioLowPass: number;
    onPosAudioLowPassChange: (value: number) => void;
    posAudioQ: number;
    onPosAudioQChange: (value: number) => void;
}

interface ModulePanelProps {
    title: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
    className?: string;
    isActive?: boolean;
    isFullMode?: boolean;
}

const ModulePanel: React.FC<ModulePanelProps> = React.memo(({ title, defaultOpen = true, children, className = "", isActive = false, isFullMode }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    useEffect(() => { if (isFullMode) { setIsOpen(defaultOpen || isActive); } else { setIsOpen(isActive && defaultOpen); } }, [defaultOpen, isActive, isFullMode]);
    const manualToggle = () => { if (isFullMode) setIsOpen(prev => !prev); };
    return (
        <div className={`module-panel ${isOpen && isFullMode ? 'module-open' : 'module-closed'} ${className} ${isActive ? 'active-panel' : ''}`} data-active={isActive ? "true" : "false"}>
            <div className="module-header" onClick={manualToggle}>
                <h3>{title}</h3>
                {isFullMode && <span className="module-toggle">{isOpen ? '▼' : '▶'}</span>}
            </div>
            {isOpen && isFullMode && (<div className="module-content">{children}</div>)}
        </div>
    );
});

interface SliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
    formatValue?: (value: number) => string;
}

const Slider: React.FC<SliderProps> = React.memo(({ label, value, min, max, step, onChange, formatValue = (v: number) => Math.round(v * 100) + '%' }) => (
    <div className="control-slider">
        <div className="slider-label"><span>{label}</span><span className="slider-value">{formatValue(value)}</span></div>
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="console-slider"/>
    </div>
));

const MIN_CONSOLE_HEIGHT_CONST = 100;

const ControlPanel: React.FC<ControlPanelProps> = (props) => {
    const {
        categories, activeCategories, onCategoryToggle, layoutType, onLayoutChange, zoomLevel, onZoomChange,
        displayItemMetadata, onToggleDisplayItemMetadata,
        viewMode, onViewModeChange, onRandomize, seed, onSeedChange,
        noiseAmount, onNoiseChange,
        opacity, onOpacityChange, blendMode, onBlendModeChange,
        cameraPreset, onCameraPresetChange, mediaSize, onMediaSizeChange,
        imageSize, onImageSizeChange,
        posAudioHighPass, onPosAudioHighPassChange,
        posAudioLowPass, onPosAudioLowPassChange,
        posAudioQ, onPosAudioQChange,
    } = props;

    const [isCompact, setIsCompact] = useState(true);
    const [consoleHeight, setConsoleHeight] = useState(240);
    const consoleRef = useRef<HTMLDivElement>(null);
    const isResizing = useRef(false);
    const initialMouseY = useRef(0);
    const initialHeight = useRef(0);
    const isFullModeActive = !isCompact;
    const MAX_CONSOLE_HEIGHT = useMemo(() => (typeof window !== 'undefined' ? window.innerHeight * 0.9 : 700), []);
    const handleMouseMoveResize = useCallback((e: MouseEvent) => { if (!isResizing.current || !consoleRef.current) return; const dY = e.clientY - initialMouseY.current; let nH = initialHeight.current - dY; nH = Math.max(MIN_CONSOLE_HEIGHT_CONST, Math.min(nH, MAX_CONSOLE_HEIGHT)); setConsoleHeight(nH); }, [MAX_CONSOLE_HEIGHT]);
    const handleMouseUpResize = useCallback(() => { if (!isResizing.current) return; isResizing.current = false; document.body.style.cursor = 'default'; document.body.style.userSelect = 'auto'; document.removeEventListener('mousemove', handleMouseMoveResize); document.removeEventListener('mouseup', handleMouseUpResize); }, [handleMouseMoveResize]);
    const handleMouseDownResize = useCallback((e: React.MouseEvent<HTMLDivElement>) => { if (isCompact || !consoleRef.current) return; e.preventDefault(); isResizing.current = true; initialMouseY.current = e.clientY; initialHeight.current = consoleRef.current.offsetHeight; document.body.style.cursor = 'ns-resize'; document.body.style.userSelect = 'none'; document.addEventListener('mousemove', handleMouseMoveResize); document.addEventListener('mouseup', handleMouseUpResize); }, [isCompact, handleMouseMoveResize, handleMouseUpResize]);
    useEffect(() => { const cMMH = handleMouseMoveResize; const cMUH = handleMouseUpResize; const rSAER = isResizing.current; return () => { if (rSAER) { document.body.style.cursor = 'default'; document.body.style.userSelect = 'auto'; document.removeEventListener('mousemove', cMMH); document.removeEventListener('mouseup', cMUH); }}; }, [handleMouseMoveResize, handleMouseUpResize]);
    useEffect(() => { if (isFullModeActive && !isResizing.current) { const dFH = 240; if (consoleHeight < MIN_CONSOLE_HEIGHT_CONST * 1.5) { setConsoleHeight(dFH); }}}, [isFullModeActive, consoleHeight]);
    
    const consoleDynamicStyle: React.CSSProperties = isCompact ? {} : { height: `${consoleHeight}px`, maxHeight: 'none' };

    return (
        <div ref={consoleRef} className={`control-console ${isCompact ? 'compact-mode' : 'full-mode'}`} style={consoleDynamicStyle}>
            <div className="console-drag-handle" onMouseDown={handleMouseDownResize}></div>
            <div className="console-actions">
                <button className="console-action-btn randomize-btn" onClick={onRandomize} title="Randomize positions"><span>🔄</span></button>
                <button className="console-action-btn mode-toggle" onClick={() => setIsCompact(!isCompact)} title={isCompact ? "Expand Controls" : "Collapse Controls"}><span>{isCompact ? '≡' : '—'}</span></button>
            </div>
            
            {!isCompact && (
                <div className="console-modules">
                    <ModulePanel title="Categories" defaultOpen={true} isFullMode={isFullModeActive}>
                        <div className="category-filters">
                            <button className={`console-btn ${activeCategories.length === 0 ? 'active' : ''}`} onClick={() => onCategoryToggle('')}>All</button>
                            {categories.map((category: string) => (<button key={category} className={`console-btn ${activeCategories.includes(category) ? 'active' : ''}`} onClick={() => onCategoryToggle(category)}>{category}</button>))}
                        </div>
                    </ModulePanel>
                    <ModulePanel title="Layout" defaultOpen={true} isFullMode={isFullModeActive}>
                        <div className="button-grid layout-grid">
                            {Object.values(LAYOUT_TYPES).map(type => (<button key={type} className={`grid-btn ${layoutType === type ? 'active' : ''}`} onClick={() => onLayoutChange(type)}>{type.replace(/_/g, ' ')}</button>))}
                        </div>
                    </ModulePanel>
                    <ModulePanel title="View" defaultOpen={true} isFullMode={isFullModeActive}>
                        <Slider label="FOV Zoom" value={zoomLevel} min={0} max={1} step={0.01} onChange={onZoomChange} formatValue={(v) => `${(MIN_FOV_DISPLAY + (1 - v) * (MAX_FOV_DISPLAY - MIN_FOV_DISPLAY)).toFixed(0)}°`}/>
                        <div className="view-mode-buttons">
                            <button className={`console-btn ${viewMode === VIEW_MODES.NORMAL ? 'active' : ''}`} onClick={() => onViewModeChange(VIEW_MODES.NORMAL)}>Normal</button>
                            <button className={`console-btn ${viewMode === VIEW_MODES.CONNECTIONS ? 'active' : ''}`} onClick={() => onViewModeChange(VIEW_MODES.CONNECTIONS)}>Connect</button>
                        </div>
                        <div className="control-item" style={{ marginTop: '15px' }}>
                            <span className="control-item-label">Item Info:</span>
                            <label className="toggle-switch">
                                <input type="checkbox" checked={displayItemMetadata} onChange={onToggleDisplayItemMetadata} />
                                <span className="switch-slider"></span>
                            </label>
                        </div>
                    </ModulePanel>
                    <ModulePanel title="Audio Filters" defaultOpen={true} isFullMode={isFullModeActive}>
                        <Slider 
                            label="High-Pass" 
                            value={posAudioHighPass} 
                            min={20} 
                            max={2000} 
                            step={10} 
                            onChange={onPosAudioHighPassChange} 
                            formatValue={(v) => `${v.toFixed(0)} Hz`}
                        />
                        <Slider 
                            label="Low-Pass" 
                            value={posAudioLowPass} 
                            min={150} 
                            max={22000} 
                            step={50} 
                            onChange={onPosAudioLowPassChange} 
                            formatValue={(v) => `${v.toFixed(0)} Hz`}
                        />
                         <Slider 
                            label="Q Factor" 
                            value={posAudioQ} 
                            min={0.5} 
                            max={5} 
                            step={0.1} 
                            onChange={onPosAudioQChange} 
                            formatValue={(v) => v.toFixed(1)}
                        />
                    </ModulePanel>
                    <ModulePanel title="Visual Effects" defaultOpen={true} isFullMode={isFullModeActive}>
                        <Slider 
                            label="Opacity" 
                            value={opacity} 
                            min={0} 
                            max={100} 
                            step={1} 
                            onChange={onOpacityChange} 
                            formatValue={v => `${v.toFixed(0)}%`}
                        />
                        <div className="button-grid blend-mode-grid">
                            {Object.values(BLEND_MODES).map(mode => (
                                <button 
                                    key={mode} 
                                    className={`grid-btn ${blendMode === mode ? 'active' : ''}`} 
                                    onClick={() => onBlendModeChange(mode)}
                                >
                                    {mode}
                                </button>
                            ))}
                        </div>
                    </ModulePanel>
                    <ModulePanel title="Media Size" defaultOpen={true} className="media-size-panel" isFullMode={isFullModeActive}>
                        <div className="media-type-controls"><h5 className="sub-module-title">Video Size</h5><Slider label="Scale" value={mediaSize} min={0.5} max={5} step={0.1} onChange={onMediaSizeChange} formatValue={(v) => v.toFixed(1) + "x"}/>
                            <div className="size-buttons"><button className="console-btn size-btn" onClick={()=>onMediaSizeChange(1.0)}>Reset</button></div>
                        </div>
                        <hr className="module-divider" />
                        <div className="media-type-controls"><h5 className="sub-module-title">Image Size</h5><Slider label="Scale" value={imageSize} min={0.5} max={5} step={0.1} onChange={onImageSizeChange} formatValue={(v) => v.toFixed(1) + "x"}/>
                            <div className="size-buttons"><button className="console-btn size-btn" onClick={()=>onImageSizeChange(1.0)}>Reset</button></div>
                        </div>
                    </ModulePanel>
                    <ModulePanel title="Camera Presets" defaultOpen={true} isFullMode={isFullModeActive}>
                        <div className="button-grid camera-grid">
                            {Object.values(CAMERA_PRESETS).map(pkey => (<button key={pkey} className={`grid-btn ${cameraPreset === pkey ? 'active' : ''}`} onClick={() => onCameraPresetChange(pkey)}>{pkey}</button>))}
                        </div>
                    </ModulePanel>
                    <ModulePanel title="Advanced Layout" defaultOpen={true} isFullMode={isFullModeActive}>
                        <Slider label="Seed" value={seed} min={1} max={100000} step={1} onChange={onSeedChange} formatValue={(v) => Math.round(v).toString()}/>
                        <Slider label="Scatter" value={noiseAmount} min={0} max={1} step={0.01} onChange={onNoiseChange} formatValue={v => `${(v*100).toFixed(0)}%`}/>
                    </ModulePanel>
                </div>
            )}
        </div>
    );
};

export default ControlPanel;