import * as THREE from 'three';
import { generateRooftopCity, findClearRoofSpot } from '../rooftopCity.js';
import { makeCarMesh } from '../../vehicles/carModel.js';
import { playerCarColour } from '../../vehicles/carColours.js';
import { makeRng } from '../../core/utils.js';

// ======================================================================
//  Chapter 5, Part 1: a new crew.
//  A rooftop city at night. Meet three people on three roofs (Nova, Mags
//  and Theo), then drop down to the street where Ricky waits with the car.
//  The meeting roofs double as checkpoints. A police helicopter patrols
//  (you're a famous face now).
// ======================================================================

export function buildChapter5Recruit() {
  const city = generateRooftopCity({ seed: 5150, blocks: 5 });
  const rng = makeRng(77);
  const w = city.world;
  const centre = (b) => new THREE.Vector3((b.minX + b.maxX) / 2, b.h, (b.minZ + b.maxZ) / 2);
  const normal = city.buildings.filter((b) => !b.tower);
  const sp = city.spawn;
  const used = new Set();
  /** The normal building nearest to a point (not one we already used). */
  const nearest = (x, z) => {
    let best = null, bd = Infinity;
    for (const b of normal) {
      if (used.has(b)) continue;
      const c = centre(b), d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) { bd = d; best = b; }
    }
    used.add(best);
    return best;
  };
  const startB = nearest(sp.x, sp.z);
  const spotOn = (b) => findClearRoofSpot(w, b, rng, 1.1) || centre(b).setY(b.h + 0.05);

  // The three meetings, heading east, then north, then north-west
  const novaB = nearest(sp.x + 48, sp.z + 4);
  const magsB = nearest(sp.x + 52, sp.z - 52);
  const theoB = nearest(sp.x - 6, sp.z - 100);
  const meetingSpots = { nova: spotOn(novaB), mags: spotOn(magsB), theo: spotOn(theoB) };

  // Clues on neighbouring roofs (a short detour from the meeting)
  const laptopB = nearest(centre(novaB).x + 4, centre(novaB).z + 20);
  const scheduleB = nearest(centre(theoB).x + 20, centre(theoB).z);
  const clues = [
    { id: 'laptop', pos: spotOn(laptopB) },
    { id: 'schedule', pos: spotOn(scheduleB) },
  ];

  // Ricky's car: parked on the street next to Theo's building
  const tc = centre(theoB);
  const streets = [];
  for (let i = 0; i < city.blockCenters.length - 1; i++) {
    const s = city.blockCenters[i] + city.pitch / 2;
    streets.push({ x: s, z: tc.z, heading: 0 }, { x: tc.x, z: s, heading: Math.PI / 2 });
  }
  const clear = (s) => w.query(s.x - 1.6, 0.3, s.z - 2.6, s.x + 1.6, 3, s.z + 2.6, []).length === 0 && w.groundHeight(s.x, s.z, 3) < 1;
  const carSpot = streets.filter(clear).sort((a, b) => Math.hypot(a.x - tc.x, a.z - tc.z) - Math.hypot(b.x - tc.x, b.z - tc.z))[0];
  const car = makeCarMesh({ kind: 'player', color: playerCarColour() });
  car.rotation.y = carSpot.heading;
  const goalPos = new THREE.Vector3(carSpot.x, w.groundHeight(carSpot.x, carSpot.z, 3), carSpot.z);
  car.position.copy(goalPos);
  city.group.add(car);
  w.addBlock(carSpot.x, goalPos.y, carSpot.z, carSpot.heading ? 4.4 : 2, 1.3, carSpot.heading ? 2 : 4.4, { tag: 'car' });
  // Ricky stands by the driver's door
  meetingSpots.ricky = goalPos.clone().add(new THREE.Vector3(carSpot.heading ? 0 : 1.8, 0.05, carSpot.heading ? 1.8 : 0));

  const roof = (b) => ({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, h: b.h });
  const cpAt = (name, b, spot) => ({ name, spawn: spot.clone().add(new THREE.Vector3(1.6, 0, 0)).setY(b.h + 0.05), yaw: 0, roof: roof(b) });
  const checkpoints = [
    { name: 'The start', spawn: sp.clone(), yaw: 0, roof: roof(startB) },
    cpAt('Nova\'s roof', novaB, meetingSpots.nova),
    cpAt('Mags\'s roof', magsB, meetingSpots.mags),
    cpAt('Theo\'s roof', theoB, meetingSpots.theo),
  ];
  // (spawns must be clear roof: fall back to the meeting spot itself)
  for (const cp of checkpoints.slice(1)) {
    if (w.overlaps(cp.spawn.x - 0.4, cp.spawn.y + 0.1, cp.spawn.z - 0.4, cp.spawn.x + 0.4, cp.spawn.y + 1.8, cp.spawn.z + 0.4)) cp.spawn.x -= 1.6;
  }

  return {
    ...city,
    checkpoints, clues, goalPos, meetingSpots,
    heliStart: new THREE.Vector3(sp.x - 60, 0, sp.z + 40),
    meetingCheckpoint: { nova: 1, mags: 2, theo: 3 },
  };
}
