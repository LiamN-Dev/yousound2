import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { gunzipSync } from 'fflate';

export type CrossyRoad3DGame = {
  x: number;
  row: number;
  lanes: Array<{
    row: number;
    kind: 'grass' | 'road' | 'river' | 'railRoad';
    direction: 1 | -1;
    objects: Array<{ id: string; x: number; length: number; kind?: 'vehicle' | 'log' | 'lilyPad' | 'train' }>;
    trees?: number[];
  }>;
  score: number;
  running: boolean;
  gameOver: boolean;
};

type LoadedModels = {
  chicken: THREE.Group;
  blueCar: THREE.Group;
  redTruck: THREE.Group;
  log: THREE.Group;
  tree: THREE.Group;
  boulder: THREE.Group;
  grassLight: THREE.Group;
  grassDark: THREE.Group;
  roadMarked: THREE.Group;
  roadBlank: THREE.Group;
  river: THREE.Group;
};

const COLS = 9;
const VISIBLE_ROWS = 5;
const decoder = new TextDecoder();

function untarGzip(bytes: Uint8Array): Map<string, Uint8Array> {
  const tar = gunzipSync(bytes);
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const name = decoder.decode(header.subarray(0, 100)).split('\0')[0];
    const prefix = decoder.decode(header.subarray(345, 500)).split('\0')[0];
    const fullName = prefix ? prefix + '/' + name : name;
    const sizeText = decoder.decode(header.subarray(124, 136)).replace(/\0/g, '').trim();
    const size = Number.parseInt(sizeText || '0', 8);
    if (!Number.isFinite(size) || size < 0 || offset + 512 + size > tar.length) {
      throw new Error('The Crossy Road model archive is damaged.');
    }
    if (name) files.set(fullName, tar.slice(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

function loadTexture(
  loader: THREE.TextureLoader,
  blobUrls: string[],
  bytes: Uint8Array,
): Promise<THREE.Texture> {
  const imageBytes = new Uint8Array(bytes.byteLength);
  imageBytes.set(bytes);
  const url = URL.createObjectURL(new Blob([imageBytes.buffer], { type: 'image/png' }));
  blobUrls.push(url);
  return new Promise((resolve, reject) => {
    loader.load(url, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      resolve(texture);
    }, undefined, reject);
  });
}

async function loadModel(
  files: Map<string, Uint8Array>,
  objPath: string,
  pngPath: string,
  objLoader: OBJLoader,
  textureLoader: THREE.TextureLoader,
  blobUrls: string[],
): Promise<THREE.Group> {
  const objBytes = files.get(objPath);
  const textureBytes = files.get(pngPath);
  if (!objBytes || !textureBytes) throw new Error('A Crossy Road model is missing: ' + objPath);
  const [model, texture] = await Promise.all([
    Promise.resolve().then(() => objLoader.parse(decoder.decode(objBytes))),
    loadTexture(textureLoader, blobUrls, textureBytes),
  ]);
  const material = new THREE.MeshLambertMaterial({ map: texture });
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.material = material;
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return model;
}

async function loadModels(blobUrls: string[]): Promise<LoadedModels> {
  const fragments = await Promise.all(Array.from({ length: 7 }, async (_, index) => {
    const suffix = String(index).padStart(2, '0');
    const response = await fetch('/crossy3d-assets-' + suffix + '.b64', { cache: 'force-cache' });
    if (!response.ok) throw new Error('Could not load Crossy Road model archive part ' + suffix + '.');
    const fragment = (await response.text()).trim();
    if (!fragment || !/^[A-Za-z0-9+/]+={0,2}$/.test(fragment)) {
      throw new Error('Crossy Road model archive part ' + suffix + ' is empty or invalid.');
    }
    return fragment;
  }));

  const binary = atob(fragments.join(''));
  const compressed = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) compressed[index] = binary.charCodeAt(index);
  const files = untarGzip(compressed);
  const obj = new OBJLoader();
  const texture = new THREE.TextureLoader();
  const models = await Promise.all([
    loadModel(files, 'models/characters/chicken/0.obj', 'models/characters/chicken/0.png', obj, texture, blobUrls),
    loadModel(files, 'models/vehicles/blue_car/0.obj', 'models/vehicles/blue_car/0.png', obj, texture, blobUrls),
    loadModel(files, 'models/vehicles/red_truck/0.obj', 'models/vehicles/red_truck/0.png', obj, texture, blobUrls),
    loadModel(files, 'models/environment/log/0/0.obj', 'models/environment/log/0/0.png', obj, texture, blobUrls),
    loadModel(files, 'models/environment/tree/0/0.obj', 'models/environment/tree/0/0.png', obj, texture, blobUrls),
    loadModel(files, 'models/environment/boulder/0/0.obj', 'models/environment/boulder/0/0.png', obj, texture, blobUrls),
    loadModel(files, 'models/environment/grass/model.obj', 'models/environment/grass/light-grass.png', obj, texture, blobUrls),
    loadModel(files, 'models/environment/grass/model.obj', 'models/environment/grass/dark-grass.png', obj, texture, blobUrls),
    loadModel(files, 'models/environment/road/model.obj', 'models/environment/road/stripes-texture.png', obj, texture, blobUrls),
    loadModel(files, 'models/environment/road/model.obj', 'models/environment/road/blank-texture.png', obj, texture, blobUrls),
    loadModel(files, 'models/environment/river/0.obj', 'models/environment/river/0.png', obj, texture, blobUrls),
  ]);

  return {
    chicken: models[0],
    blueCar: models[1],
    redTruck: models[2],
    log: models[3],
    tree: models[4],
    boulder: models[5],
    grassLight: models[6],
    grassDark: models[7],
    roadMarked: models[8],
    roadBlank: models[9],
    river: models[10],
  };
}

function makeRailroadTrack(): THREE.Group {
  const group = new THREE.Group();
  const railMaterial = new THREE.MeshStandardMaterial({ color: '#858d91', metalness: 0.72, roughness: 0.34 });
  const sleeperMaterial = new THREE.MeshStandardMaterial({ color: '#765238', roughness: 0.95 });
  for (const z of [-0.36, 0.36]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.12, 0.09), railMaterial);
    rail.position.set(0, 0.12, z);
    rail.castShadow = true;
    group.add(rail);
  }
  for (let index = 0; index < 22; index += 1) {
    const sleeper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 1.05), sleeperMaterial);
    sleeper.position.set(-4.45 + index * 0.42, 0.05, 0);
    group.add(sleeper);
  }
  group.userData.crossyGenerated = true;
  return group;
}

function makeTrain(): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: '#c94736', roughness: 0.7 });
  const cabin = new THREE.MeshStandardMaterial({ color: '#e8eee7', roughness: 0.45 });
  const windowMaterial = new THREE.MeshStandardMaterial({ color: '#79b9ce', metalness: 0.18, roughness: 0.24 });
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: '#20272a', roughness: 0.9 });
  const addCar = (center: number, width: number, engine = false) => {
    const base = new THREE.Mesh(new THREE.BoxGeometry(width, 0.42, 0.78), body);
    base.position.set(center, 0.42, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    const top = new THREE.Mesh(new THREE.BoxGeometry(engine ? 1.15 : width * 0.78, 0.38, 0.64), engine ? body : cabin);
    top.position.set(center + (engine ? 0.05 : 0), 0.79, 0);
    top.castShadow = true;
    group.add(top);
    const window = new THREE.Mesh(new THREE.BoxGeometry(engine ? 0.48 : width * 0.42, 0.18, 0.66), windowMaterial);
    window.position.set(center + (engine ? 0.28 : 0), 0.86, 0);
    group.add(window);
    for (const wheelX of [center - width * 0.32, center + width * 0.32]) {
      for (const z of [-0.4, 0.4]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 8), wheelMaterial);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(wheelX, 0.17, z);
        group.add(wheel);
      }
    }
  };
  addCar(1.8, 2.0, true);
  addCar(-0.2, 1.9);
  addCar(-2.1, 1.9);
  group.userData.crossyGenerated = true;
  return group;
}

function makeLilyPad(): THREE.Group {
  const group = new THREE.Group();
  const green = new THREE.MeshStandardMaterial({ color: '#4f9a53', roughness: 0.88 });
  const center = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.40, 0.09, 10), green);
  center.position.y = 0.08;
  center.castShadow = true;
  group.add(center);
  const flower = new THREE.Mesh(new THREE.SphereGeometry(0.085, 7, 5), new THREE.MeshStandardMaterial({ color: '#f6e7a6', roughness: 0.8 }));
  flower.position.set(0.16, 0.14, -0.12);
  group.add(flower);
  group.userData.crossyGenerated = true;
  return group;
}

function makeRailSignal(): THREE.Group {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.95, 6), new THREE.MeshStandardMaterial({ color: '#555b5d' }));
  pole.position.y = 0.47;
  group.add(pole);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 0.18), new THREE.MeshStandardMaterial({ color: '#292f31' }));
  housing.position.set(0, 0.9, 0);
  group.add(housing);
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshStandardMaterial({ color: '#f23e32', emissive: '#7d0805' }));
  red.position.set(0, 1.0, 0.105);
  red.name = 'warning-lamp';
  group.add(red);
  group.userData.crossyGenerated = true;
  return group;
}

function cloneModel(source: THREE.Group): THREE.Group {
  const clone = source.clone(true);
  clone.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return clone;
}

function disposeGeneratedGroup(group: THREE.Group): void {
  if (!group.userData.crossyGenerated) return;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      geometries.add(child.geometry);
      const list = Array.isArray(child.material) ? child.material : [child.material];
      list.forEach((material) => materials.add(material));
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function CrossyRoadFallback({ game }: { game: CrossyRoad3DGame }) {
  const lanes = game.lanes
    .filter((lane) => lane.row >= game.row - VISIBLE_ROWS && lane.row <= game.row + VISIBLE_ROWS)
    .sort((a, b) => b.row - a.row);

  return (
    <div className="absolute inset-0 z-0 flex flex-col overflow-hidden bg-[#6da74b]" aria-label="Crossy Road game board">
      {lanes.map((lane) => {
        const isGrass = lane.kind === 'grass';
        const isRoad = lane.kind === 'road';
        const isRailRoad = lane.kind === 'railRoad';
        return (
          <div
            key={lane.row}
            className={
              'relative min-h-0 flex-1 overflow-hidden border-b border-black/10 ' +
              (isGrass ? 'bg-[#6da74b]' : isRoad ? 'bg-[#303b3e]' : isRailRoad ? 'bg-[#66564a]' : 'bg-[#438eae]')
            }
            style={{
              backgroundImage: isGrass
                ? 'repeating-linear-gradient(90deg, rgba(255,255,255,.08) 0 18px, transparent 18px 36px)'
                : isRoad
                  ? 'repeating-linear-gradient(90deg, transparent 0 42px, rgba(255,255,255,.04) 42px 44px)'
                  : isRailRoad
                    ? 'linear-gradient(0deg, transparent 36%, rgba(210,210,190,.8) 37% 43%, transparent 44% 56%, rgba(210,210,190,.8) 57% 63%, transparent 64%)'
                    : 'repeating-linear-gradient(90deg, rgba(255,255,255,.10) 0 24px, transparent 24px 48px)',
            }}
          >
            {(isRoad || isRailRoad) && (
              <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t-2 border-dashed border-white/35" />
            )}
            {!isGrass && !isRoad && (
              <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-white/20" />
            )}
            {isGrass && (lane.trees || []).map((treeX, index) => (
              <span
                key={lane.row + '-tree-' + index}
                className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-[clamp(12px,3.3vh,28px)] drop-shadow"
                style={{ left: ((treeX + 0.5) / COLS) * 100 + '%' }}
              >
                🌲
              </span>
            ))}
            {!isGrass && lane.objects.map((object, index) => (
              <div
                key={object.id}
                className={
                  'absolute top-1/2 z-10 flex -translate-y-1/2 items-center justify-center overflow-hidden rounded-lg text-[clamp(11px,2.7vh,24px)] ' +
                  (isRoad || isRailRoad
                    ? 'h-[72%] border border-black/25 bg-[#e8e8e4] shadow-md'
                    : object.kind === 'lilyPad'
                      ? 'h-[48%] border border-[#286c40] bg-[#4f9a53] shadow-md'
                      : 'h-[56%] border border-[#5b3a26] bg-[#98633d] shadow-md')
                }
                style={{
                  left: (object.x / COLS) * 100 + '%',
                  width: Math.max(3, (object.length / COLS) * 100) + '%',
                }}
              >
                {isRailRoad ? '🚆' : isRoad ? (index % 2 === 0 ? '🚙' : '🚚') : object.kind === 'lilyPad' ? '🍃' : '🪵'}
              </div>
            ))}
            {lane.row === game.row && (
              <span
                className="absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 text-[clamp(18px,4.2vh,34px)] drop-shadow-[0_3px_2px_rgba(0,0,0,.35)]"
                style={{ left: ((game.x + 0.5) / COLS) * 100 + '%' }}
                aria-label="Player"
              >
                🐔
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const CrossyRoad3DView: React.FC<{ game: CrossyRoad3DGame }> = ({ game }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<THREE.Group | null>(null);
  const modelsRef = useRef<LoadedModels | null>(null);
  const objectPoolRef = useRef<Map<string, THREE.Group>>(new Map());
  const lastPlayerCellRef = useRef({ x: game.x, row: game.row });
  const playerMotionRef = useRef<{
    fromX: number; fromRow: number; toX: number; toRow: number; startedAt: number;
  } | null>(null);
  const [modelsReady, setModelsReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let alive = true;
    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;
    const blobUrls: string[] = [];
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      setLoading(false);
      setLoadError('3D graphics are unavailable. The game has switched to its built-in 2D board.');
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor('#cfe9f6');
    renderer.domElement.className = 'pointer-events-none absolute inset-0 z-10 h-full w-full';
    renderer.domElement.style.opacity = '0';
    renderer.domElement.style.transition = 'opacity 180ms ease';
    renderer.domElement.setAttribute('aria-label', 'Three-dimensional Crossy Road game board');
    mount.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color('#cfe9f6');
    scene.fog = new THREE.Fog('#cfe9f6', 15, 28);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 90);
    camera.position.set(7.2, 12.4, -13.2);
    camera.lookAt(0, 0.45, 0.8);

    scene.add(new THREE.HemisphereLight('#ffffff', '#47634b', 2.05));
    const sunlight = new THREE.DirectionalLight('#fff3d5', 3.1);
    sunlight.position.set(-5, 13, -2);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(1024, 1024);
    sunlight.shadow.camera.left = -10;
    sunlight.shadow.camera.right = 10;
    sunlight.shadow.camera.top = 12;
    sunlight.shadow.camera.bottom = -12;
    sunlight.shadow.bias = -0.0002;
    scene.add(sunlight);

    const world = new THREE.Group();
    scene.add(world);
    worldRef.current = world;

    const resize = () => {
      if (!mount || !alive || !renderer) return;
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(mount);
    } else {
      window.addEventListener('resize', resize);
    }
    resize();

    const draw = () => {
      if (!alive || !renderer || !scene) return;
      const motion = playerMotionRef.current;
      const chicken = objectPoolRef.current.get('player:chicken');
      if (motion && chicken) {
        const progress = Math.min(1, (performance.now() - motion.startedAt) / 200);
        const eased = progress * progress * (3 - 2 * progress);
        const x = motion.fromX + (motion.toX - motion.fromX) * eased;
        const row = motion.fromRow + (motion.toRow - motion.fromRow) * eased;
        chicken.position.set(x - 4, 0.38 + Math.sin(progress * Math.PI) * 0.48, row - game.row);
        const bounce = Math.sin(progress * Math.PI);
        chicken.scale.set(1 - bounce * 0.08, 1 + bounce * 0.18, 1 - bounce * 0.08);
        if (progress >= 1) {
          chicken.position.set(motion.toX - 4, 0.38, motion.toRow - game.row);
          chicken.scale.set(1, 1, 1);
          playerMotionRef.current = null;
        }
      }
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);

    void loadModels(blobUrls).then((models) => {
      if (!alive) return;
      modelsRef.current = models;
      renderer!.domElement.style.opacity = '1';
      setLoadError('');
      setModelsReady(true);
      setLoading(false);
    }).catch((error: unknown) => {
      if (!alive) return;
      const reason = error instanceof Error ? error.message : 'Unknown model-loading error.';
      setLoadError(reason + ' The playable 2D board is still active.');
      setLoading(false);
    });

    return () => {
      alive = false;
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      renderer?.dispose();
      renderer?.domElement.remove();

      objectPoolRef.current.forEach(disposeGeneratedGroup);
      const models = modelsRef.current;
      if (models) {
        Object.values(models).forEach((model) => {
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((material) => {
                const map = (material as THREE.MeshLambertMaterial).map;
                map?.dispose();
                material.dispose();
              });
            }
          });
        });
      }
      for (const url of blobUrls) URL.revokeObjectURL(url);
      modelsRef.current = null;
      objectPoolRef.current.clear();
      playerMotionRef.current = null;
      worldRef.current = null;
    };
  }, []);

  useEffect(() => {
    const world = worldRef.current;
    const models = modelsRef.current;
    if (!world || !models || !modelsReady) return;

    const previousCell = lastPlayerCellRef.current;
    if (previousCell.x !== game.x || previousCell.row !== game.row) {
      playerMotionRef.current = {
        fromX: previousCell.x,
        fromRow: previousCell.row,
        toX: game.x,
        toRow: game.row,
        startedAt: performance.now(),
      };
      lastPlayerCellRef.current = { x: game.x, row: game.row };
    }

    const activeKeys = new Set<string>();
    const place = (
      key: string,
      source: THREE.Group,
      x: number,
      y: number,
      z: number,
      scaleX = 1,
      scaleY = 1,
      scaleZ = 1,
      rotationY = 0,
    ) => {
      let object = objectPoolRef.current.get(key);
      if (!object) {
        object = cloneModel(source);
        objectPoolRef.current.set(key, object);
        world.add(object);
      }
      activeKeys.add(key);
      object.visible = true;
      object.position.set(x, y, z);
      object.scale.set(scaleX, scaleY, scaleZ);
      object.rotation.set(0, rotationY, 0);
    };

    const visible = game.lanes
      .filter((lane) => lane.row >= game.row - VISIBLE_ROWS && lane.row <= game.row + VISIBLE_ROWS)
      .sort((a, b) => a.row - b.row);

    for (const lane of visible) {
      const rel = lane.row - game.row;
      if (lane.kind === 'grass') {
        place(
          'lane:' + lane.row + ':surface',
          lane.row % 2 === 0 ? models.grassLight : models.grassDark,
          0, -0.015, rel,
          COLS / 25, 1, 1,
        );
        (lane.trees || []).forEach((treeX, index) => {
          const size = treeX % 2 === 0 ? 1 : 0.92;
          place('lane:' + lane.row + ':tree:' + index, models.tree, treeX - 4, 0.36, rel, size, size, size);
        });
      } else if (lane.kind === 'road') {
        place(
          'lane:' + lane.row + ':surface',
          lane.row % 2 === 0 ? models.roadMarked : models.roadBlank,
          0, -0.015, rel,
          COLS / 25, 1, 1,
        );
        lane.objects.forEach((object, index) => {
          const isCar = index % 2 === 0;
          const scale = isCar ? 0.9 : 0.48;
          place(
            'lane:' + lane.row + ':vehicle:' + object.id,
            isCar ? models.blueCar : models.redTruck,
            object.x + object.length / 2 - 4.5,
            0.26,
            rel,
            scale, scale, scale,
            lane.direction > 0 ? Math.PI / 2 : -Math.PI / 2,
          );
        });
      } else if (lane.kind === 'railRoad') {
        let track = objectPoolRef.current.get('lane:' + lane.row + ':track');
        if (!track) {
          track = makeRailroadTrack();
          objectPoolRef.current.set('lane:' + lane.row + ':track', track);
          world.add(track);
        }
        activeKeys.add('lane:' + lane.row + ':track');
        track.position.set(0, 0, rel);

        let signal = objectPoolRef.current.get('lane:' + lane.row + ':signal');
        if (!signal) {
          signal = makeRailSignal();
          objectPoolRef.current.set('lane:' + lane.row + ':signal', signal);
          world.add(signal);
        }
        activeKeys.add('lane:' + lane.row + ':signal');
        signal.position.set(lane.direction > 0 ? -4.65 : 4.65, 0, rel);
        const lamp = signal.getObjectByName('warning-lamp') as THREE.Mesh | undefined;
        if (lamp && lamp.material instanceof THREE.MeshStandardMaterial) {
          const flashing = Math.floor(Date.now() / 260) % 2 === 0;
          lamp.material.emissiveIntensity = flashing ? 1.8 : 0.18;
        }

        lane.objects.forEach((object) => {
          const key = 'lane:' + lane.row + ':train:' + object.id;
          let train = objectPoolRef.current.get(key);
          if (!train) {
            train = makeTrain();
            objectPoolRef.current.set(key, train);
            world.add(train);
          }
          activeKeys.add(key);
          train.position.set(object.x + object.length / 2 - 4.5, 0, rel);
          train.scale.x = lane.direction > 0 ? 1 : -1;
        });
      } else {
        place('lane:' + lane.row + ':surface', models.river, 0, -0.015, rel, COLS / 25, 1, 1);
        lane.objects.forEach((object) => {
          if (object.kind === 'lilyPad') {
            const key = 'lane:' + lane.row + ':lily:' + object.id;
            let lily = objectPoolRef.current.get(key);
            if (!lily) {
              lily = makeLilyPad();
              objectPoolRef.current.set(key, lily);
              world.add(lily);
            }
            activeKeys.add(key);
            lily.position.set(object.x + object.length / 2 - 4.5, 0, rel);
          } else {
            place(
              'lane:' + lane.row + ':log:' + object.id,
              models.log,
              object.x + object.length / 2 - 4.5,
              0.08,
              rel,
              Math.max(1, object.length), 0.92, 0.92,
            );
          }
        });
      }
    }

    place('player:chicken', models.chicken, game.x - 4, 0.38, 0, 1, 1, 1, Math.PI);

    for (const [key, object] of objectPoolRef.current) {
      if (activeKeys.has(key)) continue;
      world.remove(object);
      disposeGeneratedGroup(object);
      objectPoolRef.current.delete(key);
    }
  }, [game, modelsReady]);

  return (
    <div ref={mountRef} className="relative h-full w-full overflow-hidden bg-[#cfe9f6]">
      {!modelsReady && <CrossyRoadFallback game={game} />}
      {loading && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/70 bg-white/85 px-3 py-1.5 text-[9px] font-bold text-[#263b2b] shadow">
          Loading 3D models · game ready
        </div>
      )}
      {loadError && (
        <div role="alert" className="absolute inset-x-2 bottom-2 z-30 rounded-xl border border-rose-300/60 bg-[#fffdf5]/95 p-2 text-center text-[9px] font-semibold leading-4 text-rose-800 shadow-lg">
          {loadError}
        </div>
      )}
    </div>
  );
};
