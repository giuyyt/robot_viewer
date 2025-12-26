import * as THREE from 'three';
/**
 * CollisionVisualization - Visualize collision spheres per link
 */
export class CollisionVisualization {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.sphereMeshes = []; // { linkName, mesh }
        this.visible = true;
        this._linkMaterialMap = new Map();
    }

    /**
     * Show collision spheres from parsed data for a given model
     * @param {Object} model - model object that contains `threeObject` and `links`
     * @param {Array} linksSpheres - array of { link: string, spheres: [ { origin: [x,y,z], radius } ] }
     */
    showFromParsed(model, linksSpheres) {
        if (!model || !model.threeObject || !Array.isArray(linksSpheres)) return;

        // Clear any existing visualization first
        this.clear();

        linksSpheres.forEach(entry => {
            const linkName = entry.link;
            const spheres = entry.spheres || [];

            // Find link object in model scene graph
            const linkObject = this.findLinkObject(model.threeObject, linkName);

            // If not found, fallback to attaching to root model object
            const parent = linkObject || model.threeObject || this.sceneManager.scene;

            spheres.forEach(s => {
                const origin = s.origin || [0,0,0];
                const radius = typeof s.radius === 'number' ? s.radius : 0.01;

                const geo = new THREE.SphereGeometry(radius, 16, 12);

                // Get or create a material unique to this link (color-coded)
                let mat = this._linkMaterialMap.get(linkName);
                if (!mat) {
                    const color = this._colorForLink(linkName);
                    mat = new THREE.MeshPhongMaterial({
                        color: color,
                        transparent: true,
                        opacity: 0.45,
                        depthTest: true,
                        depthWrite: false
                    });
                    this._linkMaterialMap.set(linkName, mat);
                }

                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(origin[0] || 0, origin[1] || 0, origin[2] || 0);
                mesh.castShadow = false;
                mesh.receiveShadow = false;
                mesh.userData.isCollisionSphere = true;

                // Disable raycast so it doesn't interfere with interaction
                mesh.raycast = () => {};

                parent.add(mesh);
                this.sphereMeshes.push({ linkName, mesh });
            });
        });

        // this.setVisible(this.visible);
    }

    /**
     * Find link object in scene graph (same heuristics as InertialVisualization)
     */
    findLinkObject(root, linkName) {
        let found = null;
        if (!root) return null;
        root.traverse((child) => {
            if (child.name === linkName || child.name === `link_${linkName}` || child.name === `body_${linkName}`) {
                found = child;
            }
        });
        return found;
    }

    /** Set visibility for all collision spheres */
    setVisible(v) {
        this.visible = v;
        this.sphereMeshes.forEach(item => { 
            if (item.mesh) item.mesh.visible = this.visible; 
            console.log(item.mesh.visible);
        });
    }

    /**
     * Deterministic color for a link name. Uses a simple hash to pick a hue.
     * @param {string} linkName
     * @returns {THREE.Color}
     */
    _colorForLink(linkName) {
        if (!linkName) return new THREE.Color(0xff4444);
        // Compute a 32-bit integer hash
        let hash = 2166136261 >>> 0;
        for (let i = 0; i < linkName.length; i++) {
            hash ^= linkName.charCodeAt(i);
            hash = Math.imul(hash, 16777619) >>> 0;
        }

        // Use fractional part of hash times golden ratio to distribute hues
        const GOLDEN_RATIO_CONJUGATE = 0.618033988749895;
        const fract = (x) => x - Math.floor(x);
        const hue = fract(hash * GOLDEN_RATIO_CONJUGATE);

        // Vary saturation and lightness slightly based on hash to increase distinction
        const satSeed = fract(hash * 0.1274123);
        const lightSeed = fract(hash * 0.2718281);
        const saturation = 0.5 + satSeed * 0.35; // 0.5 - 0.85
        const lightness = 0.42 + lightSeed * 0.16; // 0.42 - 0.58

        const color = new THREE.Color();
        color.setHSL(hue, saturation, lightness);
        return color;
    }

    /** Remove all collision visualization meshes */
    clear() {
        this.sphereMeshes.forEach(item => {
            if (item.mesh && item.mesh.parent) item.mesh.parent.remove(item.mesh);
        });
        this.sphereMeshes = [];
    }
}

