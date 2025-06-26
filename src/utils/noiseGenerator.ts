// Optimized noise generator for 3D position generation
// src/utils/noiseGenerator.ts

export interface Position {
  x: number;
  y: number;
  z: number;
}

/**
 * Simple seeded random number generator with improved distribution
 * @param seed Random seed value
 * @returns Random number generator function
 */
function createSeededRandom(seed: number) {
  let s = seed;
  return () => {
    s = Math.sin(s) * 10000;
    return s - Math.floor(s);
  };
}

/**
 * Generates 3D positions for media items using a seeded random generator
 * @param count Number of positions to generate
 * @param seed Random seed value
 * @param scale Scale factor for the positions
 * @returns Array of position objects
 */
export function generatePositions(
  count: number, 
  seed: number = 42, 
  scale: number = 1
): Position[] {
  // Create seeded random generator
  const random = createSeededRandom(seed);
  const positions: Position[] = [];

  // Generate positions using a deterministic algorithm
  for (let i = 0; i < count; i++) {
    // Use different distribution strategies based on index
    // This creates more interesting and varied layouts
    if (i % 3 === 0) {
      // Spherical distribution for some items
      const theta = random() * Math.PI * 2;
      const phi = random() * Math.PI;
      const r = (random() * 0.5 + 0.5) * 800 * scale;
      
      positions.push({
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta),
        z: r * Math.cos(phi)
      });
    } else if (i % 3 === 1) {
      // Disk-like distribution for some items
      const theta = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * 800 * scale;
      
      positions.push({
        x: r * Math.cos(theta),
        y: r * Math.sin(theta),
        z: (random() - 0.5) * 200 * scale
      });
    } else {
      // Random distribution for the rest
      positions.push({
        x: (random() - 0.5) * 800 * scale,
        y: (random() - 0.5) * 800 * scale,
        z: (random() - 0.5) * 300 * scale
      });
    }
  }

  return positions;
}

/**
 * Applies jitter to positions to make them more natural
 * @param positions Array of position objects
 * @param amount Amount of jitter to apply (0-1)
 * @returns Positions with jitter applied
 */
export function applyJitter(positions: Position[], amount: number = 0.2): Position[] {
  return positions.map(pos => {
    const jitterScale = 100 * amount;
    return {
      x: pos.x + (Math.random() - 0.5) * jitterScale,
      y: pos.y + (Math.random() - 0.5) * jitterScale,
      z: pos.z + (Math.random() - 0.5) * jitterScale
    };
  });
}

/**
 * Applies collision avoidance to ensure items don't overlap
 * @param positions Array of position objects
 * @param minDistance Minimum distance between items
 * @returns Positions with collision avoidance applied
 */
export function avoidCollisions(positions: Position[], minDistance: number = 50): Position[] {
  const result = [...positions];
  
  // Simple repulsion algorithm
  for (let iterations = 0; iterations < 3; iterations++) {
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const dx = result[j].x - result[i].x;
        const dy = result[j].y - result[i].y;
        const dz = result[j].z - result[i].z;
        
        const distSquared = dx * dx + dy * dy + dz * dz;
        if (distSquared < minDistance * minDistance) {
          const dist = Math.sqrt(distSquared);
          const force = (minDistance - dist) / dist * 0.5;
          
          // Push items away from each other
          result[j].x += dx * force;
          result[j].y += dy * force;
          result[j].z += dz * force;
          result[i].x -= dx * force;
          result[i].y -= dy * force;
          result[i].z -= dz * force;
        }
      }
    }
  }
  
  return result;
}