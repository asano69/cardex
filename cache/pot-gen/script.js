let scene, camera, renderer, pottery;
let potteryMaterial;
let points = [];
let isDrawing = false;
const canvasSize = 500;

const sketch = (p) => {
  p.setup = () => {
    p.createCanvas(canvasSize, canvasSize).style("position", "absolute");
    initThreeJS();
  };

  p.draw = () => {
    if (isDrawing) {
      p.background(0, 0, 244);
      p.beginShape();
      p.noFill();
      p.stroke(255);
      for (let v of points) {
        p.vertex(v.x + canvasSize / 2, v.y + canvasSize / 2);
      }
      p.endShape();
    }
  };

  p.mouseDragged = () => {
    if (isDrawing) {
      let x = p.mouseX - canvasSize / 2;
      let y = p.mouseY - canvasSize / 2;
      points.push(p.createVector(x, y));
    }
  };

  p.mousePressed = () => {
    isDrawing = true;
    points = [];
  };

  p.mouseReleased = () => {
    isDrawing = false;
    create3DPottery();
  };
};

new p5(sketch);

function initThreeJS() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(90, canvasSize / canvasSize, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(canvasSize, canvasSize);
  renderer.domElement.style.position = "absolute";
  document.body.appendChild(renderer.domElement);

  camera.position.set(0, 0, 6);

  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(
    "clay.JPG",
    function (texture) {
      potteryMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        side: THREE.DoubleSide,
      });
      console.log("texture loaded");
    },
    undefined,
    function (error) {
      console.error("texture not loaded:", error);
    },
  );

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(0, 1, 0);
  scene.add(directionalLight);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambientLight);

  const pointLight = new THREE.PointLight(0xffffff, 1, 100);
  pointLight.position.set(0, 5, 10);
  scene.add(pointLight);

  animate();
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
  if (pottery) {
    pottery.rotation.y += 0.01;
  }
}

function create3DPottery() {
  let minY = Math.min(...points.map((p) => p.y));
  let maxY = Math.max(...points.map((p) => p.y));
  let centerY = (minY + maxY) / 2;

  let adjustedPoints = points.map((p) => {
    let distance = p.x / 75;
    let height = -(p.y - centerY) / 100 - 1.5;
    return new THREE.Vector2(distance, height);
  });

  if (adjustedPoints.length > 0) {
    adjustedPoints.push(
      new THREE.Vector2(0, adjustedPoints[adjustedPoints.length - 1].y),
    );
  }

  let geometry = new THREE.LatheGeometry(adjustedPoints, 20);
  if (pottery) scene.remove(pottery);

  if (potteryMaterial) {
    pottery = new THREE.Mesh(geometry, potteryMaterial);
  } else {
    console.log("texture material not loaded, use default material");
    pottery = new THREE.Mesh(
      geometry,
      new THREE.MeshNormalMaterial({ side: THREE.DoubleSide }),
    );
  }

  scene.add(pottery);
}
