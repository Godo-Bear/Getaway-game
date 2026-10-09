import * as THREE from 'three';
import { generateRooftopCity } from '../rooftopCity.js';
import { LUMIERE_FOOT } from '../maps.js';
import { rooftopCitySpawns } from '../../ai/officer.js';
import { buildSpeedboat } from '../../vehicles/boats.js';
import { PlayerModel } from '../../player/playerModel.js';
import { crewLook } from '../../player/people.js';
import { makeGlowMaterial } from '../materials.js';

// Chapter 21, Part 1: the roofs of Lumière at dawn (the same city as Free Run).
// From the crew's studio in the north-west, over the roofs and the streets to
// the quay on the north bank of the river, where Paz waits in the speedboat.
// The river runs east-west through block row 5 of the map.

export function buildChapter21Roofs() {
  const city = generateRooftopCity(LUMIERE_FOOT);
  const C = (i) => city.blockCenters[i];
  /** The roof of the building nearest the middle of block (i, j): where to stand, and how high. */
  const roofOf = (i, j) => {
    const cx = C(i), cz = C(j);
    let best = null, bd = Infinity;
    for (const b of city.buildings) {
      const x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2, d = Math.hypot(x - cx, z - cz);
      if (Math.abs(x - cx) > city.block / 2 || Math.abs(z - cz) > city.block / 2 || b.h < 8) continue;
      if (d < bd) { bd = d; best = b; }
    }
    const b = best;
    return { pos: new THREE.Vector3((b.minX + b.maxX) / 2, b.h + 0.05, (b.minZ + b.maxZ) / 2), roof: { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, h: b.h } };
  };
  const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z) - Math.PI;

  // where Paz is waiting: the quay on the north bank, below block (3, 4)
  const water = city.water[0];
  const goalPos = new THREE.Vector3(C(3), 0, water.z0 - 3);
  const studio = roofOf(1, 2), mid = roofOf(2, 3);
  const park = new THREE.Vector3(C(3), 0.05, C(3));
  const checkpoints = [
    { name: 'The studio roof', spawn: studio.pos, yaw: yawTo(studio.pos, mid.pos), roof: studio.roof },
    { name: 'Over the rue de Seine', spawn: mid.pos, yaw: yawTo(mid.pos, park), roof: mid.roof },
    { name: 'The esplanade', spawn: park, yaw: yawTo(park, goalPos), roof: { minX: park.x - 8, maxX: park.x + 8, minZ: park.z - 8, maxZ: park.z + 8, h: 0 } },
  ];

  // Paz's speedboat at the bottom of the quay steps, engine running
  const boat = buildSpeedboat();
  boat.position.set(goalPos.x, 0, water.z0 + 3.5);
  boat.rotation.y = Math.PI / 2;
  const paz = new PlayerModel(crewLook('paz'), { bag: false });
  paz.update(0, { pos: new THREE.Vector3(-0.4, 0.62, -0.6), vel: new THREE.Vector3(), facing: 0, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null });
  boat.add(paz.root);
  city.group.add(boat);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3, 32), makeGlowMaterial(0x4dffa6, 0.75));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(goalPos.x, 0.08, goalPos.z);
  city.group.add(ring);

  return {
    ...city,
    groundLevel: true,
    spawn: studio.pos.clone(), checkpoints, clues: [], goalPos,
    officerSpawns: rooftopCitySpawns(city),
    heliStart: new THREE.Vector3(-120, 0, -200),
    pazBoat: boat,
  };
}
