import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

export type CrossyRoad3DGame = {
  x: number;
  row: number;
  lanes: Array<{
    row: number;
    kind: 'grass' | 'road' | 'river' | 'railRoad';
    direction: 1 | -1;
    objects: Array<{ id: string; x: number; length: number; kind?: 'vehicle' | 'log' | 'lilyPad' | 'train' }>;
    trees?: number[];
    boulders?: number[];
  }>;
  score: number;
  running: boolean;
  gameOver: boolean;
};

type LoadedModels = {
  chicken: THREE.Group;
  cars: THREE.Group[];
  logs: THREE.Group[];
  trees: THREE.Group[];
  boulders: THREE.Group[];
  grassLight: THREE.Group;
  grassDark: THREE.Group;
  roadMarked: THREE.Group;
  roadBlank: THREE.Group;
  river: THREE.Group;
  lilyPad: THREE.Group;
  railroad: THREE.Group;
  trainFront: THREE.Group;
  trainMiddle: THREE.Group;
  trainBack: THREE.Group;
  trainLightInactive: THREE.Group;
  trainLightActive0: THREE.Group;
  trainLightActive1: THREE.Group;
};

const COLS = 9;
const VISIBLE_ROWS = 5;
async function loadModel(
  modelPath: string,
  texturePath: string,
  objLoader: OBJLoader,
  textureLoader: THREE.TextureLoader,
): Promise<THREE.Group> {
  const [model, texture] = await Promise.all([
    objLoader.loadAsync('/crossy-source/models/' + modelPath),
    textureLoader.loadAsync('/crossy-source/models/' + texturePath),
  ]);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
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

async function loadModels(): Promise<LoadedModels> {
  const obj = new OBJLoader();
  const textures = new THREE.TextureLoader();
  const load = (folder: string) => loadModel(folder + '/0.obj', folder + '/0.png', obj, textures);
  const [
    chicken,
    ...models
  ] = await Promise.all([
    load('characters/chicken'),
    ...[
      'vehicles/police_car',
      'vehicles/blue_car',
      'vehicles/blue_truck',
      'vehicles/green_car',
      'vehicles/orange_car',
      'vehicles/purple_car',
      'vehicles/red_truck',
      'vehicles/taxi',
      'environment/log/0',
      'environment/log/1',
      'environment/log/2',
      'environment/log/3',
      'environment/tree/0',
      'environment/tree/1',
      'environment/tree/2',
      'environment/tree/3',
      'environment/boulder/0',
      'environment/boulder/1',
      'environment/grass-light',
    ].map((folder) => {
      if (folder === 'environment/grass-light') {
        return loadModel('environment/grass/model.obj', 'environment/grass/light-grass.png', obj, textures);
      }
      return load(folder);
    }),
    loadModel('environment/grass/model.obj', 'environment/grass/dark-grass.png', obj, textures),
    loadModel('environment/road/model.obj', 'environment/road/stripes-texture.png', obj, textures),
    loadModel('environment/road/model.obj', 'environment/road/blank-texture.png', obj, textures),
    load('environment/river'),
    load('environment/lily_pad'),
    load('environment/railroad'),
    load('vehicles/train/front'),
    load('vehicles/train/middle'),
    load('vehicles/train/back'),
    load('environment/train_light/inactive'),
    load('environment/train_light/active/0'),
    load('environment/train_light/active/1'),
  ]);

  return {
    chicken,
    cars: models.slice(0, 8),
    logs: models.slice(8, 12),
    trees: models.slice(12, 16),
    boulders: models.slice(16, 18),
    grassLight: models[18],
    grassDark: models[19],
    roadMarked: models[20],
    roadBlank: models[21],
    river: models[22],
    lilyPad: models[23],
    railroad: models[24],
    trainFront: models[25],
    trainMiddle: models[26],
    trainBack: models[27],
    trainLightInactive: models[28],
    trainLightActive0: models[29],
    trainLightActive1: models[30],
  };
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function makeSourceTrain(models: LoadedModels): THREE.Group {
  const group = new THREE.Group();
  const parts = [models.trainFront, models.trainMiddle, models.trainMiddle, models.trainBack];
  let cursor = 0;
  for (const source of parts) {
    const part = cloneModel(source);
    const bounds = new THREE.Box3().setFromObject(part);
    part.position.x = cursor - bounds.min.x;
    cursor += bounds.max.x - bounds.min.x;
    group.add(part);
  }
  const bounds = new THREE.Box3().setFromObject(group);
  const center = (bounds.min.x + bounds.max.x) / 2;
  group.children.forEach((part) => { part.position.x -= center; });
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
            {isGrass && (lane.boulders || []).map((boulderX, index) => (
              <span
                key={lane.row + '-boulder-' + index}
                className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-[clamp(12px,3.1vh,26px)] drop-shadow"
                style={{ left: ((boulderX + 0.5) / COLS) * 100 + '%' }}
              >
                🪨
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
  const currentGameRowRef = useRef(game.row);
  currentGameRowRef.current = game.row;
  const playerMotionRef = useRef<{
    fromX: number; fromRow: number; toX: number; toRow: number; startedAt: number; duration: number;
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
        const progress = Math.min(1, (performance.now() - motion.startedAt) / motion.duration);
        const eased = progress * progress * (3 - 2 * progress);
        const x = motion.fromX + (motion.toX - motion.fromX) * eased;
        const row = motion.fromRow + (motion.toRow - motion.fromRow) * eased;
        const bounce = Math.sin(progress * Math.PI) * (motion.duration > 100 ? 1 : 0.04);
        chicken.position.set(x - 4, 0.38 + bounce * 0.48, row - currentGameRowRef.current);
        chicken.scale.set(1 - bounce * 0.08, 1 + bounce * 0.18, 1 - bounce * 0.08);
        if (progress >= 1) {
          chicken.position.set(motion.toX - 4, 0.38, motion.toRow - currentGameRowRef.current);
          chicken.scale.set(1, 1, 1);
          playerMotionRef.current = null;
        }
      }
      const signalPhase = Math.floor(performance.now() / 220) % 2;
      objectPoolRef.current.forEach((object, key) => {
        if (!key.includes(':signal:')) return;
        object.visible = key.endsWith(':inactive')
          ? false
          : key.endsWith(':active-a') ? signalPhase === 0 : signalPhase === 1;
      });
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);

    void loadModels().then((models) => {
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
        const sourceModels = [
          models.chicken, ...models.cars, ...models.logs, ...models.trees, ...models.boulders,
          models.grassLight, models.grassDark, models.roadMarked, models.roadBlank, models.river,
          models.lilyPad, models.railroad, models.trainFront, models.trainMiddle, models.trainBack,
          models.trainLightInactive, models.trainLightActive0, models.trainLightActive1,
        ];
        const geometries = new Set<THREE.BufferGeometry>();
        const materials = new Set<THREE.Material>();
        const textures = new Set<THREE.Texture>();
        sourceModels.forEach((model) => model.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          if (!geometries.has(child.geometry)) {
            geometries.add(child.geometry);
            child.geometry.dispose();
          }
          const list = Array.isArray(child.material) ? child.material : [child.material];
          list.forEach((material) => {
            const map = (material as THREE.MeshLambertMaterial).map;
            if (map && !textures.has(map)) {
              textures.add(map);
              map.dispose();
            }
            if (!materials.has(material)) {
              materials.add(material);
              material.dispose();
            }
          });
        }));
      }
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
        duration: previousCell.row === game.row ? 60 : 200,
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
          const tree = models.trees[hashString(lane.row + ':tree:' + index) % models.trees.length];
          const size = treeX % 2 === 0 ? 1 : 0.92;
          place('lane:' + lane.row + ':tree:' + index, tree, treeX - 4, 0.36, rel, size, size, size);
        });
        (lane.boulders || []).forEach((boulderX, index) => {
          const boulder = models.boulders[hashString(lane.row + ':boulder:' + index) % models.boulders.length];
          place('lane:' + lane.row + ':boulder:' + index, boulder, boulderX - 4, 0.31, rel, 1, 1, 1);
        });
      } else if (lane.kind === 'road') {
        place(
          'lane:' + lane.row + ':surface',
          lane.row % 2 === 0 ? models.roadMarked : models.roadBlank,
          0, -0.015, rel,
          COLS / 25, 1, 1,
        );
        lane.objects.forEach((object, index) => {
          const vehicle = models.cars[hashString(object.id) % models.cars.length];
          const vehicleBounds = new THREE.Box3().setFromObject(vehicle);
          const vehicleLength = Math.max(0.1, vehicleBounds.max.z - vehicleBounds.min.z);
          const scale = Math.max(0.42, Math.min(1.05, object.length / vehicleLength));
          place(
            'lane:' + lane.row + ':vehicle:' + object.id,
            vehicle,
            object.x + object.length / 2 - 4.5,
            0.25,
            rel,
            scale, scale, scale,
            lane.direction > 0 ? Math.PI / 2 : -Math.PI / 2,
          );
        });
      } else if (lane.kind === 'railRoad') {
        place('lane:' + lane.row + ':track', models.railroad, 0, -0.015, rel, COLS / 25, 1, 1);

        const signalX = lane.direction > 0 ? -4.48 : 4.48;
        const signalModels = [
          ['inactive', models.trainLightInactive],
          ['active-a', models.trainLightActive0],
          ['active-b', models.trainLightActive1],
        ] as const;
        signalModels.forEach(([state, source]) => {
          const key = 'lane:' + lane.row + ':signal:' + state;
          let signal = objectPoolRef.current.get(key);
          if (!signal) {
            signal = cloneModel(source);
            objectPoolRef.current.set(key, signal);
            world.add(signal);
          }
          activeKeys.add(key);
          signal.position.set(signalX, 0, rel - 0.42);
          signal.scale.set(COLS / 25, COLS / 25, COLS / 25);
          signal.rotation.y = Math.PI;
          signal.visible = state === 'inactive';
        });

        lane.objects.forEach((object) => {
          const key = 'lane:' + lane.row + ':train:' + object.id;
          let train = objectPoolRef.current.get(key);
          if (!train) {
            train = makeSourceTrain(models);
            objectPoolRef.current.set(key, train);
            world.add(train);
          }
          activeKeys.add(key);
          train.position.set(object.x + object.length / 2 - 4.5, 0, rel + 0.1);
          const factor = COLS / 25;
          train.scale.set(lane.direction > 0 ? factor : -factor, factor, factor);
        });
      } else {
        place('lane:' + lane.row + ':surface', models.river, 0, -0.015, rel, COLS / 25, 1, 1);
        lane.objects.forEach((object) => {
          if (object.kind === 'lilyPad') {
            const key = 'lane:' + lane.row + ':lily:' + object.id;
            let lily = objectPoolRef.current.get(key);
            if (!lily) {
              lily = cloneModel(models.lilyPad);
              objectPoolRef.current.set(key, lily);
              world.add(lily);
            }
            activeKeys.add(key);
            lily.position.set(object.x + object.length / 2 - 4.5, 0.02, rel);
          } else {
            place(
              'lane:' + lane.row + ':log:' + object.id,
              models.logs[hashString(object.id) % models.logs.length],
              object.x + object.length / 2 - 4.5,
              0.08,
              rel,
              Math.max(0.55, object.length / 2.2), 1, 1,
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
