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
        // Base cloud material
        const cloudMaterial1 = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                density: { value: 1.0 },
                opacity: { value: 0.8 }
            },
            vertexShader: `
                varying vec3 vPosition;
                varying vec3 vNormal;
                uniform float time;
                
                // Simple noise function
                float noise(vec3 p) {
                    return sin(p.x * 2.0 + time * 0.5) * sin(p.y * 1.5 + time * 0.3) * sin(p.z * 1.8 + time * 0.4) * 0.5 + 0.5;
                }
                
                void main() {
                    vPosition = position;
                    vNormal = normal;
                    
                    vec3 pos = position;
                    float n = noise(pos * 0.1) * 0.3;
                    pos += normal * n;
                    
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vPosition;
                varying vec3 vNormal;
                uniform float time;
                uniform float density;
                uniform float opacity;
                
                float noise(vec3 p) {
                    return sin(p.x * 3.0 + time * 0.2) * sin(p.y * 2.5 + time * 0.1) * sin(p.z * 2.8 + time * 0.15) * 0.5 + 0.5;
                }
                
                void main() {
                    vec3 lightDir = normalize(vec3(1.0, 1.0, 0.5));
                    float NdotL = dot(vNormal, lightDir) * 0.5 + 0.5;
                    
                    float n1 = noise(vPosition * 0.05);
                    float n2 = noise(vPosition * 0.1) * 0.5;
                    float n3 = noise(vPosition * 0.2) * 0.25;
                    
                    float totalNoise = (n1 + n2 + n3) * density;
                    totalNoise = smoothstep(0.3, 0.8, totalNoise);
                    
                    vec3 cloudColor = mix(vec3(0.9, 0.9, 1.0), vec3(1.0, 1.0, 1.0), NdotL);
                    cloudColor = mix(vec3(0.6, 0.6, 0.8), cloudColor, totalNoise);
                    
                    float alpha = totalNoise * opacity;
                    gl_FragColor = vec4(cloudColor, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.NormalBlending
        });
        
        // Wispy cloud material
        const cloudMaterial2 = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                density: { value: 0.7 },
                opacity: { value: 0.6 }
            },
            vertexShader: cloudMaterial1.vertexShader,
            fragmentShader: `
                varying vec3 vPosition;
                varying vec3 vNormal;
                uniform float time;
                uniform float density;
                uniform float opacity;
                
                float noise(vec3 p) {
                    return sin(p.x * 4.0 + time * 0.3) * sin(p.y * 3.5 + time * 0.2) * sin(p.z * 3.8 + time * 0.25) * 0.5 + 0.5;
                }
                
                void main() {
                    vec3 lightDir = normalize(vec3(1.0, 1.0, 0.5));
                    float NdotL = dot(vNormal, lightDir) * 0.5 + 0.5;
                    
                    float n1 = noise(vPosition * 0.08);
                    float n2 = noise(vPosition * 0.15) * 0.7;
                    float n3 = noise(vPosition * 0.3) * 0.4;
                    
                    float totalNoise = (n1 + n2 + n3) * density;
                    totalNoise = smoothstep(0.2, 0.9, totalNoise);
                    
                    vec3 cloudColor = mix(vec3(0.95, 0.95, 1.0), vec3(1.0, 1.0, 1.0), NdotL);
                    cloudColor = mix(vec3(0.7, 0.7, 0.9), cloudColor, totalNoise);
                    
                    float alpha = totalNoise * opacity * 0.8;
                    gl_FragColor = vec4(cloudColor, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        
        this.cloudMaterials = [cloudMaterial1, cloudMaterial2];
    }
    
    createCloudCluster(x, y, z) {
        const clusterSize = Math.random() * 3 + 2;
        const cluster = new THREE.Group();
        
        for (let i = 0; i < clusterSize; i++) {
            const cloudGeometry = new THREE.SphereGeometry(
                Math.random() * 8 + 4,
                16,
                12
            );
            
            const material = this.cloudMaterials[Math.floor(Math.random() * this.cloudMaterials.length)].clone();
            const cloud = new THREE.Mesh(cloudGeometry, material);
            
            cloud.position.set(
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 8,
                (Math.random() - 0.5) * 20
            );
            
            cloud.scale.set(
                Math.random() * 0.8 + 0.6,
                Math.random() * 0.6 + 0.4,
                Math.random() * 0.8 + 0.6
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

