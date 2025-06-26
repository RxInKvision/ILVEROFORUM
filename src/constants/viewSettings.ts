// src/constants/viewSettings.ts

// Constants for view mode settings
// src/constants/viewSettings.ts
export enum VIEW_MODES {
  NORMAL = 'NORMAL',
  CONNECTIONS = 'CONNECTIONS',
}


// Enhanced blend modes for visual effects
export enum BLEND_MODES {
  NORMAL = 'normal',
  ADDITIVE = 'additive',
  MULTIPLY = 'multiply',
  SCREEN = 'screen',
  DIFFERENCE = 'difference',
}

// Default visual effects configuration
export const DEFAULT_VISUAL_EFFECTS = {
  blurAmount: 0,
  blendMode: BLEND_MODES.NORMAL,
  digitalGlitchAmount: 0
};