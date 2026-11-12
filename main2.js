import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// =========================
// 1. 基本設定
// =========================

const container = document.getElementById("canvas-container");

// =========================
// 画面全体に広がる魔法の光
// =========================
const flashStyle = document.createElement("style");

flashStyle.textContent = `
    #magic-flash {
        position: fixed;
        width: 200vmax;
        height: 200vmax;
        left: 50%;
        top: 50%;
        z-index: 9999;
        pointer-events: none;
        opacity: 0;
        border-radius: 50%;
        transform: translate(-50%, -50%) scale(0.05);

        background: radial-gradient(
        circle,
        rgba(255, 255, 255, 1) 0%,
        rgba(255, 255, 255, 1) 30%,
        rgba(255, 255, 255, 0.98) 50%,
        rgba(255, 255, 255, 0.8) 65%,
        rgba(255, 255, 255, 0.3) 80%,
        rgba(255, 255, 255, 0) 100%
        );
    }

    #magic-flash.active {
        animation: magic-flash-expand 3.5s linear forwards;
    }

    @keyframes magic-flash-expand {
        0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.05);
        }

        25% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.2);
        }

        65% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.2);
        }

        100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(1.2);
        }
    }
}
`;

document.head.appendChild(flashStyle);

const magicFlash = document.createElement("div");
magicFlash.id = "magic-flash";
document.body.appendChild(magicFlash);

// 光を画面全体に広げる
function playMagicFlash() {
    magicFlash.classList.remove("active");

    // アニメーションを最初から再生する
    void magicFlash.offsetWidth;

    magicFlash.classList.add("active");
}

// シーン
const scene = new THREE.Scene();
scene.background = null;

// カメラ
const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);

camera.position.set(0, 15, 25);

// レンダラー


const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true
});

renderer.setClearColor(0x000000, 0);
renderer.setClearAlpha(0);

renderer.setSize(window.innerWidth, window.innerHeight);

renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, 2)
);

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

container.appendChild(renderer.domElement);

// =========================
// 環境反射の設定
// =========================

const pmremGenerator = new THREE.PMREMGenerator(renderer);

const environment = new RoomEnvironment();

const envMap = pmremGenerator.fromScene(environment).texture;

// シーンに環境反射を設定
scene.environment = envMap;

// PMREMGeneratorを解放
pmremGenerator.dispose();


// =========================
// 2. ライトの設定
// =========================

// 環境光
const ambientLight = new THREE.AmbientLight(
    0xffffff,
    1.0
);

scene.add(ambientLight);

// 平行光源
const dirLight = new THREE.DirectionalLight(
    0xffffff,
    1.5
);

dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;

// 影の設定
dirLight.shadow.mapSize.set(2048, 2048);

dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 50;

const d = 15;

dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;

dirLight.shadow.bias = -0.0001;
dirLight.shadow.normalBias = 0.02;

scene.add(dirLight);


// =========================
// 3. カメラ操作の設定
// =========================

const controls = new OrbitControls(
    camera,
    renderer.domElement
);

controls.enableDamping = true;
controls.dampingFactor = 0.05;

// カメラが地面より下に潜らないようにする
controls.maxPolarAngle = Math.PI / 2 - 0.05;


// =========================
// 4. GLBモデルの読み込み
// =========================

const dracoLoader = new DRACOLoader();

dracoLoader.setDecoderPath(
    "https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/"
);

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

// =========================
// transmission → 通常の半透明に置き換え
// =========================
// transmission（光が屈折するガラス）のマテリアルがあると、Three.jsは
// ガラスの「向こう側」を表現するために、毎フレーム不透明なオブジェクトを
// すべて別のテクスチャにもう一度描画する。
// そのため、シーン全体のジオメトリが毎フレーム2回描画されてしまう。
// 通常の半透明（アルファブレンド）なら見た目はほぼ同じで、描画は1回で済む。
function replaceTransmission(root) {
    root.traverse((child) => {
        if (!child.isMesh) return;

        const materials = Array.isArray(child.material)
            ? child.material
            : [child.material];

        materials.forEach((material) => {
            if (material.transmission > 0) {
                material.transmission = 0;
                material.transparent = true;
                // 透明度（0.35）は見た目に合わせて調整可能
                material.opacity = Math.min(material.opacity, 0.35);
                material.depthWrite = false;
            }
        });
    });
}

const loadingEl = document.getElementById("loading");
const loadingProgressEl = document.getElementById("loading-progress");

// ゲージを更新する関数
function updateLoadingProgress(percent) {
    loadingProgressEl.style.width = `${percent}%`;
}

// ファイル名
const chestUrl = "./box.glb";
const modelUrl = "./last_compressed.glb";

// アニメーション用の変数
let treasure = null;
let treasureMixer = null;
let treasureAction = null;

let mainModel = null;
let mainModelSize = null;

let chestLoaded = false;
let modelLoaded = false;
let animationStarted = false;
let finished = false;
// =========================
// 宝箱の光の演出
// =========================

// "burst" = 光がブワッと広がる
// "sparkles" = キラキラした粒子
// "both" = 両方
const magicMode = "sparkles";

// 光の演出用
let magicGroup = null;
let magicGlow = null;
let magicLight = null;
let magicParticles = [];
let magicElapsed = 0;
let magicStarted = false;

// 光の演出を作る
function createMagicEffect() {
    magicGroup = new THREE.Group();

    // 宝箱の中から光る球体
    const glowGeometry = new THREE.SphereGeometry(0.5, 32, 24);

    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffdf78,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    magicGlow = new THREE.Mesh(glowGeometry, glowMaterial);
    magicGlow.scale.set(1.2, 1.2, 1.2);
    magicGlow.position.set(0, 0.5, 0);

    magicGroup.add(magicGlow);

    // 宝箱の中を照らす光
    magicLight = new THREE.PointLight(
        0xffd76a,
        0,
        12
    );

    magicLight.position.set(0, 1.5, 0);

    magicGroup.add(magicLight);

    // キラキラした粒子
    const particleMaterial = new THREE.MeshBasicMaterial({
        color: 0xffe8a3,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending
    });

    const particleGeometry = new THREE.SphereGeometry(
        0.045,
        8,
        6
    );

    for (let i = 0; i < 24; i++) {
        const particle = new THREE.Mesh(
            particleGeometry,
            particleMaterial.clone()
        );

        particle.position.set(
            (Math.random() - 0.5) * 1.5,
            0.5 + Math.random() * 1.5,
            (Math.random() - 0.5) * 1.5
        );

        particle.userData.startY = particle.position.y;
        particle.userData.speed = 0.4 + Math.random() * 0.8;
        particle.userData.phase = Math.random() * Math.PI * 2;

        magicGroup.add(particle);
        magicParticles.push(particle);
    }

    // 最初は光を表示しない
    magicGlow.visible = true;

    scene.add(magicGroup);
}

// 光の演出を開始
function startMagicEffect() {
    if (!magicGroup) return;

    magicStarted = true;
    magicElapsed = 0;

    playMagicFlash();

    // 円形の光は表示しない
    if (magicGlow) {
        magicGlow.visible = false;
    }

    // 宝箱の中から黄色い光を広げる
    if (magicLight) {
        magicLight.visible = true;
        magicLight.color.set(0xffd76a);
        magicLight.intensity = 8;
        magicLight.distance = 8;
        magicLight.decay = 2;
    }

    // キラキラした粒を表示
    magicParticles.forEach((particle) => {
        particle.visible = true;
        particle.material.opacity = 1;
    });

    console.log("宝箱の光の演出を開始しました");
}

// 光のアニメーションを更新
function updateMagicEffect(delta) {
    if (!magicStarted || !magicGroup) return;

    magicElapsed += delta;

    // 1秒かけて演出を消す
    const duration = 1;
    const progress = Math.min(magicElapsed / duration, 1);
    const fade = 1 - progress;

    // 円形の光は使わず、光源だけを徐々に弱める
    if (magicGlow) {
        magicGlow.visible = false;
    }

    if (magicLight) {
        magicLight.intensity = 8 * fade;
    }

    // 粒子がふわふわ上に舞い上がる
    magicParticles.forEach((particle) => {
        particle.position.y += particle.userData.speed * delta;

        particle.position.x +=
            Math.sin(magicElapsed * 2 + particle.userData.phase)
            * delta * 0.2;

        particle.position.z +=
            Math.cos(magicElapsed * 1.5 + particle.userData.phase)
            * delta * 0.15;

        particle.material.opacity = fade;

        // 上まで行った粒子は下に戻す
        if (particle.position.y > 3) {
            particle.position.y = particle.userData.startY;
            particle.position.x = (Math.random() - 0.5) * 1.5;
            particle.position.z = (Math.random() - 0.5) * 1.5;
        }
    });

    // 演出が終わったら光源を消す
    if (progress >= 1) {
        magicLight.visible = false;
        magicParticles.forEach((particle) => {
            particle.visible = false;
        });
        magicStarted = false;
    }
}
// カメラの初期位置を保存
const initialCameraPosition = camera.position.clone();

// 宝箱の表示位置を調整する関数
function prepareModel(model) {
    const box = new THREE.Box3().setFromObject(model);

    const center = box.getCenter(new THREE.Vector3());

    // モデルを中央に配置し、地面をY=0に合わせる
    model.position.x -= center.x;
    model.position.y -= box.min.y;
    model.position.z -= center.z;

    // メッシュの影を設定
    model.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            if (child.material) {
                child.material.depthWrite = true;
            }

            if (
                child.name.includes("Circle") ||
                child.name.includes("BézierCurve")
            ) {
                child.receiveShadow = false;
            }
        }
    });

    return box.getSize(new THREE.Vector3());
}

// カメラをモデルに合わせる関数
function fitCamera(size) {
    const maxDim = Math.max(size.x, size.y, size.z);

    const distance =
        (maxDim / (2 * Math.tan(
            THREE.MathUtils.degToRad(camera.fov / 2)
        ))) * 1.5;

    camera.position.set(
        0,
        size.y * 0.7 + distance * 0.1,
        distance
    );

    controls.target.set(0, size.y / 2, 0);
    controls.update();
}

// 宝箱のアニメーションが終わったら、メインモデルを表示
function showMainModel() {
    if (finished || !mainModel) return;

    finished = true;

    // 光が画面いっぱいに広がるまで待つ
    const waitTime = magicStarted ? 800 : 0;

    setTimeout(() => {

        // 宝箱を削除
        if (treasure) {
            scene.remove(treasure);
        }

        // 光の粒をすべて消す
        magicParticles.forEach((particle) => {
            particle.visible = false;
            particle.material.opacity = 0;
        });

        // 光源も消す
        if (magicLight) {
            magicLight.visible = false;
            magicLight.intensity = 0;
        }

        // ミニチュアハウスを表示
        scene.add(mainModel);

        // カメラを初期位置に戻す
        camera.position.copy(initialCameraPosition);

        controls.target.set(
            0,
            mainModelSize.y / 2,
            0
        );

        controls.update();

        // Loadingの文字を削除
        loadingEl.remove();

        // 光のアニメーションが終わってから演出を片付ける
        setTimeout(() => {
            if (magicGroup) {
                scene.remove(magicGroup);

                magicGroup.traverse((child) => {
                    if (child.isMesh) {
                        child.geometry.dispose();

                        if (Array.isArray(child.material)) {
                            child.material.forEach((material) => {
                                material.dispose();
                            });
                        } else {
                            child.material.dispose();
                        }
                    }
                });

                magicGroup = null;
                magicParticles = [];
            }
        }, 500);

    }, waitTime);
}
// 両方のモデルが読み込まれたらアニメーション開始
function startTreasureAnimation() {
    if (!chestLoaded || !modelLoaded || animationStarted) {
        return;
    }

    animationStarted = true;

    // フタが開き始めたらLoadingを消す
    loadingEl.classList.add("hidden");

    // アニメーションがない場合はそのまま切り替える
    if (!treasureAction) {
        showMainModel();
        return;
    }

    // 蓋を1回だけ開く
    treasureAction.reset();
    treasureAction.setLoop(THREE.LoopOnce, 1);
    treasureAction.clampWhenFinished = true;
    treasureAction.play();

    // フタが少し開いてから光を出す
    console.log("光のタイマーを設定します");

    setTimeout(() => {
        console.log("450ミリ秒経過しました");
        startMagicEffect();
    }, 450);
}


// -------------------------
// ピラミッドと6個の宝箱の読み込み
// -------------------------

// GLBファイル名
const pyramidUrl = "./pyramid.glb";

const chestUrls = [
    "./box1_compressed.glb",
    "./box2_compressed.glb",
    "./box3_compressed.glb",
    "./box4_compressed.glb",
    "./box5_compressed.glb",
    "./box6_compressed.glb"
];

// ミニチュアハウスのファイル名
const roomUrls = [
    "./tableset_compressed.glb",
    "./bathroom_compressed.glb",
    "./redroom_compressed.glb",
    "./gameroom_compressed.glb",
    "./kitchen_compressed.glb",
    "./living_compressed.glb"
];

// 宝箱の配置場所
// x = 左右、y = 高さ、z = 前後
const chestPositions = [
    { x: -3, y: 1.5, z: 1.5, angle: -20 },
    { x:  0, y: 1.5, z: 1.5, angle: -20 },
    { x:  3, y: 1.5, z: 1.5, angle: -20 },

    { x: -1.5, y: 3.5, z: 0, angle: -20 },
    { x:  1.5, y: 3.5, z: 0, angle: -20 },

    { x:  0, y: 5.5, z: -1.5, angle: -20 }
];

const roomOffsets = [
    { x: 0, y: -2, z: 0 }, // 1部屋目
    { x: 0, y: 0, z: 0 }, // 2部屋目
    { x: 0, y: 0, z: 0 }, // 3部屋目
    { x: 0, y: 0, z: 0 }, // 4部屋目
    { x: 0, y: 0, z: 0 }, // 5部屋目
    { x: 0, y: 0, z: 0 }  // 6部屋目
];

// 宝箱と土台の管理
const chestRecords = [];
let platformRecords = [];

let isOpening = false;

// ミニチュアハウスの読み込みを重複させないための配列
const roomPromises = new Array(6);

// 少し待つための関数
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ピラミッド内の6個のCubeを取得する
function findPlatforms(pyramid) {

    const cubes = [];

    pyramid.updateMatrixWorld(true);

    pyramid.traverse((child) => {
        if (child.isMesh && child.name.startsWith("Cube")) {
            cubes.push(child);
        }
    });

    console.log("見つかったCubeの数:", cubes.length);

    const unusedCubes = [...cubes];

    // 宝箱の位置に一番近いCubeを対応させる
    return chestPositions.map((pos) => {

        let nearestIndex = -1;
        let nearestDistance = Infinity;

        unusedCubes.forEach((cube, index) => {

            const box = new THREE.Box3().setFromObject(cube);
            const center = box.getCenter(new THREE.Vector3());

            const distance =
                Math.pow(center.x - pos.x, 2) +
                Math.pow(center.z - pos.z, 2);

            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = index;
            }
        });

        if (nearestIndex === -1) {
            console.error("対応するCubeが見つかりません");
            return null;
        }

        const cube = unusedCubes.splice(nearestIndex, 1)[0];

        return cube;
    });
}

// 全体をまとめるグループ
const displayGroup = new THREE.Group();
scene.add(displayGroup);

// 読み込み完了数
let loadedCount = 0;
const totalCount = 7;

function updateModelProgress() {
    loadedCount++;

    const percent = Math.round(
        (loadedCount / totalCount) * 100
    );

    updateLoadingProgress(percent);
}

// ミニチュアハウスを読み込む
function loadRoom(index) {

    if (!roomPromises[index]) {

        roomPromises[index] = loader.loadAsync(roomUrls[index])
            .then(gltf => {
                // ガラスのマテリアルを軽量な半透明に置き換え
                replaceTransmission(gltf.scene);
                return gltf.scene;
            });
    }

    return roomPromises[index];
}


// 宝箱のアニメーションを再生
function playChestAnimation(record) {

    // アニメーションがない場合
    if (!record.action) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {

        const mixer = record.mixer;
        const action = record.action;

        const onFinished = (event) => {

            if (event.action === action) {
                mixer.removeEventListener("finished", onFinished);
                resolve();
            }
        };

        mixer.addEventListener("finished", onFinished);

        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.paused = false;
        action.play();
    });
}


// 宝箱をクリックしたときの処理
async function openChest(index) {

    const record = chestRecords[index];

    // すでに開いている、または別の宝箱を開いている場合
    if (!record || record.opened || isOpening) {
        return;
    }

    isOpening = true;

    try {

        // ミニチュアハウスの読み込みと宝箱のアニメーションを同時に開始
        const [room] = await Promise.all([
            loadRoom(index),
            playChestAnimation(record)
        ]);

        // 魔法の光を再生
        playMagicFlash();

        // 光が画面を覆うまで待つ
        await wait(1200);

        // 対応するCubeを取得
        const platform = platformRecords[index];

        if (!platform) {
            throw new Error("対応する土台が見つかりません");
        }

        // Cubeの現在の位置と大きさを取得
        const platformBox = new THREE.Box3().setFromObject(platform);

        const platformCenter = platformBox.getCenter(
            new THREE.Vector3()
        );

        // 土台の上面の高さ
        const platformTop = platformBox.max.y;

        // 宝箱を削除
        displayGroup.remove(record.root);

        // 土台のCubeを削除
        platform.parent.remove(platform);

        // ミニチュア全体の位置を調整
        room.position.x += 0;
        room.position.y += 1;
        room.position.z += 1.5;

        room.updateMatrixWorld(true);

        // ミニチュアハウスを表示
        displayGroup.add(room);

        // 開封済みにする
        record.opened = true;

        console.log(`宝箱${index + 1}を開きました！`);

    } catch (error) {

        console.error("宝箱を開く処理に失敗しました:", error);

    } finally {

        isOpening = false;
    }
}


// ピラミッドと6個の宝箱の読み込み
async function loadDisplay() {

    try {

        // ① ピラミッドを読み込む
        const pyramidGLTF = await loader.loadAsync(pyramidUrl);

        const pyramid = pyramidGLTF.scene;

        prepareModel(pyramid);

        displayGroup.add(pyramid);

        // Cubeを6個取得して対応付け
        platformRecords = findPlatforms(pyramid);

        updateModelProgress();


        // ② 宝箱を6個読み込む
        const chestPromises = chestUrls.map(
            async (url, index) => {

                const gltf = await loader.loadAsync(url);

                const chest = gltf.scene;

                // ガラスのマテリアルを軽量な半透明に置き換え
                replaceTransmission(chest);

                // 宝箱の光沢
                chest.traverse((child) => {

                    if (!child.isMesh) return;

                    const materials = Array.isArray(child.material)
                        ? child.material
                        : [child.material];

                    materials.forEach((material) => {

                        if (material.isMeshStandardMaterial) {
                            material.envMapIntensity = 0.3;
                        }

                    });
                });

                // 宝箱の大きさ
                chest.scale.setScalar(2);

                // 中央と底面を基準にする
                prepareModel(chest);

                // 配置
                const pos = chestPositions[index];

                chest.position.set(
                    pos.x,
                    pos.y,
                    pos.z
                );

                chest.rotation.y = THREE.MathUtils.degToRad(
                    pos.angle ?? 0
                );

                // アニメーションを準備
                const mixer = new THREE.AnimationMixer(chest);

                let action = null;

                if (gltf.animations.length > 0) {

                    action = mixer.clipAction(gltf.animations[0]);

                    // 最初は閉じた状態で待機
                    action.play();
                    action.paused = true;
                }

                chest.userData.chestIndex = index;

                // 宝箱を追加
                displayGroup.add(chest);

                // 宝箱の情報を保存
                chestRecords[index] = {
                    root: chest,
                    mixer: mixer,
                    action: action,
                    opened: false
                };

                updateModelProgress();
            }
        );

        await Promise.all(chestPromises);


        // ③ 全体の大きさを取得
        const box = new THREE.Box3().setFromObject(displayGroup);

        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // ④ カメラを全体に合わせる
        const maxDim = Math.max(
            size.x,
            size.y,
            size.z
        );

        const distance =
            (maxDim / (2 * Math.tan(
                THREE.MathUtils.degToRad(camera.fov / 2)
            ))) * 1.5;

        camera.position.set(
            center.x + distance * 0.2,
            center.y + distance * 0.35,
            center.z + distance
        );

        controls.target.copy(center);
        controls.update();

        // ⑤ 読み込み完了
        loadingEl.remove();

        console.log("ピラミッドと宝箱6個の読み込み完了！");

    } catch (error) {

        console.error("モデルの読み込みに失敗しました:", error);

        loadingEl.innerText =
            "モデルの読み込みに失敗しました。";

        loadingEl.style.color = "#ff6b6b";
    }
}


// 読み込み開始
loadDisplay();

// =========================
// 宝箱のクリック判定
// =========================

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

let pointerStartX = 0;
let pointerStartY = 0;

// マウス・タッチを押した位置
renderer.domElement.addEventListener("pointerdown", (event) => {

    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
});


// マウス・タッチを離した位置
renderer.domElement.addEventListener("pointerup", (event) => {

    // カメラ操作で動かした場合はクリックしない
    const moveX = Math.abs(event.clientX - pointerStartX);
    const moveY = Math.abs(event.clientY - pointerStartY);

    if (moveX > 5 || moveY > 5) {
        return;
    }

    if (isOpening) return;

    const rect = renderer.domElement.getBoundingClientRect();

    pointer.x =
        ((event.clientX - rect.left) / rect.width) * 2 - 1;

    pointer.y =
        -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);

    // まだ開いていない宝箱だけを判定
    const unopenedChests = chestRecords
        .filter(record => record && !record.opened)
        .map(record => record.root);

    const hits = raycaster.intersectObjects(
        unopenedChests,
        true
    );

    if (hits.length === 0) return;

    // クリックされたメッシュから宝箱本体を探す
    let target = hits[0].object;

    while (
        target &&
        target.userData.chestIndex === undefined
    ) {
        target = target.parent;
    }

    // 宝箱の番号を取得
    if (target) {
        openChest(target.userData.chestIndex);
    }
});

// =========================
// 5. 画面サイズの変更に対応
// =========================

window.addEventListener("resize", onWindowResize);

function onWindowResize() {
    camera.aspect =
        window.innerWidth / window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );
}


// =========================
// 6. アニメーション
// =========================

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    // 6個の宝箱のアニメーションを更新
    chestRecords.forEach((record) => {

        if (record && record.mixer) {
            record.mixer.update(delta);
        }

    });

    // カメラ操作を更新
    controls.update();

    // 描画
    renderer.render(scene, camera);
}

// アニメーション開始
animate();