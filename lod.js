import * as THREE from 'three';
import {scene, camera} from './renderer.js';
import {defaultChunkSize} from './constants.js';
import {abortError} from './lock-manager.js';
import {makePromise} from './util.js';

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localVector3 = new THREE.Vector3();
// const localVector4 = new THREE.Vector3();
// const localVector5 = new THREE.Vector3();
// const localQuaternion = new THREE.Quaternion();
// const localMatrix = new THREE.Matrix4();

// const onesLodsArray = new Array(8).fill(1);

const nop = () => {};

class OctreeNode extends EventTarget {
  constructor(min, lod, isLeaf) {
    super();
    
    this.min = min;
    this.lod = lod;
    this.isLeaf = isLeaf;
    this.lodArray = Array(8).fill(-1);

    this.children = Array(8).fill(null);
  }
  containsPoint(p) {
    return p.x >= this.min.x && p.x < this.min.x + this.lod &&
      p.y >= this.min.y && p.y < this.min.y + this.lod &&
      p.z >= this.min.z && p.z < this.min.z + this.lod;
  }
  containsNode(node) {
    return this.containsPoint(node.min);
  }
  equalsNode(p) {
    return p.min.x === this.min.x && p.min.y === this.min.y && p.min.z === this.min.z &&
      p.lodArray.every((lod, i) => lod === this.lodArray[i]);
  }
  intersectsNode(p) {
    return this.containsNode(p) || p.containsNode(this);
  }
  destroy() {
    this.dispatchEvent(new MessageEvent('destroy'));
  }
}
/* const tempUint32Array = new Uint32Array(1);
const _toUint32 = value => {
  tempUint32Array[0] = value;
  return tempUint32Array[0];
} */
const _octreeNodeMinHash = (min, lod) => `${min.x},${min.y},${min.z}:${lod}`;
const _getLeafNodeFromPoint = (leafNodes, p) => leafNodes.find(node => node.containsPoint(p));
const constructOctreeForLeaf = (position, lod1Range, maxLod) => {
  const nodeMap = new Map();
  
  const _getNode = (min, lod) => {
    const hash = _octreeNodeMinHash(min, lod);
    return nodeMap.get(hash);
  };
  const _createNode = (min, lod, isLeaf = lod === 1) => {
    const node = new OctreeNode(min, lod, isLeaf);
    const hash = _octreeNodeMinHash(min, lod);
    if (nodeMap.has(hash)) {
      throw new Error(`Node already exists: ${hash}`);
    }
    nodeMap.set(hash, node);
    return node;
  };
  const _getOrCreateNode = (min, lod) => _getNode(min, lod) ?? _createNode(min, lod);
  const _ensureChildren = parentNode => {
    const lodMin = parentNode.min;
    const lod = parentNode.lod;
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dz = 0; dz < 2; dz++) {
           const childIndex = dx + 2 * (dy + 2 * dz);
           if (parentNode.children[childIndex] === null) {
              parentNode.children[childIndex] = _createNode(
                lodMin.clone().add(
                  new THREE.Vector3(dx, dy, dz).multiplyScalar(lod / 2)
                ),
                lod / 2,
                true
              );
              parentNode.children[childIndex].parent = parentNode;
           }
        }
      }
    }
  };
  const _constructTreeUpwards = leafPosition => {
    let rootNode = _getOrCreateNode(leafPosition, 1);
    for (let lod = 2; lod <= maxLod; lod *= 2) {
      const lodMin = rootNode.min.clone();
      lodMin.x = Math.floor(lodMin.x / lod) * lod;
      lodMin.y = Math.floor(lodMin.y / lod) * lod;
      lodMin.z = Math.floor(lodMin.z / lod) * lod;

      const lodCenter = lodMin.clone().addScalar(lod / 2);
      const childIndex = (rootNode.min.x < lodCenter.x ? 0 : 1) +
        (rootNode.min.y < lodCenter.y ? 0 : 2) +
        (rootNode.min.z < lodCenter.z ? 0 : 4);

      const parentNode = _getOrCreateNode(lodMin, lod);
      parentNode.isLeaf = false;
      if (parentNode.children[childIndex] === null) { // children not set yet
        parentNode.children[childIndex] = rootNode;
        _ensureChildren(parentNode);
      }
      rootNode = parentNode;
    }
    return rootNode;
  };

  // sample base leaf nodes to generate octree upwards
  const rangeMin = position.clone()
    .sub(new THREE.Vector3(lod1Range, lod1Range, lod1Range));
  const rangeMax = position.clone()
    .add(new THREE.Vector3(lod1Range, lod1Range, lod1Range));
  for (let dx = rangeMin.x; dx <= rangeMax.x; dx++) {
    for (let dy = rangeMin.y; dy <= rangeMax.y; dy++) {
      for (let dz = rangeMin.z; dz <= rangeMax.z; dz++) {
        const leafPosition = new THREE.Vector3(dx, dy, dz);
        leafPosition.x = Math.floor(leafPosition.x);
        leafPosition.y = Math.floor(leafPosition.y);
        leafPosition.z = Math.floor(leafPosition.z);
        _constructTreeUpwards(leafPosition);
      }
    }
  }

  /* // fill in missing children that are in the lod1Range
  const _ensureChildrenDownToLod1 = node => {
    const lodMin = node.min;
    const lod = node.lod;
    if (lod === 1) {
      return;
    }
    node.isLeaf = false;
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dz = 0; dz < 2; dz++) {
            const childIndex = dx + 2 * (dy + 2 * dz);
            if (node.children[childIndex] === null) {
              const childNode = _createNode(
                lodMin.clone().add(
                  new THREE.Vector3(dx, dy, dz).multiplyScalar(lod / 2)
                ),
                lod / 2,
                true
              );
              node.children[childIndex] = childNode;
              _ensureChildrenDownToLod1(childNode);
            }
        }
      }
    }
  };
  for (let node of nodeMap.values()) {
    if (
      node.min.x >= rangeMin.x && node.min.x < rangeMax.x &&
      node.min.y >= rangeMin.y && node.min.y < rangeMax.y &&
      node.min.z >= rangeMin.z && node.min.z < rangeMax.z
    ) {
      _ensureChildrenDownToLod1(node);
    }
  } */

  const rootNodes = [];
  for (const node of nodeMap.values()) {
    if (node.lod === maxLod) {
      rootNodes.push(node);
    }
  }

  const lod1Nodes = [];
  for (const node of nodeMap.values()) {
    if (node.lod === 1) {
      lod1Nodes.push(node);
    }
  }

  // sanity check lod1Nodes for duplicates
  {
    const lod1NodeMap = new Map();
    for (const node of lod1Nodes) {
      const hash = _octreeNodeMinHash(node.min, node.lod);
      if (lod1NodeMap.has(hash)) {
        throw new Error(`Duplicate lod1 node: ${hash}`);
      }
      lod1NodeMap.set(hash, node);
    }
  }

  const leafNodes = [];
  for (const node of nodeMap.values()) {
    if (node.isLeaf) {
      leafNodes.push(node);
    }
  }

  // sanity check that no leaf node contains another leaf node
  for (const leafNode of leafNodes) {
    for (const childNode of leafNode.children) {
      if (childNode?.isLeaf) {
        throw new Error(`Leaf node contains another leaf node 1: ${leafNode.min.toArray().join(',')}`);
      }
    }
    for (const leafNode2 of leafNodes) {
      if (leafNode !== leafNode2 && leafNode.containsNode(leafNode2)) {
        throw new Error(`Leaf node contains another leaf node 2: ${leafNode.min.toArray().join(',')}`);
      }
    }
  }

  // assign lodArray for each node based on the minimum lod of the target point in the world
  // vm::ivec3(0, 0, 0),
  // vm::ivec3(1, 0, 0),
  // vm::ivec3(0, 0, 1),
  // vm::ivec3(1, 0, 1),
  // vm::ivec3(0, 1, 0),
  // vm::ivec3(1, 1, 0),
  // vm::ivec3(0, 1, 1),
  // vm::ivec3(1, 1, 1),
  for (const node of nodeMap.values()) {
    node.lodArray = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(1, 0, 1),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(1, 1, 0),
      new THREE.Vector3(0, 1, 1),
      new THREE.Vector3(1, 1, 1),
    ].map(offset => {
      const containingLeafNode = _getLeafNodeFromPoint(leafNodes, node.min.clone().add(offset.clone().multiplyScalar(node.lod)));
      if (containingLeafNode) {
        return containingLeafNode.lod;
      } else {
        return node.lod;
      }
    });
  }

  return leafNodes;
  /* return {
    rootNodes,
    lod1Nodes,
    leafNodes,
    remapNodes(nodes) {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const hash = _octreeNodeMinHash(node.min, node.lod);
        const otherNode = nodeMap.get(hash);
        if (otherNode) {
          nodes[i] = otherNode;
        }
      }
    },
    getOutrangedNodes(nodes) {
      const remainderNodes = [];
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const hash = _octreeNodeMinHash(node.min, node.lod);
        const otherNode = nodeMap.get(hash);
        if (!otherNode) {
          remainderNodes.push(node);
        }
      }
      return remainderNodes;
    },
  }; */
};
class Task extends EventTarget {
  constructor(maxLodNode) {
    super();

    this.maxLodNode = maxLodNode;
    
    this.newNodes = [];
    this.oldNodes = [];

    this.abortController = new AbortController();
    this.signal = this.abortController.signal;
  }
  equals(t) {
    return this.newNodes.length === this.oldNodes.length && this.newNodes.every(node => {
      return t.newNodes.some(node2 => node.equalsNode(node2));
    }) && this.oldNodes.every(node => {
      return t.oldNodes.some(node2 => node.equalsNode(node2));
    });
  }
  cancel() {
    this.abortController.abort(abortError);
  }
  isNop() {
    const task = this;
    return task.newNodes.length === task.oldNodes.length && task.newNodes.every(newNode => {
      return task.oldNodes.some(oldNode => oldNode.equalsNode(newNode));
    });
  }
  commit() {
    this.dispatchEvent(new MessageEvent('finish'));
  }
  waitForLoad() {
    const p = makePromise();
    this.addEventListener('finish', () => {
      p.accept();
    }, {
      once: true,
    });
    return p;
  }
}
const diffLeafNodes = (newLeafNodes, oldLeafNodes) => {
  // map from min lod hash to task containing new nodes and old nodes
  const taskMap = new Map();

  const _getMaxLodNode = min => {
    const newLeafNode = _getLeafNodeFromPoint(newLeafNodes, min);
    const oldLeafNode = _getLeafNodeFromPoint(oldLeafNodes, min);
    if (newLeafNode && oldLeafNode) {
      return newLeafNode.lod > oldLeafNode.lod ? newLeafNode : oldLeafNode;
    } else if (newLeafNode) {
      return newLeafNode;
    } else {
      return oldLeafNode;
    }
  };
  for (const newNode of newLeafNodes) {
    const maxLodNode = _getMaxLodNode(newNode.min);
    const hash = _octreeNodeMinHash(maxLodNode.min, maxLodNode.lod);
    let task = taskMap.get(hash);
    if (!task) {
      task = new Task(maxLodNode);
      taskMap.set(hash, task);
    }
    task.newNodes.push(newNode);
  }
  for (const oldNode of oldLeafNodes) {
    const maxLodNode = _getMaxLodNode(oldNode.min);
    const hash = _octreeNodeMinHash(maxLodNode.min, maxLodNode.lod);
    let task = taskMap.get(hash);
    if (!task) {
      task = new Task(maxLodNode);
      taskMap.set(hash, task);
    }
    task.oldNodes.push(oldNode);
  }

  let tasks = Array.from(taskMap.values());
  return tasks;
  /* const newTasks = [];
  const keepTasks = [];
  for (const task of tasks) {
    const isNopTask = task.newNodes.length === task.oldNodes.length && task.newNodes.every(newNode => {
      return task.oldNodes.some(oldNode => oldNode.equalsNode(newNode));
    });
    if (isNopTask) {
      keepTasks.push(task);
    } else {
      newTasks.push(task);
    }
  }
  return {
    newTasks,
    keepTasks,
  }; */
};
// sort tasks by distance to world position of the central max lod node
const sortTasks = (tasks, worldPosition) => {
  const taskDistances = tasks.map(task => {
    const distance = localVector2.copy(task.maxLodNode.min)
      .add(localVector3.setScalar(task.maxLodNode.lod / 2))
      .distanceToSquared(worldPosition);
    return {
      task,
      distance,
    };
  });
  taskDistances.sort((a, b) => {
    return a.distance - b.distance;
  });
  return taskDistances.map(taskDistance => taskDistance.task);
};
const updateChunks = (oldChunks, tasks) => {
  const newChunks = oldChunks.slice();
  
  for (const task of tasks) {
    if (!task.isNop()) {
      let {newNodes, oldNodes} = task;
      for (const oldNode of oldNodes) {
        const index = newChunks.findIndex(chunk => chunk.equalsNode(oldNode));
        if (index !== -1) {
          newChunks.splice(index, 1);
        } else {
          debugger;
        }
      }
      newChunks.push(...newNodes);
    }
  }

  const removedChunks = [];
  for (const oldChunk of oldChunks) {
    if (!newChunks.some(newChunk => newChunk.min.equals(oldChunk.min))) {
      removedChunks.push(oldChunk);
    }
  }
  const extraTasks = removedChunks.map(chunk => {
    const task = new Task(chunk);
    task.oldNodes.push(chunk);
    return task;
  });

  return {
    chunks: newChunks,
    extraTasks,
  }
};

/*
note: the nunber of lods at each level can be computed with this function:

  getNumLodsAtLevel = n => n === 0 ? 1 : (2*n+1)**2-(getNumLodsAtLevel(n-1));

the total number of chunks with 3 lods is:
  > getNumLodsAtLevel(0) + getNumLodsAtLevel(1) + getNumLodsAtLevel(2) + getNumLodsAtLevel(3)
  < 58

---

the view range for a chunk size and given number of lods is:

  // 0, 1, 2 are our lods
  getViewRangeInternal = n => (n === 0 ? 1 : (3*getViewRangeInternal(n-1)));
  getViewRange = (n, chunkSize) => getViewRangeInternal(n) * chunkSize / 2;

for a chunkSize of 30, we have the view distance of each lod:

  getViewRange(1, 30) = 45 // LOD 0
  getViewRange(2, 30) = 135 // LOD 1
  getViewRange(3, 30) = 405 // LOD 2
---

for a million tris budget, the tris per chunk is:
  1,000,000 tri / 58 chunks rendered = 17241.379310344827586206896551724 tri

for a chunk size of 30 meters, the density of tris per uniform meters cubic is:
  > 17241.379310344827586206896551724 tri / (30**3 meters)
  < 0.6385696040868454 tri/m^3

per meters squared, it's 19.157088122605362 tri/m^2

---

using these results

- the tri budget can be scaled linearly with the results
- the chunk size can be changed to increase the view distance while decreasing the density, while keeping the tri budget the same
*/
export class LodChunk extends THREE.Vector3 {
  constructor(x, y, z, lod, lodArray) {
    
    super(x, y, z);
    this.lod = lod;
    this.lodArray = lodArray;

    this.name = `chunk:${this.x}:${this.y}:${this.z}`;
    this.binding = null;
    this.items = [];
    this.physicsObjects = [];
  }
  lodEquals(chunk) {
    return this.lod === chunk.lod &&
      this.lodArray.length === chunk.lodArray.length && this.lodArray.every((lod, i) => lod === chunk.lodArray[i]);
  }
  containsPoint(p) {
    return p.x >= this.x && p.x < this.x + this.lod &&
      p.y >= this.y && p.y < this.y + this.lod &&
      p.z >= this.z && p.z < this.z + this.lod;
  }
}
export class LodChunkTracker extends EventTarget {
  constructor({
    chunkSize = defaultChunkSize,
    lods = 1,
    minLodRange = 2,
    trackY = false,
    debug = false,
  } = {}) {
    super();

    this.chunkSize = chunkSize;
    this.lods = lods;
    this.minLodRange = minLodRange;
    this.trackY = trackY;

    this.chunks = [];
    this.lastUpdateCoord = new THREE.Vector3(NaN, NaN, NaN);

    if (debug) {
      const maxChunks = 512;
      const instancedCubeGeometry = new THREE.InstancedBufferGeometry();
      {
        const cubeGeometry = new THREE.BoxBufferGeometry(1, 1, 1)
          .translate(0.5, 0.5, 0.5);
        for (const k in cubeGeometry.attributes) {
          instancedCubeGeometry.setAttribute(k, cubeGeometry.attributes[k]);
        }
        instancedCubeGeometry.setIndex(cubeGeometry.index);
      }
      const redMaterial = new THREE.MeshBasicMaterial({
        color: 0xFFFFFF,
        // transparent: true,
        // opacity: 0.1,
        wireframe: true,
      });
      const debugMesh = new THREE.InstancedMesh(instancedCubeGeometry, redMaterial, maxChunks);
      debugMesh.count = 0;
      debugMesh.frustumCulled = false;
      this.debugMesh = debugMesh;

      {
        const localVector = new THREE.Vector3();
        const localVector2 = new THREE.Vector3();
        const localVector3 = new THREE.Vector3();
        const localQuaternion = new THREE.Quaternion();
        const localMatrix = new THREE.Matrix4();
        const localColor = new THREE.Color();

        const _getChunkColorHex = chunk => {
          if (chunk.lod === 1) {
            return 0xFF0000;
          } else if (chunk.lod === 2) {
            return 0x00FF00;
          } else if (chunk.lod === 4) {
            return 0x0000FF;
          } else {
            return 0x0;
          }
        };
        const _flushChunks = () => {
          debugMesh.count = 0;
          for (let i = 0; i < this.chunks.length; i++) {
            const chunk = this.chunks[i];
            localMatrix.compose(
              localVector.copy(chunk.min)
                .multiplyScalar(this.chunkSize),
                // .add(localVector2.set(0, -60, 0)),
              localQuaternion.identity(),
              localVector3.set(1, 1, 1)
                .multiplyScalar(chunk.lod * this.chunkSize * 0.9)
            );
            localColor.setHex(_getChunkColorHex(chunk));
            debugMesh.setMatrixAt(debugMesh.count, localMatrix);
            debugMesh.setColorAt(debugMesh.count, localColor);
            debugMesh.count++;
          }
          debugMesh.instanceMatrix.needsUpdate = true;
          debugMesh.instanceColor && (debugMesh.instanceColor.needsUpdate = true);
        };
        this.addEventListener('update', e => {
          _flushChunks();
        });
      }
    }

    this.lastOctreeLeafNodes = [];
    this.liveTasks = [];
  }
  #getCurrentCoord(position, target) {
    const cx = Math.floor(position.x / this.chunkSize);
    const cy = this.trackY ? Math.floor(position.y / this.chunkSize) : 0;
    const cz = Math.floor(position.z / this.chunkSize);
    return target.set(cx, cy, cz);
  }
  emitChunkDestroy(chunk) {
    const hash = chunk.min.toArray().join(','); // _octreeNodeMinHash(chunk.min, chunk.lod);
    this.dispatchEvent(new MessageEvent('destroy.' + hash));
  }
  listenForChunkDestroy(chunk, fn) {
    const hash = chunk.min.toArray().join(','); // _octreeNodeMinHash(chunk.min, chunk.lod);
    this.addEventListener('destroy.' + hash, e => {
      fn(e);
    }, {once: true});
  }
  updateCoord(currentCoord) {
    const octreeLeafNodes = constructOctreeForLeaf(currentCoord, this.minLodRange, 2 ** (this.lods - 1));

    let tasks = diffLeafNodes(
      octreeLeafNodes,
      this.lastOctreeLeafNodes,
    );

    const {
      chunks,
      extraTasks,
    } = updateChunks(this.chunks, tasks);
    this.chunks = chunks;
    tasks.push(...extraTasks);

    sortTasks(tasks, camera.position);

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      if (!task.isNop()) {
        const overlappingTasks = this.liveTasks.filter(lastTask => task.maxLodNode.containsNode(lastTask.maxLodNode));
        for (const oldTask of overlappingTasks) {
          oldTask.cancel();
          this.liveTasks.splice(this.liveTasks.indexOf(oldTask), 1);
        }
        this.liveTasks.push(task);
      }
    }

    for (const task of tasks) {
      if (!task.isNop()) {
        this.dispatchEvent(new MessageEvent('chunkrelod', {
          data: {
            task,
          },
        }));
      }
    }

    this.lastOctreeLeafNodes = octreeLeafNodes;

    this.dispatchEvent(new MessageEvent('update'));
  }
  async waitForLoad() {
    // console.log('wait for live tasks 1', this.liveTasks.length);
    await Promise.all(this.liveTasks.map(task => task.waitForLoad()));
    // console.log('wait for live tasks 2', this.liveTasks.length);
  }
  update(position) {
    const currentCoord = this.#getCurrentCoord(position, localVector).clone();

    // if we moved across a chunk boundary, update needed chunks
    if (!currentCoord.equals(this.lastUpdateCoord)) {
      this.updateCoord(currentCoord);
      this.lastUpdateCoord.copy(currentCoord);
    }
  }
  destroy() {
    for (const chunk of this.chunks) {
      const task = new Task(chunk);
      task.oldNodes.push(chunk);
      
      this.dispatchEvent(new MessageEvent('chunkrelod', {
        data: {
          task,
        },
      }));
    }
    this.chunks.length = 0;
  }
}