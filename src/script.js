import * as THREE from 'three'
import { FlyControls } from 'three/examples/jsm/controls/FlyControls.js'
import * as dat from 'lil-gui'
import CANNON from 'cannon'

const canvas = document.querySelector('canvas.webgl')
const scene = new THREE.Scene()

/** Sizes */
const sizes = { width: window.innerWidth, height: window.innerHeight }

/** Camera */
const camera = new THREE.PerspectiveCamera(60, sizes.width / sizes.height, 0.1, 200)
camera.position.set(1, 5, 20)
scene.add(camera)

/** Renderer */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

/** Controls */
const controls = new FlyControls(camera, canvas)
controls.movementSpeed = 10
controls.rollSpeed = Math.PI / 8
controls.dragToLook = true
controls.autoForward = false

/** Lights */
scene.add(new THREE.AmbientLight(0xffffff, 0.5))
const dir = new THREE.DirectionalLight(0xffffff, 0.8)
dir.position.set(8, 10, 6)
dir.castShadow = true
scene.add(dir)

/** Cannon world */
const world = new CANNON.World()
world.gravity.set(0, -9.82, 0)

const defaultMat = new CANNON.Material('default')
const defaultContact = new CANNON.ContactMaterial(defaultMat, defaultMat, {
  friction: 0.4,
  restitution: 0.2
})
world.defaultContactMaterial = defaultContact

/** Floor platform */
const floorSize = 20
const floorHeight = 1

// THREE visual floor
const floor = new THREE.Mesh(
  new THREE.BoxGeometry(floorSize, floorHeight, floorSize),
  new THREE.MeshStandardMaterial({ color: 0x333333 })
)
floor.position.y = -floorHeight / 2
floor.receiveShadow = true
scene.add(floor)

// Cannon floor body
const floorShape = new CANNON.Box(new CANNON.Vec3(floorSize / 2, floorHeight / 2, floorSize / 2))
const floorBody = new CANNON.Body({
  mass: 0,
  shape: floorShape,
  position: new CANNON.Vec3(0, -floorHeight / 2, 0),
  material: defaultMat
})
world.addBody(floorBody)

/** Target box and projectiles */
const objectsToUpdate = []

function createTargetBox(x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshStandardMaterial({ color: 0xdd4444 })
  )
  mesh.castShadow = true
  mesh.position.set(x, y, z)
  scene.add(mesh)

  const body = new CANNON.Body({
    mass: 4,
    shape: new CANNON.Box(new CANNON.Vec3(1, 1, 1)),
    position: new CANNON.Vec3(x, y, z),
    material: defaultMat
  })
  world.addBody(body)

  objectsToUpdate.push({ mesh, body })
}

createTargetBox(1, 1, 5)

/** Shoot projectile */
function shootProjectile() {
  const radius = 0.25
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 18, 18),
    new THREE.MeshStandardMaterial({ color: 0x00ff99 })
  )
  mesh.castShadow = true
  scene.add(mesh)

  const body = new CANNON.Body({ mass: 1, shape: new CANNON.Sphere(radius), material: defaultMat })

  const camPos = new THREE.Vector3()
  camera.getWorldPosition(camPos)
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize()
  const spawn = camPos.clone().add(forward.clone().multiplyScalar(1.5))
  body.position.set(spawn.x, spawn.y, spawn.z)
  world.addBody(body)

  const impulse = new CANNON.Vec3(forward.x * 25, forward.y * 25, forward.z * 25)
  body.applyImpulse(impulse, body.position)

  objectsToUpdate.push({ mesh, body })
}

/** Create cube */
function createCube(x, y, z, size = 1, color = 0x44aaff) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshStandardMaterial({ color })
  )
  mesh.castShadow = true
  mesh.position.set(x, y, z)
  scene.add(mesh)

  const body = new CANNON.Body({
    mass: 2,
    shape: new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2)),
    position: new CANNON.Vec3(x, y, z),
    material: defaultMat
  })
  world.addBody(body)

  objectsToUpdate.push({ mesh, body })
}

/** GUI */
const gui = new dat.GUI()

const cubeParams = {
  size: 1,
  color: '#44aaff',
  randomizePosition: true,
  addCube: () => {
    // Generate random position if enabled
    const x = cubeParams.randomizePosition ? (Math.random() - 0.5) * 20 : 0
    const z = cubeParams.randomizePosition ? (Math.random() - 0.5) * 20 : 0
    const y = cubeParams.randomizePosition ? Math.random() * 5 + 2 : 2

    createCube(x, y, z, cubeParams.size, cubeParams.color)
  }
}

gui.add(cubeParams, 'size', 0.5, 5, 0.1).name('Cube Size')
gui.addColor(cubeParams, 'color').name('Cube Color')
gui.add(cubeParams, 'randomizePosition').name('Random Position')
gui.add(cubeParams, 'addCube').name('🟦 Add Cube')


/** Controls */
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') shootProjectile()
})

/** Resize */
window.addEventListener('resize', () => {
  sizes.width = window.innerWidth
  sizes.height = window.innerHeight
  camera.aspect = sizes.width / sizes.height
  camera.updateProjectionMatrix()
  renderer.setSize(sizes.width, sizes.height)
})

/** Animate */
const clock = new THREE.Clock()
let prevTime = 0

function animate() {
  const elapsed = clock.getElapsedTime()
  const delta = elapsed - prevTime
  prevTime = elapsed

  world.step(1 / 60, delta, 3)

  for (let i = objectsToUpdate.length - 1; i >= 0; i--) {
    const obj = objectsToUpdate[i]
    obj.mesh.position.copy(obj.body.position)
    obj.mesh.quaternion.copy(obj.body.quaternion)

    // Remove if it falls off the floor (e.g. Y < -50)
    if (obj.body.position.y < -50) {
      world.removeBody(obj.body)
      scene.remove(obj.mesh)
      objectsToUpdate.splice(i, 1)
    }
  }

  controls.update(delta)
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}
animate()
