import * as THREE from 'three'
import { IDTech } from './idTech.js'

const textureLoader = new THREE.TextureLoader()

const IdtechBasic = new IDTech(512, 64)
IdtechBasic.loadAll('textures/terrain/terrain ')
const IdtechNormal = new IDTech(512, 64)
IdtechNormal.loadAll('textures/terrainnormal/terrain normal ')

/**
 * GradientMap
 */
const gradientMaps = (function () {
  const threeTone = textureLoader.load('./textures/threeTone.jpg')
  threeTone.minFilter = THREE.NearestFilter
  threeTone.magFilter = THREE.NearestFilter

  const fiveTone = textureLoader.load('./textures/fiveTone.jpg')
  fiveTone.minFilter = THREE.NearestFilter
  fiveTone.magFilter = THREE.NearestFilter

  return {
    none: null,
    threeTone: threeTone,
    fiveTone: fiveTone,
  }
})()

const noiseTexture = textureLoader.load(
  `${import.meta.url.replace(/(\/)[^\/]*$/, '$1')}/textures/noise.png`
)
noiseTexture.wrapS = THREE.RepeatWrapping
noiseTexture.wrapT = THREE.RepeatWrapping

export const vertex = /* glsl */ `

varying vec2 vUv;
varying vec3 vNormal;

uniform vec2 uResolution;
uniform float uTime;

#ifdef USE_TERRAIN
    attribute vec4 biome;
    attribute vec4 biomeWeight;

    out vec3  vtriCoord;
    out vec3  vtriNormal;
    flat out vec4 vbiome;
    out float fbiome0;
    out vec4 vbiomeWeight;
#endif

void main() {

    #if defined(USE_TERRAIN)
        vbiome = biome;
        fbiome0 = biome.x;
        vbiomeWeight = biomeWeight;
        vec4 triWorldPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
            triWorldPosition = instanceMatrix * triWorldPosition;
        #endif
        triWorldPosition = modelMatrix * triWorldPosition;
        vtriCoord = triWorldPosition.xyz;
        vtriNormal = vec3(normal);
    #endif

  vNormal = normal;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

}
`

export const fragment = /* glsl */ `

uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;

#ifdef USE_TERRAIN
    precision highp sampler2DArray;
    uniform sampler2DArray terrainArrayTexture;
    uniform sampler2DArray terrainNormalArrayTexture ;
    uniform sampler2D  noiseTexture ;

    flat in vec4 vbiome;
    in float fbiome0;
    in vec4 vbiomeWeight;
    in vec3 vtriCoord;
    in vec3 vtriNormal;

    float sum( vec4 v ) { return v.x+v.y+v.z; }
    /**
     * texture random sampler
     */
    vec4 randomTexture(sampler2DArray samp, vec3 uvi)
    {
        vec2 uv = uvi.xy;
        float k = texture( noiseTexture, 0.01 * uv).x; // cheap (cache friendly) lookup

        vec2 duvdx = dFdx( uv );
        vec2 duvdy = dFdx( uv );

        float l = k*8.0;
        float f = fract(l);

        float ia = floor(l+0.5); // suslik's method (see comments)
        float ib = floor(l);
        f = min(f, 1.0-f)*2.0;

        vec2 offa = sin(vec2(3.0,7.0)*ia); // can replace with any other hash
        vec2 offb = sin(vec2(3.0,7.0)*ib); // can replace with any other hash

        vec4 cola = textureGrad( samp, vec3(uv + offa,uvi.z), duvdx, duvdy );
        vec4 colb = textureGrad( samp, vec3(uv + offb,uvi.z), duvdx, duvdy );

        return mix( cola, colb, smoothstep(0.2,0.8,f-0.1*sum(cola-colb)));
    }

    vec4 triplanarTexture(vec3 pos, vec3 normal,vec3 blending, float texId, sampler2DArray tex,float scale) {
      vec4 tx = randomTexture(tex, vec3(pos.zy / scale, texId));
      vec4 ty = randomTexture(tex, vec3(pos.xz / scale, texId));
      vec4 tz = randomTexture(tex, vec3(pos.xy / scale, texId));
      return tx * blending.x + ty * blending.y + tz * blending.z;
    }

    vec3 triplanarNormal(vec3 pos, vec3 normal,vec3 blending, float texId, sampler2DArray tex,float scale) {
      // Tangent space normal maps
      vec3 tnormalX = randomTexture(tex, vec3(pos.zy/scale, vbiome.x)).xyz*2.0-1.0;
      vec3 tnormalY = randomTexture(tex, vec3(pos.xz/scale, vbiome.x)).xyz*2.0-1.0;
      vec3 tnormalZ = randomTexture(tex, vec3(pos.xy/scale, vbiome.x)).xyz*2.0-1.0;
      vec3 normalX = vec3(0.0, tnormalX.yx);
      vec3 normalY = vec3(tnormalY.x, 0.0, tnormalY.y);
      vec3 normalZ = vec3(tnormalZ.xy, 0.0);
      vec3 worldNormal =  normalize(normalX * blending.x +normalY * blending.y +normalZ * blending.z+normal);
      return worldNormal;
    }

    float mod289(float x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
    vec4 mod289(vec4 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
    vec4 perm(vec4 x){return mod289(((x * 34.0) + 1.0) * x);}

    float noise(vec3 p){
        vec3 a = floor(p);
        vec3 d = p - a;
        d = d * d * (3.0 - 2.0 * d);

        vec4 b = a.xxyy + vec4(0.0, 1.0, 0.0, 1.0);
        vec4 k1 = perm(b.xyxy);
        vec4 k2 = perm(k1.xyxy + b.zzww);

        vec4 c = k2 + a.zzzz;
        vec4 k3 = perm(c);
        vec4 k4 = perm(c + 1.0);

        vec4 o1 = fract(k3 * (1.0 / 41.0));
        vec4 o2 = fract(k4 * (1.0 / 41.0));

        vec4 o3 = o2 * d.z + o1 * (1.0 - d.z);
        vec2 o4 = o3.yw * d.x + o3.xz * (1.0 - d.x);

        return o4.y * d.y + o4.x * (1.0 - d.y);
    }

    #define NUM_OCTAVES 5
    float fbm(vec3 x) {
        x = x/50.0;
        float v = 0.0;
        float a = 0.5;
        vec3 shift = vec3(1000.0);
        for (int i = 0; i < NUM_OCTAVES; ++i) {
            v += a * noise(x);
            x = x * 2.0 + shift;
            a *= 0.5;
        }
        return  v ;
    }
#endif

void main() {

    #ifdef USE_TERRAIN
        vec3 blending = normalize(max(abs(vtriNormal), 0.001)); // Force weights to sum to 1.0
        blending = blending / (blending.x + blending.y + blending.z);

        vec4 biome0Color= triplanarTexture(vtriCoord, vtriNormal.xyz,blending, vbiome.x, terrainArrayTexture,10.0) ;
        vec4 biome1Color= triplanarTexture(vtriCoord, vtriNormal.xyz,blending, vbiome.y, terrainArrayTexture,10.0) ;
        vec4 biome2Color= triplanarTexture(vtriCoord, vtriNormal.xyz,blending, vbiome.z, terrainArrayTexture,10.0) ;
        vec4 biome3Color= triplanarTexture(vtriCoord, vtriNormal.xyz,blending, vbiome.w, terrainArrayTexture,10.0) ;

        float ba = fbm(vtriCoord) ;
        vec4 terrainColor = vbiomeWeight.x * biome0Color + vbiomeWeight.y * biome1Color +
            vbiomeWeight.z * biome2Color + vbiomeWeight.w * biome3Color;
        // if (abs(fbiome0 - vbiome.x) > 0.01) {
        //     if (vbiomeWeight.z < 0.1) {
        //         terrainColor = 0.5 * (biome0Color + biome1Color);
        //     }
        // }

        terrainColor *= max(ba*1.75,0.8) ;
        diffuseColor *= terrainColor;
    #endif
    #ifdef USE_TERRAIN
        vec3 normal0 = triplanarNormal(vtriCoord,normal,blending, vbiome.x, terrainNormalArrayTexture,10.0);
        vec3 normal1 = triplanarNormal(vtriCoord,normal,blending, vbiome.y, terrainNormalArrayTexture,10.0);
        vec3 normal2 = triplanarNormal(vtriCoord,normal,blending, vbiome.z, terrainNormalArrayTexture,10.0);
        vec3 normal3 = triplanarNormal(vtriCoord,normal,blending, vbiome.w, terrainNormalArrayTexture,10.0);

        vec3 normalmix = vbiomeWeight.x * normal0 + vbiomeWeight.y * normal1 + vbiomeWeight.z * normal2 + vbiomeWeight.w * normal3;
        normal = normalize(normal + normalmix *0.5);//normalmix;//
    #endif
    gl_FragColor = vec4(1. , 0. , 0. , 1. );
}
`


// export const terrainMaterial = new THREE.MeshToonMaterial({ color: 0xaaccff, gradientMap: gradientMaps.threeTone });;
export const terrainMaterial = new THREE.ShaderMaterial({
  fragmentShader: fragment,
  vertexShader: vertex,
  uniforms: {
    terrainArrayTexture: { value: IdtechBasic.texture },
    terrainNormalArrayTexture: { value: IdtechBasic.texture },
    noiseTexture: { value: noiseTexture },
  },
  defines: {
    USE_TERRAIN: '',
  },
})

// terrainMaterial.onBeforeCompile = (shader, renderer) => {
//   shader.uniforms = shader.uniforms || {}
//   terrainMaterial.uniforms = shader.uniforms
//   console.log('onBeforeCompile')
//   shader.vertexShader = vertex
//   shader.fragmentShader = fragment

//   shader.defines = shader.defines || {}
//   //USE_TERRAIN  open terrain render
//   shader.defines['USE_TERRAIN'] = ''

//   //terrain map
//   shader.uniforms.terrainArrayTexture = { value: IdtechBasic.texture }
//   //terrain normal map
//   shader.uniforms.terrainNormalArrayTexture = { value: IdtechNormal.texture }
//   //noise map use to random sampler
//   shader.uniforms.noiseTexture = { value: noiseTexture }
// }
