/**
 * ConfigManager - 全局配置管理单例类
 * 用于管理解析后的碰撞球配置数据
 */
export class ConfigManager {
    constructor() {
        if (ConfigManager._instance) {
            return ConfigManager._instance;
        }
        ConfigManager._instance = this;
        
        this._parsedConfig = null; // 存储原始解析的配置数据
        this._parsedCollisionSpheres = null; // 存储解析后的碰撞球数据
        this._originalFileName = null; // 原始文件名
        this._originalFileContent = null; // 原始文件内容
    }

    static getInstance() {
        if (!ConfigManager._instance) {
            ConfigManager._instance = new ConfigManager();
        }
        return ConfigManager._instance;
    }

    /**
     * 设置解析后的配置数据
     * @param {Object} parsedConfig - 解析后的配置对象
     * @param {Array} parsedCollisionSpheres - 解析后的碰撞球数据
     * @param {string} fileName - 原始文件名
     * @param {string} fileContent - 原始文件内容
     */
    setConfig(parsedConfig, parsedCollisionSpheres, fileName, fileContent) {
        this._parsedConfig = parsedConfig;
        this._parsedCollisionSpheres = parsedCollisionSpheres;
        this._originalFileName = fileName;
        this._originalFileContent = fileContent;
        console.log('ConfigManager: 配置数据已设置', fileName);
    }

    /**
     * 获取原始解析配置
     * @returns {Object|null}
     */
    getParsedConfig() {
        return this._parsedConfig;
    }

    /**
     * 获取解析后的碰撞球数据
     * @returns {Array|null}
     */
    getParsedCollisionSpheres() {
        return this._parsedCollisionSpheres;
    }

    /**
     * 获取原始文件名
     * @returns {string|null}
     */
    getOriginalFileName() {
        return this._originalFileName;
    }

    /**
     * 获取原始文件内容
     * @returns {string|null}
     */
    getOriginalFileContent() {
        return this._originalFileContent;
    }

    /**
     * 更新碰撞球数据
     * @param {Array} updatedSpheres - 更新后的碰撞球数据
     */
    updateCollisionSpheres(updatedSpheres) {
        this._parsedCollisionSpheres = updatedSpheres;
        console.log('ConfigManager: 碰撞球数据已更新');
    }

    /**
     * 将修改后的配置保存到原始文件结构
     * @param {Array} updatedSpheres - 更新后的碰撞球数据
     * @returns {Object} 更新后的完整配置对象
     */
    updateOriginalConfig(updatedSpheres) {
        if (!this._parsedConfig) {
            console.warn('ConfigManager: 没有原始配置数据可更新');
            return null;
        }

        // 更新原始配置中的碰撞球数据
        this._updateConfigWithSpheres(this._parsedConfig, updatedSpheres);
        
        
        // 更新解析后的碰撞球数据
        this._parsedCollisionSpheres = updatedSpheres;

        console.log("this._parsedCollisionSpheres：" , this._parsedCollisionSpheres);
        
        console.log('ConfigManager: 原始配置数据已更新');
        return this._parsedConfig;
    }

    /**
     * 将碰撞球数据更新到原始配置结构中
     * @param {Object} config - 原始配置对象
     * @param {Array} spheres - 更新后的碰撞球数据
     */
    _updateConfigWithSpheres(config, spheres) {
        // 遍历所有链接
        spheres.forEach(linkData => {
            const linkName = linkData.link;
            const updatedSpheres = linkData.spheres || [];
            
            // 智能查找对应的链接键名
            let matchedKey = null;
            for (const key in config) {
                // 如果键名完全匹配或包含链接名称
                if (key === linkName || key.includes(linkName)) {
                    matchedKey = key;
                    break;
                }
            }
            
            if (matchedKey && config[matchedKey]) {
                console.log(`找到匹配的链接键名: ${linkName} -> ${matchedKey}`);
                
                // 遍历所有层级和细分
                for (const levelKey in config[matchedKey]) {
                    const level = config[matchedKey][levelKey];
                    for (const subKey in level) {
                        const subdivision = level[subKey];
                        if (subdivision.spheres && Array.isArray(subdivision.spheres)) {
                            // 更新球体数据
                            subdivision.spheres = updatedSpheres.map((sphere, index) => {
                                if (index < subdivision.spheres.length) {
                                    return {
                                        ...subdivision.spheres[index],
                                        origin: sphere.origin,
                                        radius: sphere.radius
                                    };
                                }
                                return sphere;
                            });
                        }
                    }
                }
            } else {
                console.warn(`未找到匹配的链接键名: ${linkName}`);
            }
        });
    }



    /**
     * 清除所有配置数据
     */
    clear() {
        this._parsedConfig = null;
        this._parsedCollisionSpheres = null;
        this._originalFileName = null;
        this._originalFileContent = null;
        console.log('ConfigManager: 配置数据已清除');
    }

    /**
     * 检查是否有配置数据
     * @returns {boolean}
     */
    hasConfig() {
        return this._parsedConfig !== null && this._parsedCollisionSpheres !== null;
    }
}

// 创建全局实例
export const configManager = ConfigManager.getInstance();
