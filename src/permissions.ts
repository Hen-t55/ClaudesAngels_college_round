const grantBtn = document.getElementById('grant') as HTMLButtonElement | null;
const statusEl = document.getElementById('status');
const extIdEl = document.getElementById('ext-id');

if (extIdEl && typeof chrome !== 'undefined' && chrome.runtime?.id) {
  extIdEl.textContent = chrome.runtime.id;
}

async function requestPermissions() {
  if (!statusEl || !grantBtn) return;
  statusEl.textContent = 'Requesting permissions from browser...';
  statusEl.className = '';

  let videoOk = false;
  let audioOk = false;
  let videoErr = '';
  let audioErr = '';

  // 1. Try combined first
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    stream.getTracks().forEach((t) => t.stop());
    videoOk = true;
    audioOk = true;
  } catch (err: any) {
    // 2. If combined failed, try each individually to diagnose
    try {
      const vStream = await navigator.mediaDevices.getUserMedia({ video: true });
      vStream.getTracks().forEach((t) => t.stop());
      videoOk = true;
    } catch (ve: any) {
      videoErr = ve.name || ve.message || 'Denied / Not found';
    }

    try {
      const aStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      aStream.getTracks().forEach((t) => t.stop());
      audioOk = true;
    } catch (ae: any) {
      audioErr = ae.name || ae.message || 'Denied / Not found';
    }
  }

  if (videoOk && audioOk) {
    statusEl.textContent = '✓ All permissions granted! You can now close this tab and use Handsfree from the side panel.';
    statusEl.className = 'ok';
    grantBtn.disabled = true;
  } else if (videoOk && !audioOk) {
    statusEl.textContent = `✓ Camera granted. ⚠️ Microphone failed (${audioErr}). Check Chrome site settings or mic hardware.`;
    statusEl.style.color = '#f59e0b';
  } else if (!videoOk && audioOk) {
    statusEl.textContent = `✓ Microphone granted. ⚠️ Camera failed (${videoErr}). Keyboard simulator will be used for head input.`;
    statusEl.style.color = '#f59e0b';
  } else {
    statusEl.textContent = `✗ Permissions denied or blocked (Video: ${videoErr}, Audio: ${audioErr}). See manual settings below.`;
    statusEl.style.color = '#ef4444';
  }
}

if (grantBtn) {
  grantBtn.addEventListener('click', requestPermissions);
}

// Auto-check on load if already granted
if (navigator.permissions && navigator.permissions.query) {
  Promise.all([
    navigator.permissions.query({ name: 'camera' as any }).catch(() => null),
    navigator.permissions.query({ name: 'microphone' as any }).catch(() => null),
  ]).then(([cam, mic]) => {
    if (cam?.state === 'granted' && mic?.state === 'granted' && statusEl && grantBtn) {
      statusEl.textContent = '✓ Permissions are already granted! Ready to use.';
      statusEl.className = 'ok';
      grantBtn.disabled = true;
    }
  });
}
