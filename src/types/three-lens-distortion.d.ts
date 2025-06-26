// src/types/three-lens-distortion.d.ts
declare module 'three-lens-distortion' {
    import * as THREE from 'three';
    import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
  
    // Interface for the options passed to the LensDistortionPass constructor
    interface LensDistortionPassOptions {
      distortion?: THREE.Vector2;
      principalPoint?: THREE.Vector2;
      focalLength?: THREE.Vector2;
      skew?: number;
    }
  
    // Describe the instance of the pass created by the generated constructor
    interface LensDistortionPassInstance extends Pass {
      distortion: THREE.Vector2;
      principalPoint: THREE.Vector2;
      focalLength: THREE.Vector2;
      skew: number;
      // Add other known properties or methods if you interact with them
      // For example, if it has uniforms you access directly:
      // uniforms: Map<string, { value: any }>; 
      dispose(): void; // Most passes have a dispose method
    }
  
    // Type for the constructor that LensDistortionPassGen returns
    type LensDistortionPassConstructor = new (options?: LensDistortionPassOptions) => LensDistortionPassInstance;
  
    // Type for the LensDistortionPassGen function itself
    export function LensDistortionPassGen(dependencies: {
      THREE: typeof THREE; // Pass the THREE namespace
      Pass: typeof Pass;   // Pass the Pass class constructor
      FullScreenQuad: any; // FullScreenQuad is an internal class in Pass.js, often typed as 'any' here for simplicity
    }): LensDistortionPassConstructor;
  }