import React, { useMemo, useRef, useEffect } from 'react';

import * as THREE from 'three';

import { useFrame } from '@react-three/fiber';



export interface ConnectionLinesProps {

positions: THREE.Vector3[];

sceneBackgroundColor: THREE.ColorRepresentation;

threshold?: number;

maxConnectionsPerItem?: number;

}



interface GridPoint {

point: THREE.Vector3;

originalIndex: number;

}



export const ConnectionLines: React.FC<ConnectionLinesProps> = React.memo(({

positions,

sceneBackgroundColor,

threshold = 15,

maxConnectionsPerItem = 3

}) => {

const linesRef = useRef<THREE.LineSegments>(null);

const materialRef = useRef<THREE.LineBasicMaterial | null>(null);



useEffect(() => {

materialRef.current = new THREE.LineBasicMaterial({

transparent: true,

depthWrite: false,

});

if (linesRef.current) {

linesRef.current.material = materialRef.current;

}

return () => {

materialRef.current?.dispose();

}

}, []);



useEffect(() => {

if (materialRef.current) {

try {

const whiteColor = new THREE.Color(0xffffff);

const blackColor = new THREE.Color(0x000000);

let bgColorInput: THREE.ColorRepresentation = '#000000';

if (typeof sceneBackgroundColor === 'string' || typeof sceneBackgroundColor === 'number' || sceneBackgroundColor instanceof THREE.Color) {

bgColorInput = sceneBackgroundColor;

}

const bgColor = new THREE.Color(bgColorInput);



if (bgColor.equals(whiteColor)) {

materialRef.current.color.set(blackColor);

} else {

materialRef.current.color.set(whiteColor);

}

} catch (e) {

console.error("Invalid color for ConnectionLines: ", sceneBackgroundColor, e);

materialRef.current.color.set(0xffffff);

}

}

}, [sceneBackgroundColor]);



useFrame(({ clock }) => {

if (materialRef.current) {

const baseOpacity = 0.15;

if (materialRef.current.opacity !== baseOpacity) {

materialRef.current.opacity = baseOpacity;

}

}

});



const geometry = useMemo(() => {

const validPositionData = positions

.map((p, index) => ({ point: p, originalIndex: index }))

.filter(gp => gp.point instanceof THREE.Vector3 && gp.point.z > -9000 &&

!isNaN(gp.point.x) && !isNaN(gp.point.y) && !isNaN(gp.point.z));



if (validPositionData.length < 2) return null;



const pointsArray: number[] = [];

const grid: Map<string, GridPoint[]> = new Map();

const cellSize = Math.max(1, threshold);



const getCellKey = (p: THREE.Vector3): string => {

return `${Math.floor(p.x / cellSize)}_${Math.floor(p.y / cellSize)}_${Math.floor(p.z / cellSize)}`;

};



for (const gp of validPositionData) {

const key = getCellKey(gp.point);

if (!grid.has(key)) {

grid.set(key, []);

}

grid.get(key)!.push(gp);

}



const connectionCounts = new Array(positions.length).fill(0);

const addedPairs = new Set<string>();



for (const gp1 of validPositionData) {

if (connectionCounts[gp1.originalIndex] >= maxConnectionsPerItem) continue;



const p1 = gp1.point;

const cellX = Math.floor(p1.x / cellSize);

const cellY = Math.floor(p1.y / cellSize);

const cellZ = Math.floor(p1.z / cellSize);



for (let dx = -1; dx <= 1; dx++) {

for (let dy = -1; dy <= 1; dy++) {

for (let dz = -1; dz <= 1; dz++) {

if (connectionCounts[gp1.originalIndex] >= maxConnectionsPerItem) break;

const neighborCellKey = `${cellX + dx}_${cellY + dy}_${cellZ + dz}`;



if (grid.has(neighborCellKey)) {

for (const gp2 of grid.get(neighborCellKey)!) {

if (gp1.originalIndex === gp2.originalIndex) continue;



const O1 = gp1.originalIndex;

const O2 = gp2.originalIndex;

const pairKey = O1 < O2 ? `${O1}_${O2}` : `${O2}_${O1}`;

if (addedPairs.has(pairKey)) continue;



if (connectionCounts[O1] >= maxConnectionsPerItem || connectionCounts[O2] >= maxConnectionsPerItem) {

if (connectionCounts[O1] >= maxConnectionsPerItem) break;

continue;

}



const p2 = gp2.point;

if (p1.distanceTo(p2) < threshold) {

pointsArray.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);

connectionCounts[O1]++;

connectionCounts[O2]++;

addedPairs.add(pairKey);

if (connectionCounts[O1] >= maxConnectionsPerItem) break;

}

}

}

if (connectionCounts[gp1.originalIndex] >= maxConnectionsPerItem) break;

}

if (connectionCounts[gp1.originalIndex] >= maxConnectionsPerItem) break;

}

if (connectionCounts[gp1.originalIndex] >= maxConnectionsPerItem) break;

}

}



if (pointsArray.length === 0) return null;

const bufferGeom = new THREE.BufferGeometry();

bufferGeom.setAttribute('position', new THREE.Float32BufferAttribute(pointsArray, 3));

return bufferGeom;

}, [positions, threshold, maxConnectionsPerItem]);



if (!geometry || !materialRef.current) return null;



return <lineSegments ref={linesRef} geometry={geometry} material={materialRef.current} frustumCulled={false} />;

});



// Default export is not strictly necessary if you use named exports, but can be convenient

// export default ConnectionLines;



