import * as THREE from 'three';
/**
 * CollisionVisualization - Visualize collision spheres per link
 */
export class CollisionVisualization {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.sphereMeshes = []; // { linkName, mesh }
        this.visible = true;
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
                const mat = new THREE.MeshPhongMaterial({
                    color: 0xff4444,
                    transparent: true,
                    opacity: 0.45,
                    depthTest: true,
                    depthWrite: false
                });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(origin[0] || 0, origin[1] || 0, origin[2] || 0);
                mesh.castShadow = false;
                mesh.receiveShadow = false;
                mesh.userData.isCollisionSphere = false;

                // Disable raycast so it doesn't interfere with interaction
                mesh.raycast = () => {};

                parent.add(mesh);
                this.sphereMeshes.push({ linkName, mesh });
            });
        });

        this.setVisible(this.visible);
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
        this.visible = !!v;
        this.sphereMeshes.forEach(item => { if (item.mesh) item.mesh.visible = this.visible; });
    }

    /** Remove all collision visualization meshes */
    clear() {
        this.sphereMeshes.forEach(item => {
            if (item.mesh && item.mesh.parent) item.mesh.parent.remove(item.mesh);
        });
        this.sphereMeshes = [];
    }
}

