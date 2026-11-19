import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * GLTF / GLB 替换白模。
 * 模型按常见的 Y 轴向上制作，装到父节点后绕 X 轴转 90°，才能立在本场景的 Z 轴向上坐标系里。
 * 缩放按建筑占地和高度适配，底面贴地。业务侧只调 loadFitted / 由 MapScene.replaceBuilding 调用。
 */
export class ModelLoader {
  declare loader: GLTFLoader;

  constructor() {
    this.loader = new GLTFLoader();
  }

  async loadFitted(url: string, footprint: { w: number; d: number; h: number }) {
    const gltf = await this.loader.loadAsync(url);
    return fitToFootprint(gltf.scene, footprint);
  }
}

function fitToFootprint(scene: THREE.Object3D | undefined, footprint: { w: number; d: number; h: number }) {
  if (!scene) throw new Error('模型里没有可显示的场景');
  scene.position.set(0, 0, 0);
  scene.rotation.set(0, 0, 0);
  scene.scale.set(1, 1, 1);
  scene.updateMatrixWorld(true);

  const raw = new THREE.Box3().setFromObject(scene);
  const size = raw.getSize(new THREE.Vector3());
  scene.scale.set(
    footprint.w / Math.max(size.x, 1e-3),
    footprint.h / Math.max(size.y, 1e-3),
    footprint.d / Math.max(size.z, 1e-3),
  );
  scene.updateMatrixWorld(true);

  const fitted = new THREE.Box3().setFromObject(scene);
  const center = fitted.getCenter(new THREE.Vector3());
  scene.position.set(-center.x, -fitted.min.y, -center.z);

  const holder = new THREE.Group();
  holder.name = 'gltf-holder';
  holder.rotation.x = Math.PI / 2;
  holder.add(scene);
  return holder;
}
