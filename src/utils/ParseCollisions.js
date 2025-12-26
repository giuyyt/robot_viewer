export function parseCollisionSpheres(data) {
    const result = [];

    for (const [linkKey, linkValue] of Object.entries(data)) {
        // 1️⃣ 提取 link 名字（:: 前）
        const linkName = linkKey.split("::")[0];

        let finestSpheres = [];
        let maxSphereCount = -1;

        // 2️⃣ 遍历层级（如 "8"）
        for (const level of Object.values(linkValue)) {
            // 遍历 subdivision（如 "0", "1"）
            for (const sub of Object.values(level)) {
                if (Array.isArray(sub.spheres)) {
                    if (sub.spheres.length > maxSphereCount) {
                        maxSphereCount = sub.spheres.length;
                        finestSpheres = sub.spheres;
                    }
                }
            }
        }

        result.push({
            link: linkName,
            spheres: finestSpheres
        });
    }

    return result;
}


// CommonJS fallback so Node scripts using require(...) still work
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseCollisionSpheres };
}
