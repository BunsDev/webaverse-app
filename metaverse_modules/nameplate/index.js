import * as THREE from 'three';
import metaversefile from 'metaversefile';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {getModelGeoMat} from './model';
import {Matrix4} from 'three';

const {useApp, useCamera, useLocalPlayer, useMaterials, useFrame, useText} =
  metaversefile;

const Text = useText();
const gltfLoader = new GLTFLoader();
let nameplateMesh = null;

async function createNameplateMesh() {
  if (nameplateMesh) return;
  const nameplateModelUrl = '/assets/nameplate.glb';
  const nameplateModel = await new Promise((resolve, reject) => {
    gltfLoader.load(nameplateModelUrl, resolve, () => {}, reject);
  });
  const {geometry, material} = getModelGeoMat(nameplateModel);
  nameplateMesh = new THREE.InstancedMesh(geometry, material, 1000);
}

const createNameplateInstance = () => {
  if (!nameplateMesh) return 0;
  if (!nameplateMesh.instanceIndex) nameplateMesh.instanceIndex = 0;
  return nameplateMesh.instanceIndex++;
};

async function getTextMesh(
  text = '',
  font = './fonts/Plaza Regular.ttf',
  fontSize = 0.75,
  anchorX = 'left',
  anchorY = 'middle',
  color = 0x000000,
) {
  const textMesh = new Text();
  textMesh.text = text;
  textMesh.font = font;
  textMesh.fontSize = fontSize;
  textMesh.color = color;
  textMesh.anchorX = anchorX;
  textMesh.anchorY = anchorY;
  textMesh.frustumCulled = false;
  await new Promise(resolve => {
    textMesh.sync(resolve);
  });
  return textMesh;
}

export default () => {
  const app = useApp();
  const localPlayer = useLocalPlayer();
  // if (app.player === localPlayer) return app;
  const camera = useCamera();
  let textGroup = null;
  const lastPlateToCamera = new THREE.Vector3();
  let instIndex = -1;
  let plateToCameraAngle = 0;

  (async () => {
    if (!nameplateMesh) {
      await createNameplateMesh();
      app.add(nameplateMesh);
    }
    instIndex = createNameplateInstance();
    const font = './fonts/GeosansLight.ttf';
    const fontSize = 0.2;
    const anchorX = 'center';
    const anchorY = 'top';
    const color = 0xffffff;
    const textMesh = await getTextMesh(
      app.player.name,
      font,
      fontSize,
      anchorX,
      anchorY,
      color,
    );
    textMesh.position.set(0, 0, 0.001);
    textMesh.updateMatrixWorld(true);
    textGroup = new THREE.Group();
    textGroup.add(textMesh);
    app.add(textGroup);
  })();

  useFrame(() => {
    if (!app.player || instIndex < 0 || !textGroup) return;
    const nameplateMatrix = new THREE.Matrix4();
    nameplateMesh.getMatrixAt(instIndex, nameplateMatrix);
    const plateToCamera = new THREE.Vector3().subVectors(
      camera.position,
      new THREE.Vector3().setFromMatrixPosition(nameplateMatrix),
    );
    if (!lastPlateToCamera.equals(plateToCamera)) {
      plateToCameraAngle = Math.atan2(plateToCamera.x, plateToCamera.z);
      lastPlateToCamera.copy(plateToCamera);
    }
    nameplateMatrix.copy(
      new Matrix4()
        .multiplyMatrices(
          new Matrix4().makeScale(30, 30, 30),
          new Matrix4().makeRotationY(plateToCameraAngle),
        )
        .setPosition(
          app.player.position.x,
          app.player.position.y + 0.4,
          app.player.position.z,
        ),
    );
    nameplateMesh.setMatrixAt(instIndex, nameplateMatrix);
    nameplateMesh.instanceMatrix.needsUpdate = true;
    textGroup.position.set(
      app.player.position.x,
      app.player.position.y + 0.52,
      app.player.position.z,
    );
    textGroup.rotation.y = plateToCameraAngle;
    textGroup.updateMatrixWorld(true);
    app.updateMatrixWorld(true);
  });

  return app;
};