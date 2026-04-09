let hands = null;
let activeMpCamera = null;
export let handL = null;
export let handR = null;

const videoElem = document.getElementById('webcam');
const camSelect = document.getElementById('camSelect');
const statusMsg = document.getElementById('statusMsg');

export function initTracker() {
  hands = new window.Hands({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5
  });

  hands.onResults((results) => {
    handL = null; handR = null;
    if (!results.multiHandLandmarks) return;

    results.multiHandLandmarks.forEach((landmarks, i) => {
      const label = results.multiHandedness[i].label; // "Left" or "Right"
      const wrist = landmarks[0];
      
      // We mirror the video with CSS, so swap labels
      if (label === 'Right') {
        handL = { x: 1 - wrist.x, y: wrist.y };
      } else {
        handR = { x: 1 - wrist.x, y: wrist.y };
      }
    });
  });
}

export async function populateCameras() {
  try {
    await navigator.mediaDevices.getUserMedia({ video: true });
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    
    camSelect.innerHTML = '';
    videoDevices.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Camera ${i + 1}`;
      if (d.label.toLowerCase().includes('droid') || d.label.toLowerCase().includes('ip webcam')) {
        opt.selected = true;
      }
      camSelect.appendChild(opt);
    });
    
    if (videoDevices.length === 0) {
      camSelect.innerHTML = '<option value="">No cameras found</option>';
    }
    statusMsg.textContent = `${videoDevices.length} camera(s) found — select and press START`;
  } catch (err) {
    camSelect.innerHTML = '<option value="">Camera permission denied</option>';
    statusMsg.textContent = '⚠️ Camera access denied — check permissions';
  }
}

export async function startCamera(deviceId) {
  if (activeMpCamera) { 
    await activeMpCamera.stop(); 
    activeMpCamera = null; 
  }
  if (videoElem.srcObject) { 
    videoElem.srcObject.getTracks().forEach(t => t.stop()); 
    videoElem.srcObject = null; 
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: deviceId
      ? { deviceId: { exact: deviceId }, width: 640, height: 360 }
      : { width: 640, height: 360 }
  });
  videoElem.srcObject = stream;

  activeMpCamera = new window.Camera(videoElem, {
    onFrame: async () => {
      if (hands) {
        await hands.send({ image: videoElem });
      }
    },
    width: 640, height: 360
  });
  
  await activeMpCamera.start();
  statusMsg.textContent = '✋ Raise both hands to control the paddles';
}
