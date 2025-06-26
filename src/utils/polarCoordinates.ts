// polarCoordinates.ts
interface Position {
  x: number;
  y: number;
  z: number;
}

interface PolarOptions {
  radiusMin?: number;
  radiusMax?: number;
  zMin?: number;
  zMax?: number;
  jitterAmount?: number;
}

/**
 * Applies polar coordinate transformations to positions
 * @param positions Array of position objects
 * @param options Configuration options
 * @returns Transformed positions
 */
export function applyPolarCoordinates(
  positions: Position[], 
  options: PolarOptions = {}
): Position[] {
  const {
    radiusMin = 100,
    radiusMax = 800,
    zMin = -300,
    zMax = 300,
    jitterAmount = 0.2
  } = options;
  
  return positions.map((pos) => {
    // Convert to polar coordinates
    const theta = Math.atan2(pos.y, pos.x);
    const radius = radiusMin + (Math.random() * (radiusMax - radiusMin));
    
    // Apply jitter to all dimensions
    const jitterX = (Math.random() - 0.5) * jitterAmount * radiusMax;
    const jitterY = (Math.random() - 0.5) * jitterAmount * radiusMax;
    const z = zMin + (Math.random() * (zMax - zMin));
    
    // Convert back to Cartesian coordinates
    return {
      x: radius * Math.cos(theta) + jitterX,
      y: radius * Math.sin(theta) + jitterY,
      z
    };
  });
}