import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { gunzipSync } from 'fflate';

export type CrossyRoad3DGame = {
  x: number;
  row: number;
  lanes: Array<{
    row: number;
    kind: 'grass' | 'road' | 'river';
    direction: 1 | -1;
    objects: Array<{ id: string; x: number; length: number }>;
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
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
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
  // Static hosting does not expose binary upload through the repository editor, so the
  // source archive is kept as ordered, cacheable base64 fragments and rebuilt here.
  const fragments = await Promise.all(Array.from({ length: 7 }, async (_, index) => {
    const suffix = String(index).padStart(2, '0');
    const response = await fetch('/crossy3d-assets-' + suffix + '.b64', { cache: 'force-cache' });
    if (!response.ok) throw new Error('Could not load Crossy Road model archive part ' + suffix + '.');
    return (await response.text()).trim();
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

export const CrossyRoad3DView: React.FC<{ game: CrossyRoad3DGame }> = ({ game }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<THREE.Group | null>(null);
  const modelsRef = useRef<LoadedModels | null>(null);
  const objectPoolRef = useRef<Map<string, THREE.Group>>(new Map());
  const [loading, setLoading] = useState(true);
  const [modelsReady, setModelsReady] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let alive = true;
    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;
    const blobUrls: string[] = [];
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      setLoading(false);
      setLoadError('3D graphics are unavailable in this browser. Enable hardware acceleration and reload YouSound.');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor('#cfe9f6');
    renderer.domElement.className = 'absolute inset-0 h-full w-full';
    renderer.domElement.setAttribute('aria-label', 'Three-dimensional Crossy Road game board');
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#cfe9f6');
    scene.fog = new THREE.Fog('#cfe9f6', 15, 28);
    const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 80);
    camera.position.set(8.5, 11.5, -10.5);
    camera.lookAt(0, 0.45, 1.25);
    const ambient = new THREE.HemisphereLight('#ffffff', '#47634b', 2.05);
    scene.add(ambient);
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
      if (!mount || !alive) return;
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const draw = () => {
      if (!alive) return;
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);

    void loadModels(blobUrls).then((models) => {
      if (!alive) return;
      modelsRef.current = models;
      setLoadError('');
      setModelsReady(true);
      setLoading(false);
    }).catch((error: any) => {
      if (!alive) return;
      setLoadError(error?.message || 'Could not load the Crossy Road 3D models.');
      setLoading(false);
    });

    return () => {
      alive = false;
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
      for (const url of blobUrls) URL.revokeObjectURL(url);
      modelsRef.current = null;
      objectPoolRef.current.clear();
      worldRef.current = null;
    };
  }, []);

  useEffect(() => {
    const world = worldRef.current;
    const models = modelsRef.current;
    if (!world || !models || !modelsReady) return;

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
      .filter((lane) => lane.row >= game.row - 6 && lane.row <= game.row + 6)
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
        if (lane.row >= game.row - 4 && lane.row % 5 === 2) {
          place('lane:' + lane.row + ':rock', models.boulder, -5.05, 0, rel, 0.55, 0.55, 0.55);
        }
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
      } else {
        place('lane:' + lane.row + ':surface', models.river, 0, -0.015, rel, COLS / 25, 1, 1);
        lane.objects.forEach((object) => {
          place(
            'lane:' + lane.row + ':log:' + object.id,
            models.log,
            object.x + object.length / 2 - 4.5,
            0.08,
            rel,
            Math.max(1, object.length), 0.92, 0.92,
          );
        });
      }
    }

    place('player:chicken', models.chicken, game.x - 4, 0.38, 0, 1, 1, 1, Math.PI);

    // Reuse models while visible. Remove only objects that have left the camera window
    // or were removed by the gameplay simulation; no per-frame geometry/material churn.
    for (const [key, object] of objectPoolRef.current) {
      if (activeKeys.has(key)) continue;
      world.remove(object);
      objectPoolRef.current.delete(key);
    }
  }, [game, modelsReady]);

  return (
    <div ref={mountRef} className="absolute inset-0 overflow-hidden bg-[#cfe9f6]">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#cfe9f6]/75 text-xs font-bold text-[#263b2b]">
          Loading 3D models…
        </div>
      )}
      {loadError && (
        <div role="alert" className="absolute inset-x-4 bottom-4 z-20 rounded-xl border border-rose-300/60 bg-[#fffdf5]/95 p-3 text-center text-[10px] font-semibold leading-5 text-rose-800 shadow-lg">
          {loadError}
        </div>
      )}
    </div>
  );
};
