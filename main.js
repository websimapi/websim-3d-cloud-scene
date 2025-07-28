import * as THREE from 'three';

class CloudScene {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ 
            canvas: document.getElementById('cloudCanvas'),
            antialias: true,
            alpha: true 
        });
        
        this.clouds = [];
        this.cloudMaterials = [];
        this.time = 0;
        this.windSpeed = 0.5;
        this.density = 1.0;
        this.timeOfDay = 0.7;
        
        this.keys = {};
        this.mouse = { x: 0, y: 0 };
        this.mousePressed = false;
        
        this.init();
        this.setupControls();
        this.setupUI();
        this.animate();
    }
    
    init() {
        // Setup renderer
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x87CEEB, 1);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        // Setup camera
        this.camera.position.set(0, 20, 50);
        this.camera.lookAt(0, 0, 0);
        
        // Create sky gradient
        this.createSkyGradient();
        
        // Setup lighting
        this.setupLighting();
        
        // Create clouds
        this.createClouds();
        
        // Add ground reference
        this.createGround();
        
        window.addEventListener('resize', () => this.onWindowResize());
    }
    
    createSkyGradient() {
        const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
        const skyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x0077ff) },
                bottomColor: { value: new THREE.Color(0xffffff) },
                offset: { value: 33 },
                exponent: { value: 0.6 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + offset).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
                }
            `,
            side: THREE.BackSide
        });
        
        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.scene.add(sky);
    }
    
    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(ambientLight);
        
        // Directional light (sun)
        this.sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
        this.sunLight.position.set(100, 100, 50);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.scene.add(this.sunLight);
        
        // Volumetric light effect
        const volumetricLight = new THREE.DirectionalLight(0xffd700, 0.3);
        volumetricLight.position.set(-50, 50, -50);
        this.scene.add(volumetricLight);
    }
    
    createClouds() {
        // Create different cloud materials
        this.createCloudMaterials();
        
        // Generate cloud field
        for (let i = 0; i < 50; i++) {
            this.createCloudCluster(
                (Math.random() - 0.5) * 300,
                Math.random() * 60 + 20,
                (Math.random() - 0.5) * 300
            );
        }
    }
    
    createCloudMaterials() {
        // Volumetric cloud material with raymarching
        const volumetricCloudMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                density: { value: 1.0 },
                opacity: { value: 0.8 },
                lightDirection: { value: new THREE.Vector3(1, 1, 0.5).normalize() },
                cloudColor: { value: new THREE.Color(1.0, 1.0, 1.0) },
                shadowColor: { value: new THREE.Color(0.3, 0.3, 0.5) },
                cameraPosition: { value: new THREE.Vector3() }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                varying vec3 vLocalPosition;
                
                void main() {
                    vLocalPosition = position;
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform float density;
                uniform float opacity;
                uniform vec3 lightDirection;
                uniform vec3 cloudColor;
                uniform vec3 shadowColor;
                uniform vec3 cameraPosition;
                
                varying vec3 vWorldPosition;
                varying vec3 vLocalPosition;
                
                // Improved 3D noise function
                vec3 mod289(vec3 x) {
                    return x - floor(x * (1.0 / 289.0)) * 289.0;
                }
                
                vec4 mod289(vec4 x) {
                    return x - floor(x * (1.0 / 289.0)) * 289.0;
                }
                
                vec4 permute(vec4 x) {
                    return mod289(((x * 34.0) + 1.0) * x);
                }
                
                vec4 taylorInvSqrt(vec4 r) {
                    return 1.79284291400159 - 0.85373472095314 * r;
                }
                
                float snoise(vec3 v) {
                    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
                    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
                    
                    vec3 i = floor(v + dot(v, C.yyy));
                    vec3 x0 = v - i + dot(i, C.xxx);
                    
                    vec3 g = step(x0.yzx, x0.xyz);
                    vec3 l = 1.0 - g;
                    vec3 i1 = min(g.xyz, l.zxy);
                    vec3 i2 = max(g.xyz, l.zxy);
                    
                    vec3 x1 = x0 - i1 + C.xxx;
                    vec3 x2 = x0 - i2 + C.yyy;
                    vec3 x3 = x0 - D.yyy;
                    
                    i = mod289(i);
                    vec4 p = permute(permute(permute(
                        i.z + vec4(0.0, i1.z, i2.z, 1.0))
                        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
                    
                    float n_ = 0.142857142857;
                    vec3 ns = n_ * D.wyz - D.xzx;
                    
                    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
                    
                    vec4 x_ = floor(j * ns.z);
                    vec4 y_ = floor(j - 7.0 * x_);
                    
                    vec4 x = x_ * ns.x + ns.yyyy;
                    vec4 y = y_ * ns.x + ns.yyyy;
                    vec4 h = 1.0 - abs(x) - abs(y);
                    
                    vec4 b0 = vec4(x.xy, y.xy);
                    vec4 b1 = vec4(x.zw, y.zw);
                    
                    vec4 s0 = floor(b0) * 2.0 + 1.0;
                    vec4 s1 = floor(b1) * 2.0 + 1.0;
                    vec4 sh = -step(h, vec4(0.0));
                    
                    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
                    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
                    
                    vec3 p0 = vec3(a0.xy, h.x);
                    vec3 p1 = vec3(a0.zw, h.y);
                    vec3 p2 = vec3(a1.xy, h.z);
                    vec3 p3 = vec3(a1.zw, h.w);
                    
                    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
                    p0 *= norm.x;
                    p1 *= norm.y;
                    p2 *= norm.z;
                    p3 *= norm.w;
                    
                    vec4 m = max(0.6 - vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)), 0.0);
                    m = m * m;
                    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
                }
                
                // Fractal noise for cloud density
                float fbm(vec3 p) {
                    float value = 0.0;
                    float amplitude = 0.5;
                    float frequency = 1.0;
                    
                    for(int i = 0; i < 5; i++) {
                        value += amplitude * snoise(p * frequency);
                        amplitude *= 0.5;
                        frequency *= 2.0;
                    }
                    return value;
                }
                
                // Cloud density function
                float getCloudDensity(vec3 pos) {
                    vec3 animatedPos = pos + vec3(time * 0.1, time * 0.05, time * 0.08);
                    
                    // Base cloud shape
                    float baseShape = fbm(animatedPos * 0.1);
                    
                    // Detail layers
                    float detail1 = fbm(animatedPos * 0.3) * 0.5;
                    float detail2 = fbm(animatedPos * 0.6) * 0.25;
                    float detail3 = fbm(animatedPos * 1.2) * 0.125;
                    
                    float cloudDensity = baseShape + detail1 + detail2 + detail3;
                    cloudDensity = smoothstep(0.1, 0.8, cloudDensity) * density;
                    
                    // Distance falloff from center
                    float dist = length(pos) / 8.0;
                    cloudDensity *= smoothstep(1.0, 0.7, dist);
                    
                    return max(0.0, cloudDensity);
                }
                
                // Simple light scattering
                float henyeyGreenstein(float cosTheta, float g) {
                    float g2 = g * g;
                    return (1.0 - g2) / (4.0 * 3.14159 * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
                }
                
                void main() {
                    vec3 rayDir = normalize(vWorldPosition - cameraPosition);
                    vec3 rayStart = vLocalPosition;
                    
                    float stepSize = 0.1;
                    int numSteps = 64;
                    
                    float transmittance = 1.0;
                    vec3 scatteredLight = vec3(0.0);
                    
                    // Raymarching through the cloud volume
                    for(int i = 0; i < 64; i++) {
                        if(i >= numSteps) break;
                        
                        vec3 currentPos = rayStart + rayDir * float(i) * stepSize;
                        
                        // Get cloud density at current position
                        float cloudDensity = getCloudDensity(currentPos);
                        
                        if(cloudDensity > 0.01) {
                            // Light sampling
                            float lightRaySteps = 16.0;
                            float lightTransmittance = 1.0;
                            
                            for(int j = 0; j < 16; j++) {
                                vec3 lightPos = currentPos + lightDirection * float(j) * 0.2;
                                float lightDensity = getCloudDensity(lightPos);
                                lightTransmittance *= exp(-lightDensity * 0.1);
                            }
                            
                            // Phase function for scattering
                            float cosTheta = dot(rayDir, lightDirection);
                            float phase = mix(henyeyGreenstein(cosTheta, 0.3), henyeyGreenstein(cosTheta, -0.3), 0.7);
                            
                            // Add scattered light
                            vec3 lightContribution = cloudColor * lightTransmittance * phase * cloudDensity;
                            scatteredLight += lightContribution * transmittance * stepSize;
                            
                            // Update transmittance
                            transmittance *= exp(-cloudDensity * stepSize * 2.0);
                        }
                        
                        if(transmittance < 0.01) break;
                    }
                    
                    // Final color with atmospheric perspective
                    vec3 finalColor = scatteredLight;
                    float alpha = 1.0 - transmittance;
                    alpha *= opacity;
                    
                    // Add some ambient lighting to shadows
                    finalColor = mix(finalColor, shadowColor, (1.0 - alpha) * 0.1);
                    
                    gl_FragColor = vec4(finalColor, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        
        this.cloudMaterials = [volumetricCloudMaterial];
    }
    
    createCloudCluster(x, y, z) {
        const clusterSize = Math.random() * 2 + 1;
        const cluster = new THREE.Group();
        
        for (let i = 0; i < clusterSize; i++) {
            // Use box geometry for better volumetric rendering
            const cloudGeometry = new THREE.BoxGeometry(
                Math.random() * 12 + 8,
                Math.random() * 8 + 6,
                Math.random() * 12 + 8
            );
            
            const material = this.cloudMaterials[0].clone();
            const cloud = new THREE.Mesh(cloudGeometry, material);
            
            cloud.position.set(
                (Math.random() - 0.5) * 25,
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 25
            );
            
            cloud.scale.set(
                Math.random() * 0.6 + 0.8,
                Math.random() * 0.4 + 0.6,
                Math.random() * 0.6 + 0.8
            );
            
            // Random rotation for variety
            cloud.rotation.set(
                Math.random() * 0.5,
                Math.random() * Math.PI * 2,
                Math.random() * 0.5
            );
            
            cluster.add(cloud);
        }
        
        cluster.position.set(x, y, z);
        cluster.userData = {
            originalPosition: { x, y, z },
            windOffset: Math.random() * Math.PI * 2
        };
        
        this.clouds.push(cluster);
        this.scene.add(cluster);
    }
    
    createGround() {
        const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
        const groundMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x90EE90,
            transparent: true,
            opacity: 0.3
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -10;
        this.scene.add(ground);
    }
    
    setupControls() {
        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
        
        // Mouse controls
        document.addEventListener('mousedown', (e) => {
            this.mousePressed = true;
            document.body.style.cursor = 'grabbing';
        });
        
        document.addEventListener('mouseup', () => {
            this.mousePressed = false;
            document.body.style.cursor = 'default';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (this.mousePressed) {
                const deltaX = e.movementX * 0.002;
                const deltaY = e.movementY * 0.002;
                
                this.camera.rotation.y -= deltaX;
                this.camera.rotation.x -= deltaY;
                this.camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.camera.rotation.x));
            }
        });
    }
    
    setupUI() {
        const densitySlider = document.getElementById('density');
        const windSpeedSlider = document.getElementById('windSpeed');
        const timeOfDaySlider = document.getElementById('timeOfDay');
        
        densitySlider.addEventListener('input', (e) => {
            this.density = parseFloat(e.target.value);
            document.getElementById('densityValue').textContent = this.density.toFixed(1);
            this.updateCloudMaterials();
        });
        
        windSpeedSlider.addEventListener('input', (e) => {
            this.windSpeed = parseFloat(e.target.value);
            document.getElementById('windValue').textContent = this.windSpeed.toFixed(1);
        });
        
        timeOfDaySlider.addEventListener('input', (e) => {
            this.timeOfDay = parseFloat(e.target.value);
            document.getElementById('timeValue').textContent = this.timeOfDay.toFixed(2);
            this.updateLighting();
        });
    }
    
    updateCloudMaterials() {
        this.cloudMaterials.forEach(material => {
            material.uniforms.density.value = this.density;
        });
    }
    
    updateLighting() {
        const sunColor = new THREE.Color().lerpColors(
            new THREE.Color(0xff4500), // sunset
            new THREE.Color(0xffffff), // noon
            this.timeOfDay
        );
        this.sunLight.color = sunColor;
        this.sunLight.intensity = 0.5 + this.timeOfDay * 0.5;
        
        // Update sky color
        this.renderer.setClearColor(
            new THREE.Color().lerpColors(
                new THREE.Color(0x87CEEB), // light blue
                new THREE.Color(0x191970), // midnight blue
                1 - this.timeOfDay
            )
        );
    }
    
    handleMovement() {
        const speed = this.keys['ShiftLeft'] ? 2.0 : 0.5;
        const direction = new THREE.Vector3();
        
        this.camera.getWorldDirection(direction);
        const right = new THREE.Vector3().crossVectors(direction, this.camera.up).normalize();
        
        if (this.keys['KeyW']) {
            this.camera.position.addScaledVector(direction, speed);
        }
        if (this.keys['KeyS']) {
            this.camera.position.addScaledVector(direction, -speed);
        }
        if (this.keys['KeyA']) {
            this.camera.position.addScaledVector(right, -speed);
        }
        if (this.keys['KeyD']) {
            this.camera.position.addScaledVector(right, speed);
        }
        if (this.keys['Space']) {
            this.camera.position.y += speed;
        }
        if (this.keys['KeyC']) {
            this.camera.position.y -= speed;
        }
    }
    
    updateClouds() {
        this.clouds.forEach(cluster => {
            // Wind movement
            const windOffset = cluster.userData.windOffset + this.time * this.windSpeed * 0.1;
            cluster.position.x = cluster.userData.originalPosition.x + Math.sin(windOffset) * 10;
            cluster.position.z = cluster.userData.originalPosition.z + Math.cos(windOffset) * 5;
            
            // Gentle rotation
            cluster.rotation.y += 0.0005 * this.windSpeed;
            
            // Update individual cloud materials
            cluster.children.forEach(cloud => {
                if (cloud.material.uniforms) {
                    cloud.material.uniforms.time.value = this.time;
                    cloud.material.uniforms.cameraPosition.value.copy(this.camera.position);
                    cloud.material.uniforms.lightDirection.value.copy(this.sunLight.position).normalize();
                }
            });
        });
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        this.time += 0.016;
        
        this.handleMovement();
        this.updateClouds();
        
        this.renderer.render(this.scene, this.camera);
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// Initialize the cloud scene
new CloudScene();