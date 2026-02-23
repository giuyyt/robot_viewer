import * as THREE from 'three';
import { configManager } from '../utils/ConfigManager.js'; // 新增导入
/**
 * CollisionVisualization - Visualize collision spheres per link
 */
export class CollisionVisualization {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.sphereMeshes = []; // { linkName, mesh }
        this.visible = true;
        this._linkMaterialMap = new Map();
        this._selected = null; // { item }
        this._plane = new THREE.Plane();
        this._planeNormal = new THREE.Vector3();
        this._pointer = new THREE.Vector2();
        this._raycaster = new THREE.Raycaster();
        this.onChangeCallback = null; // function(linkName, index, {origin, radius})


        //编辑模式状态
        this._editMode = false; // 编辑模式标志
        this._editModeIndicator = null; // 编辑模式指示器
        this._boundingBox = null; // 选中球体的包围盒线框
        this._boundingBoxMaterial = new THREE.LineBasicMaterial({ color: 0xffff00 }); // 黄色线框
        this._moveStep = 0.01; // 键盘移动步长（固定浮点数）
        this._scaleStep = 0.05; // 键盘缩放步长（固定浮点数）


        // Bind event handlers
        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        this._onWheel = this._onWheel.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this); // 新增键盘事件

        // Attach pointer events to renderer DOM element if available
        if (this.sceneManager && this.sceneManager.renderer && this.sceneManager.renderer.domElement) {
            const el = this.sceneManager.renderer.domElement;
            el.addEventListener('pointerdown', this._onPointerDown);

            // window.addEventListener('pointermove', this._onPointerMove);
            window.addEventListener('pointerup', this._onPointerUp);
            // el.addEventListener('wheel', this._onWheel, { passive: false });


            // 新增：绑定键盘事件
            window.addEventListener('keydown', this._onKeyDown);

        }


        // 创建编辑模式指示器
        this._createEditModeIndicator();
        this._updateEditModeIndicator();

    }

    /**
     * Show collision spheres from parsed data for a given model
     * @param {Object} model - model object that contains `threeObject` and `links`
     * @param {Array} linksSpheres - array of { link: string, spheres: [ { origin: [x,y,z], radius } ] }
     */
    showFromParsed(model, linksSpheres) {
        if (!model || !model.threeObject || !Array.isArray(linksSpheres)) return;

        console.log('Showing collision spheres for model:', model.name, 'with data:', linksSpheres);

        // Clear any existing visualization first
        // TODO:每次显示球体都是群体删除再显示，性能没有达到最优。
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
                // store index and link reference for callbacks
                mesh.userData._collision = { linkName, index: this.sphereMeshes.length };

                // 移除或注释掉这行代码，启用射线检测
                // mesh.raycast = () => {};

                parent.add(mesh);
                this.sphereMeshes.push({ linkName, mesh, origin: origin.slice(), radius });
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

    /** Select given sphere item (internal) */
    _deselect() {
        // 移除包围盒线框
        this._removeBoundingBox();
        
        if (this._selected) {
            const it = this._selected;
            if (it.mesh && it._oldOpacity !== undefined) it.mesh.material.opacity = it._oldOpacity;
        }
        this._selected = null;
    }


    /** 创建选中球体的包围盒线框 */
    _createBoundingBox(mesh) {
        // 先移除现有的包围盒
        this._removeBoundingBox();
        
        // 计算球体的包围盒
        const geometry = mesh.geometry;
        geometry.computeBoundingBox();
        const box = geometry.boundingBox.clone();
        
        // 应用球体的缩放和位置变换
        box.applyMatrix4(mesh.matrixWorld);
        
        // 创建线框几何体
        const boxGeometry = new THREE.BoxGeometry(
            box.max.x - box.min.x,
            box.max.y - box.min.y,
            box.max.z - box.min.z
        );
        
        // 创建线框对象
        this._boundingBox = new THREE.LineSegments(
            new THREE.EdgesGeometry(boxGeometry),
            this._boundingBoxMaterial
        );
        
        // 设置包围盒位置与球体中心对齐
        this._boundingBox.position.copy(mesh.getWorldPosition(new THREE.Vector3()));
        
        // 添加到场景中
        this.sceneManager.scene.add(this._boundingBox);
    }

    /** 移除包围盒线框 */
    _removeBoundingBox() {
        if (this._boundingBox && this._boundingBox.parent) {
            this._boundingBox.parent.remove(this._boundingBox);
            this._boundingBox = null;
        }
    }

    /** 更新包围盒位置（当球体移动时） */
    _updateBoundingBox() {
        if (this._selected && this._selected.mesh && this._boundingBox) {
            this._boundingBox.position.copy(this._selected.mesh.getWorldPosition(new THREE.Vector3()));
        }
    }





    _createEditModeIndicator() {
        // 创建一个简单的文本指示器
        const indicator = document.createElement('div');
        indicator.style.position = 'absolute';
        indicator.style.top = '10px';
        indicator.style.right = '10px';
        indicator.style.padding = '5px 10px';
        indicator.style.backgroundColor = 'rgba(0,0,0,0.7)';
        indicator.style.color = 'white';
        indicator.style.borderRadius = '4px';
        indicator.style.fontFamily = 'Arial, sans-serif';
        indicator.style.fontSize = '12px';
        indicator.style.zIndex = '1000';
        indicator.style.display = 'none';
        indicator.textContent = '编辑模式: 关闭';
        
        document.body.appendChild(indicator);
        this._editModeIndicator = indicator;
    }

    /** 更新编辑模式指示器 */
    _updateEditModeIndicator() {
        if (!this._editModeIndicator) return;
        
        if (this._editMode) {
            this._editModeIndicator.textContent = '编辑模式: 开启 (按G键退出, P键保存)';
            this._editModeIndicator.style.backgroundColor = 'rgba(76, 175, 80, 0.8)';
            this._editModeIndicator.style.display = 'block';
        } else {
            this._editModeIndicator.textContent = '编辑模式: 关闭 (按G键进入, P键保存)';
            this._editModeIndicator.style.backgroundColor = 'rgba(244, 67, 54, 0.8)';
            this._editModeIndicator.style.display = 'block';
            
            // 3秒后自动隐藏
            // setTimeout(() => {
            //     if (!this._editMode && this._editModeIndicator) {
            //         this._editModeIndicator.style.display = 'none';
            //     }
            // }, 3000);
        }
    }

    /** 键盘按下事件处理 */
    _onKeyDown(ev) {
        // 检查是否按下了G键
        if (ev.key === 'g' || ev.key === 'G') {
            ev.preventDefault();
            this.toggleEditMode();
        }
        
        // 在编辑模式下，按ESC键也可以退出编辑模式
        if (this._editMode && ev.key === 'Escape') {
            ev.preventDefault();
            this.setEditMode(false);
        }

        // 处理S键保存功能（在任何模式下都可以保存）
        if (ev.key === 'p' || ev.key === 'P') {
            ev.preventDefault();
            this.saveCollisionSpheres();
            return;
        }
        
        // 只有在编辑模式下且有选中球体时才处理移动和缩放键
        if (!this._isInEditMode() || !this._selected) return;
        
        // 处理移动键：W,S,A,D,Q,E
        switch (ev.key.toLowerCase()) {
            case 'w': // X增加
                ev.preventDefault();
                this._moveSphere(1, 0, 0);
                break;
            case 's': // X减少
                ev.preventDefault();
                this._moveSphere(-1, 0, 0);
                break;
            case 'a': // Y增加
                ev.preventDefault();
                this._moveSphere(0, 1, 0);
                break;
            case 'd': // Y减少
                ev.preventDefault();
                this._moveSphere(0, -1, 0);
                break;
            case 'q': // Z增加
                ev.preventDefault();
                this._moveSphere(0, 0, 1);
                break;
            case 'e': // Z减少
                ev.preventDefault();
                this._moveSphere(0, 0, -1);
                break;
            case 'u': // 放大
                ev.preventDefault();
                this._scaleSphere(1);
                break;
            case 'i': // 缩小
                ev.preventDefault();
                this._scaleSphere(-1);
                break;
        }
    }


    saveCollisionSpheres() {
        if (!configManager.hasConfig()) {
            console.warn('没有配置数据可保存');
            this._showSaveNotification('没有配置数据可保存', 'warning');
            return;
        }

        if (this.sphereMeshes.length === 0) {
            console.warn('没有碰撞球数据可保存');
            this._showSaveNotification('没有碰撞球数据可保存', 'warning');
            return;
        }

        // 获取更新后的碰撞球数据
        const updatedSpheres = this._getUpdatedSpheresData();

        console.log('Saving collision spheres data:', updatedSpheres);
        
        // 更新全局配置管理器中的原始配置
        const updatedConfig = configManager.updateOriginalConfig(updatedSpheres);

        console.log('Updated collision spheres data:', updatedConfig);


        
        if (!updatedConfig) {
            console.error('无法更新配置数据');
            this._showSaveNotification('保存失败：无法更新配置数据', 'error');
            return;
        }

        // 保存到本地文件
        this._saveConfigToFile(updatedConfig);
        
        console.log('碰撞球数据已更新并保存到原始文件');
        this._showSaveNotification('碰撞球数据已保存到原始文件', 'success');
    }


    _getUpdatedSpheresData() {
        const linkGroups = {};
        
        // 获取原始配置以获取正确的链接键名
        const originalConfig = configManager.getParsedConfig();
        
        this.sphereMeshes.forEach(item => {
            // 查找原始配置中对应的完整链接键名
            let fullLinkName = item.linkName;
            for (const key in originalConfig) {
                if (key.includes(item.linkName)) {
                    fullLinkName = key;
                    break;
                }
            }
            
            if (!linkGroups[fullLinkName]) {
                linkGroups[fullLinkName] = [];
            }
            
            const position = item.mesh.position;
            linkGroups[fullLinkName].push({
                origin: [position.x, position.y, position.z],
                radius: item.radius
            });
        });
        
        const jsonData = [];
        for (const linkName in linkGroups) {
            jsonData.push({
                link: linkName,
                spheres: linkGroups[linkName]
            });
        }
        
        return jsonData;
    }



    _saveConfigToFile(updatedConfig) {
        const fileName = configManager.getOriginalFileName() || 'collision_spheres_updated.json';
        const jsonString = JSON.stringify(updatedConfig, null, 2);
        
        // 创建下载链接
        this._downloadJSONFile(jsonString, fileName);
    }
    
    /** 显示保存通知 */
    _showSaveNotification(message, type = 'info') {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.style.position = 'absolute';
        notification.style.top = '50px';
        notification.style.right = '10px';
        notification.style.padding = '10px 15px';
        notification.style.backgroundColor = type === 'success' ? 'rgba(76, 175, 80, 0.9)' : 
                                        type === 'warning' ? 'rgba(255, 152, 0, 0.9)' : 
                                        'rgba(33, 150, 243, 0.9)';
        notification.style.color = 'white';
        notification.style.borderRadius = '4px';
        notification.style.fontFamily = 'Arial, sans-serif';
        notification.style.fontSize = '14px';
        notification.style.zIndex = '1001';
        notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // 3秒后自动移除
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }
    
    /** 下载JSON文件 */
    _downloadJSONFile(jsonString, filename) {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }





/** 移动选中的球体 */
    _moveSphere(dx, dy, dz) {
        if (!this._selected || !this._selected.mesh) return;
        
        const mesh = this._selected.mesh;
        
        // 计算新的位置（全局坐标系）
        mesh.position.x += dx * this._moveStep;
        mesh.position.y += dy * this._moveStep;
        mesh.position.z += dz * this._moveStep;
        
        // 更新包围盒位置
        this._updateBoundingBox();
        
        // 更新存储的原始位置数据
        const idx = this.sphereMeshes.indexOf(this._selected);
        if (idx >= 0) {
            this.sphereMeshes[idx].origin = [
                mesh.position.x, 
                mesh.position.y, 
                mesh.position.z
            ];
            this._notifyChange(this.sphereMeshes[idx], idx);
        }
        
        console.log(`移动球体: X=${mesh.position.x.toFixed(3)}, Y=${mesh.position.y.toFixed(3)}, Z=${mesh.position.z.toFixed(3)}`);
    }

    // TODO:显示的缩放倍数和保存的缩放倍数完全不匹配，需要debug。
    // TODO:移动的显示和保存暂时无问题。需要进一步测试。
    _scaleSphere(direction) {
        if (!this._selected || !this._selected.mesh) return;
        
        const mesh = this._selected.mesh;
        
        // 计算缩放因子
        const scaleFactor = 1 + direction * this._scaleStep;
        
        // 更新球体缩放
        mesh.scale.multiplyScalar(scaleFactor);
        
        // 更新包围盒
        this._createBoundingBox(mesh);
        
        // 更新存储的半径数据
        const idx = this.sphereMeshes.indexOf(this._selected);
        if (idx >= 0) {
            // 计算新的半径（基于原始半径和当前缩放）
            const baseRadius = this.sphereMeshes[idx].radius || 1;
            const newRadius = baseRadius * mesh.scale.x;
            this.sphereMeshes[idx].radius = newRadius;
            this._notifyChange(this.sphereMeshes[idx], idx);
        }
        
        console.log(`缩放球体: 缩放因子=${scaleFactor.toFixed(3)}, 新半径=${this.sphereMeshes[idx].radius.toFixed(3)}`);
    }



    /** 切换编辑模式 */
    toggleEditMode() {
        this.setEditMode(!this._editMode);
    }

    /** 设置编辑模式状态 */
    setEditMode(enabled) {
        this._editMode = enabled;
        this._updateEditModeIndicator();
        
        // 如果退出编辑模式，取消当前选择并移除包围盒
        if (!enabled) {
            this._deselect();
        }
        
        console.log(`编辑模式: ${enabled ? '开启' : '关闭'}`);
    }

    /** 检查是否在编辑模式下 */
    _isInEditMode() {
        return this._editMode;
    }



    _selectItem(item) {
        if (this._selected === item) return;
        this._deselect();
        this._selected = item;
        if (item && item.mesh) {
            item._oldOpacity = item.mesh.material.opacity;
            item.mesh.material.opacity = Math.min(1.0, (item.mesh.material.opacity || 0.45) + 0.25);
            
            // 创建并显示包围盒线框
            this._createBoundingBox(item.mesh);
        }
    }





    /** Pointer down handler - start selection/drag */
    _onPointerDown(ev) {
        // 只有在编辑模式下才允许选择
        if (!this._isInEditMode()) return;

        if (!this.sceneManager || !this.sceneManager.camera) return;
        console.log('pointer down', ev.clientX, ev.clientY);
        const rect = this.sceneManager.renderer.domElement.getBoundingClientRect();
        this._pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        this._pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

        this._raycaster.setFromCamera(this._pointer, this.sceneManager.camera);
        const intersects = this._raycaster.intersectObjects(this.sphereMeshes.map(s=>s.mesh), true);
        console.log('intersects.length:', intersects.length);

        if (intersects && intersects.length > 0) {
            const mesh = intersects[0].object;
            const item = this.sphereMeshes.find(s => s.mesh === mesh);
            console.log('hit item:', item);
            if (item) {
                this._selectItem(item);
                // 移除拖动平面和偏移量设置，因为不再需要鼠标拖动
                ev.preventDefault();
            }
        } else {
            this._deselect();
        }
    }


    /** Pointer move handler - update dragging */
    _onPointerMove(ev) {
        // // 只有在编辑模式下且有选中球体时才更新位置
        // if (!this._isInEditMode() || !this._selected || !this.sceneManager || !this.sceneManager.camera) return;
        
        // console.log('pointer move', ev.clientX, ev.clientY);
        // const rect = this.sceneManager.renderer.domElement.getBoundingClientRect();
        // this._pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        // this._pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        
        // this._raycaster.setFromCamera(this._pointer, this.sceneManager.camera);
        // const ray = this._raycaster.ray;
        // const targetPoint = new THREE.Vector3();
        
        // // 计算射线与平面的交点
        // ray.intersectPlane(this._plane, targetPoint);
        // if (targetPoint) {
        //     // 应用偏移量，确保球体中心跟随鼠标光标
        //     targetPoint.add(this._dragOffset || new THREE.Vector3());
            
        //     // 将世界坐标转换为父级局部坐标
        //     const parent = this._selected.mesh.parent;
        //     if (parent) {
        //         parent.worldToLocal(targetPoint);
        //     }
            
        //     // 更新球体位置
        //     this._selected.mesh.position.copy(targetPoint);
            
        //     // 更新包围盒位置
        //     this._updateBoundingBox();
            
        //     // 更新存储的原始位置数据
        //     const idx = this.sphereMeshes.indexOf(this._selected);
        //     if (idx >= 0) {
        //         this.sphereMeshes[idx].origin = [
        //             this._selected.mesh.position.x, 
        //             this._selected.mesh.position.y, 
        //             this._selected.mesh.position.z
        //         ];
        //         this._notifyChange(this.sphereMeshes[idx], idx);
        //     }
        // }
    }

    /** Pointer up handler - end drag */
    _onPointerUp() {
        // this._dragging = false;
    }

    /** Mouse wheel handler - resize selected sphere */
    _onWheel(ev) {
        // if (!this._isInEditMode() || !this._selected) return;
        // console.log('wheel', ev.deltaY);
        // ev.preventDefault();
        // const delta = ev.deltaY > 0 ? -1 : 1;
        // const scaleFactor = 1 + delta * 0.05;
        // const mesh = this._selected.mesh;
        // // update radius by scaling mesh geometry
        // mesh.scale.multiplyScalar(scaleFactor);
        
        // // 更新包围盒
        // this._createBoundingBox(mesh);
        
        // const idx = this.sphereMeshes.indexOf(this._selected);
        // if (idx >= 0) {
        //     // compute new radius from geometry scale and original radius
        //     const baseRadius = this.sphereMeshes[idx].radius || 1;
        //     const newRadius = baseRadius * mesh.scale.x;
        //     this.sphereMeshes[idx].radius = newRadius;
        //     this._notifyChange(this.sphereMeshes[idx], idx);
        // }
    }


    /** Notify external listener of change */
    _notifyChange(item, index) {
        if (typeof this.onChangeCallback === 'function') {
            this.onChangeCallback(item.linkName, index, { origin: item.origin, radius: item.radius });
        }
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


    destroy() {
        // 移除事件监听器
        if (this.sceneManager && this.sceneManager.renderer && this.sceneManager.renderer.domElement) {
            const el = this.sceneManager.renderer.domElement;
            el.removeEventListener('pointerdown', this._onPointerDown);
            // 移除鼠标移动事件监听
            // window.removeEventListener('pointermove', this._onPointerMove);
            window.removeEventListener('pointerup', this._onPointerUp);
            // 移除滚轮事件监听
            // el.removeEventListener('wheel', this._onWheel);
            window.removeEventListener('keydown', this._onKeyDown);
        }
        
        // 移除编辑模式指示器
        if (this._editModeIndicator && this._editModeIndicator.parentNode) {
            this._editModeIndicator.parentNode.removeChild(this._editModeIndicator);
        }
        
        // 移除包围盒
        this._removeBoundingBox();
        
        this.clear();
    }






}

