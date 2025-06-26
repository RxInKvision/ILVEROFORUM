declare module 'troika-three-text' {
  import * as THREE from 'three';

  export interface TextRenderInfo {
    blockBounds: [number, number, number, number]; // minX, minY, maxX, maxY
    lineBounds: Array<[number, number, number, number]>;
    caretPositions: Array<[number, number, number, number]>; // [x1, y1, x2, y2] for each char
     συνολικάΧαρακτήρες: number;
    [key: string]: any; // For other properties not strictly typed here
  }

  export class Text extends THREE.Mesh {
    text: string;
    font?: string;
    fontSize?: number;
    letterSpacing?: number;
    lineHeight?: number | 'normal';
    maxWidth?: number;
    overflowWrap?: 'normal' | 'break-word';
    textAlign?: 'left' | 'right' | 'center' | 'justify';
    textIndent?: number;
    whiteSpace?: 'normal' | 'nowrap';
    anchorX?: number | `${number}%` | 'left' | 'center' | 'right';
    anchorY?: number | `${number}%` | 'top' | 'top-baseline' | 'middle' | 'bottom-baseline' | 'bottom';
    color?: THREE.ColorRepresentation | [number, number, number];
    colorRanges?: { [key: string]: THREE.ColorRepresentation };
    material?: THREE.Material | THREE.Material[];
    depthOffset?: number;
    clipRect?: [number, number, number, number]; // minX, minY, maxX, maxY
    orientation?: string; // e.g. "xy"
    glyphGeometryDetail?: number;
    sdfGlyphSize?: number;
    gpuAccelerateSDF?: boolean;
    outlineWidth?: number | string;
    outlineColor?: THREE.ColorRepresentation;
    outlineOpacity?: number;
    outlineBlur?: number | string;
    outlineOffsetX?: number | string;
    outlineOffsetY?: number | string;
    inStrokeWidth?: number | string;
    inStrokeColor?: THREE.ColorRepresentation;
    inStrokeOpacity?: number;
    opacity?: number;
    curveRadius?: number;
    direction?: 'auto' | 'ltr' | 'rtl';
    debugSDF?: boolean;

    textRenderInfo: TextRenderInfo | null;

    constructor();
    // You might need to declare methods like sync if you call them directly,
    // but for onSync callback, the instance is passed.
    sync(callback?: () => void): void;
    dispose(): void;
  }
}