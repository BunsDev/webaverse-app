/*
this file contains the universe/meta-world/scenes/multiplayer code.
responsibilities include loading the world on url change.
*/

// import * as THREE from 'three';
import * as Z from 'zjs';
import {world} from './world.js';
import physicsManager from './physics-manager.js';
import {loadOverworld} from './overworld.js';
import {initialPosY} from './constants.js';
import {parseQuery} from './util.js';
import metaversefile from 'metaversefile';
import sceneNames from './scenes/scenes.json';
import {loadingManager} from './loading-manager'

class Universe extends EventTarget {
  constructor() {
    super();

    this.currentWorld = null;
    this.sceneLoadedPromise = null;
  }
  getWorldsHost() {
    return window.location.protocol + '//' + window.location.hostname + ':' +
      ((window.location.port ? parseInt(window.location.port, 10) : (window.location.protocol === 'https:' ? 443 : 80)) + 1) + '/worlds/';
  }
  async enterWorld(worldSpec) {
    world.disconnectRoom();
    
    const localPlayer = metaversefile.useLocalPlayer();
    /* localPlayer.teleportTo(new THREE.Vector3(0, 1.5, 0), camera.quaternion, {
      relation: 'float',
    }); */
    localPlayer.position.set(0, initialPosY, 0);
    localPlayer.characterPhysics.reset();
    localPlayer.updateMatrixWorld();
    // physicsManager.setPhysicsEnabled(true);
    // localPlayer.updatePhysics(0, 0);
    physicsManager.setPhysicsEnabled(false);

    const _doLoad = async () => {
      // world.clear();

      const promises = [];
      let {src, room} = worldSpec;
      if (!room) {
        const state = new Z.Doc();
        world.connectState(state);
        
        let match;
        if (src === undefined) {
          promises.push(metaversefile.createAppAsync({
            start_url: './scenes/' + sceneNames[0],
          }));
        } else if (src === '') {
          // nothing
        } else if (match = src.match(/^weba:\/\/(-?[0-9\.]+),(-?[0-9\.]+)(?:\/|$)/i)) {
          const [, x, y] = match;
          const [x1, y1] = [parseFloat(x), parseFloat(y)];
          const p = loadOverworld(x1, y1);
          promises.push(p);
        } else {
          const p = metaversefile.createAppAsync({
            start_url: src,
          });
          promises.push(p);
        }
      } else {
        const p = (async () => {
          const roomUrl = this.getWorldsHost() + room;
          await world.connectRoom(roomUrl);
        })();
        promises.push(p);
      }
      
      this.sceneLoadedPromise = Promise.all(promises)
        .then(() => {});
      await this.sceneLoadedPromise;
      this.sceneLoadedPromise = null;
    };
    await _doLoad();

    localPlayer.characterPhysics.reset();
    physicsManager.setPhysicsEnabled(true);
    localPlayer.updatePhysics(0, 0);

    this.currentWorld = worldSpec;

    this.dispatchEvent(new MessageEvent('worldload'));
  }
  async reload() {
    await this.enterWorld(this.currentWorld);
  }
  async pushUrl(u) {
    history.pushState({}, '', u);
    window.dispatchEvent(new MessageEvent('pushstate'));
    const { count, detail } = await this.estimateLoad();
    window.dispatchEvent(
      new MessageEvent("detailChanged", {
        data: detail,
      })
    );
    loadingManager.setTotalAppsCount(count);
    loadingManager.startLoading();
    await this.handleUrlUpdate();
    loadingManager.requestLoadEnd();
  }
  async handleUrlUpdate() {
    const q = parseQuery(location.search);
    await this.enterWorld(q);
  }
  isSceneLoaded() {
    return !this.sceneLoadedPromise;
  }
  async waitForSceneLoaded() {
    if (this.sceneLoadedPromise) {
      await this.sceneLoadedPromise;
    } else {
      if (this.currentWorld) {
        // nothing
      } else {
        await new Promise((accept, reject) => {
          this.addEventListener('worldload', e => {
            accept();
          }, {once: true});
        });
      }
    }
  }

  async estimateLoad() {
    try {
      const worldSpec = parseQuery(location.search);
      const {src, room} = worldSpec;
      let srcUrl = src
      if (!room) {
        if (srcUrl === '') {
          // nothing
        } else if (srcUrl !== undefined && srcUrl.match(/^weba:\/\/(-?[0-9\.]+),(-?[0-9\.]+)(?:\/|$)/i)) {
          // nothing
        } else {
          //TODO: this is the duplicate function from totum/scn.js
          if (srcUrl == undefined) srcUrl = './scenes/' + sceneNames[0]
          const res = await fetch(srcUrl);
          const j = await res.json();
          const {objects, detail} = j;
          return {count: objects.length, detail}
        }
      } else {
        const roomUrl = this.getWorldsHost() + room;
        const res = await fetch(roomUrl);
        const data = await res.json();
        return {count: data.apps ? data.apps.length : 0, detail: data.detail}
      }
    } catch (error) {
      console.error(error)
      return {count: 0}
    }
  }
}
const universe = new Universe();

export default universe;
